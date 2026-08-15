/**
 * Pacote da fiscalização para leitura por inteligência artificial.
 *
 * Gera um .zip com as fotografias nomeadas de forma previsível, os dados
 * estruturados em JSON e um resumo em texto. É o formato para entregar a um
 * assistente que vá extrair dados dos documentos fotografados (CNH, CRLV,
 * autorização) ou redigir peças a partir do apurado.
 *
 * O .zip é escrito aqui mesmo, sem biblioteca externa: os arquivos entram sem
 * compressão (JPEG já é comprimido) usando o formato ZIP mais simples.
 */

import { irregularidades, frasesIrregularidades, consolidar, formatarPlaca } from './store.js';
import { fotosDaFiscalizacao } from './fotos.js';
import { ITENS, GRAVIDADE_LABEL } from './checklist.js';
import { dataCurta } from './relatorio.js';

// ------------------------------------------------------------------- zip

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataDos(d = new Date()) {
  const hora = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const dia = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  return { hora, dia };
}

/** @param arquivos [{nome: string, dados: Uint8Array}] */
export function zip(arquivos) {
  const codificador = new TextEncoder();
  const { hora, dia } = dataDos();
  const partes = [];
  const central = [];
  let deslocamento = 0;

  for (const { nome, dados } of arquivos) {
    const nomeBytes = codificador.encode(nome);
    const crc = crc32(dados);

    const cabecalho = new DataView(new ArrayBuffer(30));
    cabecalho.setUint32(0, 0x04034b50, true);
    cabecalho.setUint16(4, 20, true); // versão necessária
    cabecalho.setUint16(6, 0x0800, true); // nomes em UTF-8
    cabecalho.setUint16(8, 0, true); // sem compressão
    cabecalho.setUint16(10, hora, true);
    cabecalho.setUint16(12, dia, true);
    cabecalho.setUint32(14, crc, true);
    cabecalho.setUint32(18, dados.length, true);
    cabecalho.setUint32(22, dados.length, true);
    cabecalho.setUint16(26, nomeBytes.length, true);
    cabecalho.setUint16(28, 0, true);
    partes.push(new Uint8Array(cabecalho.buffer), nomeBytes, dados);

    const registro = new DataView(new ArrayBuffer(46));
    registro.setUint32(0, 0x02014b50, true);
    registro.setUint16(4, 20, true);
    registro.setUint16(6, 20, true);
    registro.setUint16(8, 0x0800, true);
    registro.setUint16(10, 0, true);
    registro.setUint16(12, hora, true);
    registro.setUint16(14, dia, true);
    registro.setUint32(16, crc, true);
    registro.setUint32(20, dados.length, true);
    registro.setUint32(24, dados.length, true);
    registro.setUint16(28, nomeBytes.length, true);
    registro.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(registro.buffer), nomeBytes);

    deslocamento += 30 + nomeBytes.length + dados.length;
  }

  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);

  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/zip' });
}

// ---------------------------------------------------------------- pacote

function semAcento(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

const doisDigitos = (n) => String(n).padStart(2, '0');

/** Dados de um veículo já traduzidos para leitura por terceiros. */
function veiculoParaPacote(v, fotos) {
  const irr = irregularidades(v);
  return {
    ordem: v.ordem,
    placa: formatarPlaca(v.placa),
    tipo: v.tipo,
    marcaModelo: v.marcaModelo || null,
    ano: v.ano || null,
    cor: v.cor || null,
    lotacao: v.lotacao || null,
    escolaresABordo: v.alunosBordo || null,
    permissionario: v.permissionario || null,
    rotaEscola: v.escolaRota || null,
    condutor: {
      nome: v.condutorNome || null,
      cpf: v.condutorCpf || null,
      cnh: v.condutorCnh || null,
      categoriaCnh: v.condutorCategoria || null,
      validadeCnh: v.condutorValidadeCnh || null,
      telefone: v.condutorTelefone || null,
    },
    monitor: { presente: !!v.monitorPossui, nome: v.monitorNome || null },
    irregularidades: irr.map(({ item, obs }) => ({
      id: item.id,
      titulo: item.titulo,
      fraseParaRelatorio: item.frase,
      baseLegal: item.base,
      natureza: GRAVIDADE_LABEL[item.gravidade] || null,
      detalhe: obs || null,
    })),
    observacoesFinais: frasesIrregularidades(v),
    observacoesLivres: v.obsGerais || null,
    autuado: !!v.autuado,
    numeroAutuacao: v.autuacaoNumero || null,
    medidaAdotada: v.medida || null,
    agente: v.inspetor || null,
    coordenadas: v.geo ? { latitude: v.geo.lat, longitude: v.geo.lng } : null,
    registradoEm: v.criadoEm,
    atualizadoEm: v.atualizadoEm,
    fotos: fotos.map((f) => f.arquivo),
  };
}

const INSTRUCOES = `# Instruções para o assistente

Este pacote é o produto de uma fiscalização de transporte escolar conduzida pelo
Ministério Público, com apoio da Polícia Militar.

## Conteúdo

- \`dados.json\` — todos os dados coletados em campo, um objeto por veículo,
  com as irregularidades já classificadas e a base legal de cada uma.
- \`resumo.md\` — a mesma informação em texto corrido.
- \`fotos/\` — as fotografias, nomeadas como
  \`veiculo-NN_PLACA_tipo_i.jpg\`. O trecho \`tipo\` indica o que o agente
  registrou: \`documento\`, \`placa\`, \`faixa\`, \`interior\`, \`irregularidade\`
  ou \`outra\`.

## Tarefas usuais

1. **Extrair dados dos documentos**: nas fotos marcadas como \`documento\`, ler
   CNH (número, categoria, validade, nome e CPF do condutor), CRLV (placa,
   RENAVAM, marca/modelo, ano, categoria) e a autorização para transporte
   escolar. Devolver em JSON, indicando o arquivo de origem de cada campo.
2. **Conferir contra o coletado**: comparar o que foi lido com os campos de
   \`dados.json\` e apontar divergências, em vez de sobrescrever.
3. **Não inventar**: campo ilegível deve voltar como \`null\`, com a observação
   de que a foto não permite a leitura. Trata-se de instrução de documento
   oficial — dado presumido compromete o relatório.

## Cuidado

O material contém dados pessoais (nome, CPF, CNH, imagem). Trate-o conforme a
LGPD e as normas de sigilo do Ministério Público.
`;

function resumoMarkdown(fisc, veiculos, stats) {
  const linhas = [];
  linhas.push(`# Fiscalização do transporte escolar — ${fisc.municipio || 'município não informado'}`);
  linhas.push('');
  linhas.push(`- Relatório nº ${fisc.numero}/${fisc.ano}`);
  linhas.push(`- Data: ${dataCurta(fisc.data)} às ${fisc.hora}`);
  if (fisc.local) linhas.push(`- Local: ${fisc.local}`);
  linhas.push(`- Promotoria: ${fisc.promotoria}`);
  linhas.push(`- Veículos fiscalizados: ${stats.totalVeiculos}`);
  linhas.push(`- Veículos com irregularidade: ${stats.irregulares}`);
  linhas.push(`- Total de irregularidades: ${stats.totalIrregularidades}`);
  linhas.push('');
  linhas.push('## Irregularidades por incidência');
  linhas.push('');
  linhas.push('| Irregularidade | Base legal | Veículos |');
  linhas.push('| --- | --- | --- |');
  for (const r of stats.ranking) linhas.push(`| ${r.item.titulo} | ${r.item.base} | ${r.qtd} |`);
  linhas.push('');
  linhas.push('## Veículos');
  for (const v of veiculos) {
    linhas.push('');
    linhas.push(`### Veículo ${doisDigitos(v.ordem)} — ${formatarPlaca(v.placa) || 'sem placa'}`);
    const ident = [v.tipo, v.marcaModelo, v.ano].filter(Boolean).join(' — ');
    if (ident) linhas.push(`- Veículo: ${ident}`);
    if (v.condutorNome) linhas.push(`- Condutor: ${v.condutorNome}`);
    if (v.permissionario) linhas.push(`- Permissionário: ${v.permissionario}`);
    if (v.escolaRota) linhas.push(`- Rota/escola: ${v.escolaRota}`);
    linhas.push(`- Observações: ${frasesIrregularidades(v)}`);
    if (v.autuado) linhas.push(`- Auto de infração: ${v.autuacaoNumero || 'lavrado'}`);
    if (v.medida && v.medida !== 'Liberado') linhas.push(`- Medida: ${v.medida}`);
  }
  return linhas.join('\n');
}

/**
 * Monta o pacote completo.
 * @returns {{blob: Blob, nome: string, arquivos: number, fotos: number}}
 */
export async function gerarPacoteIA(fisc, veiculos, { comFotos = true } = {}) {
  const codificador = new TextEncoder();
  const stats = consolidar(veiculos);
  const arquivos = [];

  // Fotos, nomeadas de modo que o assistente saiba o que está vendo.
  const porVeiculo = new Map();
  if (comFotos) {
    const todas = await fotosDaFiscalizacao(fisc.id);
    for (const f of todas) {
      if (!porVeiculo.has(f.veiculoId)) porVeiculo.set(f.veiculoId, []);
      porVeiculo.get(f.veiculoId).push(f);
    }
    for (const v of veiculos) {
      const lista = (porVeiculo.get(v.id) || []).sort((a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || ''));
      const marcadas = [];
      let i = 1;
      for (const f of lista) {
        const nome = `fotos/veiculo-${doisDigitos(v.ordem)}_${semAcento(v.placa) || 'sem-placa'}_${semAcento(f.tipo) || 'outra'}_${i}.jpg`;
        arquivos.push({ nome, dados: new Uint8Array(await f.blob.arrayBuffer()) });
        marcadas.push({ arquivo: nome, tipo: f.tipo || 'outra', legenda: f.legenda || null });
        i += 1;
      }
      porVeiculo.set(v.id, marcadas);
    }
  }

  const dados = {
    formato: 'fiscalizacao-transporte-escolar/pacote-ia/1',
    geradoEm: new Date().toISOString(),
    fiscalizacao: {
      numero: fisc.numero,
      ano: fisc.ano,
      data: fisc.data,
      hora: fisc.hora,
      municipio: fisc.municipio,
      local: fisc.local || null,
      orgao: fisc.orgaoMp,
      promotoria: fisc.promotoria,
      promotor: fisc.promotor || null,
      apoio: fisc.apoio || null,
      equipe: fisc.equipe || null,
    },
    resumo: {
      veiculosFiscalizados: stats.totalVeiculos,
      veiculosComIrregularidade: stats.irregulares,
      totalIrregularidades: stats.totalIrregularidades,
      veiculosAutuados: stats.autuados,
      porIncidencia: stats.ranking.map((r) => ({
        id: r.item.id,
        titulo: r.item.titulo,
        baseLegal: r.item.base,
        veiculos: r.qtd,
      })),
    },
    catalogoDeItens: ITENS.map((i) => ({
      id: i.id,
      titulo: i.titulo,
      baseLegal: i.base,
      natureza: GRAVIDADE_LABEL[i.gravidade] || null,
    })),
    veiculos: veiculos.map((v) => veiculoParaPacote(v, porVeiculo.get(v.id) || [])),
  };

  arquivos.push({ nome: 'dados.json', dados: codificador.encode(JSON.stringify(dados, null, 2)) });
  arquivos.push({ nome: 'resumo.md', dados: codificador.encode(resumoMarkdown(fisc, veiculos, stats)) });
  arquivos.push({ nome: 'instrucoes-para-a-ia.md', dados: codificador.encode(INSTRUCOES) });

  const nome = `fiscalizacao-${fisc.numero}-${fisc.ano}-${semAcento(fisc.municipio) || 'municipio'}-pacote-ia.zip`;
  return {
    blob: zip(arquivos),
    nome,
    arquivos: arquivos.length,
    fotos: arquivos.filter((a) => a.nome.startsWith('fotos/')).length,
  };
}
