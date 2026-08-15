/**
 * Modelo de dados e regras de negócio da fiscalização.
 */

import { put, get, getAll, getAllBy, remove, removeAllBy, uid } from './db.js';
import { ITENS, ITENS_POR_ID } from './checklist.js';

const CHAVE_ATUAL = 'fte:fiscalizacaoAtual';
const CHAVE_INSPETOR = 'fte:inspetor';

// ------------------------------------------------------------- fiscalizações

export function novaFiscalizacao(dados = {}) {
  const hoje = new Date();
  return {
    id: uid('fisc'),
    numero: '01',
    ano: String(hoje.getFullYear()),
    data: hoje.toISOString().slice(0, 10),
    hora: '08:00',
    municipio: '',
    local: '',
    promotoria: 'Promotoria de Justiça de Prado',
    orgaoMp: 'MINISTÉRIO PÚBLICO DO ESTADO DA BAHIA',
    promotor: '',
    apoio: 'Polícia Militar da Bahia — Companhia Independente de Polícia Rodoviária',
    equipe: '',
    conclusao: '',
    criadoEm: hoje.toISOString(),
    atualizadoEm: hoje.toISOString(),
    ...dados,
  };
}

export async function salvarFiscalizacao(f) {
  f.atualizadoEm = new Date().toISOString();
  await put('fiscalizacoes', f);
  return f;
}

export function listarFiscalizacoes() {
  return getAll('fiscalizacoes').then((l) =>
    l.sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''))
  );
}

export function obterFiscalizacao(id) {
  return get('fiscalizacoes', id);
}

export async function excluirFiscalizacao(id) {
  await removeAllBy('fotos', 'fiscalizacaoId', id);
  await removeAllBy('veiculos', 'fiscalizacaoId', id);
  await remove('fiscalizacoes', id);
  if (idFiscalizacaoAtual() === id) localStorage.removeItem(CHAVE_ATUAL);
}

export function idFiscalizacaoAtual() {
  return localStorage.getItem(CHAVE_ATUAL);
}

export function definirFiscalizacaoAtual(id) {
  if (id) localStorage.setItem(CHAVE_ATUAL, id);
  else localStorage.removeItem(CHAVE_ATUAL);
}

export function inspetorAtual() {
  return localStorage.getItem(CHAVE_INSPETOR) || '';
}

export function definirInspetor(nome) {
  localStorage.setItem(CHAVE_INSPETOR, nome || '');
}

// ------------------------------------------------------------------ veículos

export function novoVeiculo(fiscalizacaoId, ordem) {
  const agora = new Date().toISOString();
  return {
    id: uid('veic'),
    fiscalizacaoId,
    ordem,
    placa: '',
    tipo: 'Van',
    marcaModelo: '',
    ano: '',
    cor: '',
    renavam: '',
    lotacao: '',
    alunosBordo: '',
    permissionario: '',
    escolaRota: '',
    condutorNome: '',
    condutorCpf: '',
    condutorCnh: '',
    condutorCategoria: '',
    condutorValidadeCnh: '',
    condutorTelefone: '',
    monitorPossui: false,
    monitorNome: '',
    itens: {},
    obsGerais: '',
    autuado: false,
    autuacaoNumero: '',
    medida: 'Liberado',
    geo: null,
    inspetor: inspetorAtual(),
    criadoEm: agora,
    atualizadoEm: agora,
  };
}

export async function salvarVeiculo(v) {
  v.atualizadoEm = new Date().toISOString();
  v.placa = normalizarPlaca(v.placa);
  await put('veiculos', v);
  return v;
}

export function obterVeiculo(id) {
  return get('veiculos', id);
}

export function listarVeiculos(fiscalizacaoId) {
  return getAllBy('veiculos', 'fiscalizacaoId', fiscalizacaoId).then((l) =>
    l.sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
  );
}

export async function excluirVeiculo(id) {
  await removeAllBy('fotos', 'veiculoId', id);
  await remove('veiculos', id);
}

export async function proximaOrdem(fiscalizacaoId) {
  const lista = await listarVeiculos(fiscalizacaoId);
  return lista.reduce((max, v) => Math.max(max, v.ordem || 0), 0) + 1;
}

/** Renumera os veículos em sequência (usado após exclusões e importações). */
export async function renumerar(fiscalizacaoId) {
  const lista = await listarVeiculos(fiscalizacaoId);
  let n = 1;
  for (const v of lista) {
    if (v.ordem !== n) {
      v.ordem = n;
      await put('veiculos', v);
    }
    n += 1;
  }
  return lista.length;
}

// -------------------------------------------------------------------- placas

export function normalizarPlaca(placa) {
  return String(placa || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7);
}

const RE_ANTIGA = /^[A-Z]{3}[0-9]{4}$/;
const RE_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

export function placaValida(placa) {
  const p = normalizarPlaca(placa);
  return RE_ANTIGA.test(p) || RE_MERCOSUL.test(p);
}

export function formatarPlaca(placa) {
  const p = normalizarPlaca(placa);
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

// ------------------------------------------------------------- irregularidades

/** Lista de itens marcados como irregulares em um veículo. */
export function irregularidades(veiculo) {
  return ITENS.filter((item) => veiculo.itens?.[item.id]?.status === 'irregular').map((item) => ({
    item,
    obs: (veiculo.itens[item.id].obs || '').trim(),
  }));
}

export function contarIrregularidades(veiculo) {
  return irregularidades(veiculo).length;
}

export function itensVerificados(veiculo) {
  return Object.values(veiculo.itens || {}).filter((i) => i.status).length;
}

/**
 * Monta o texto do campo "Observações" do relatório, no padrão do modelo:
 * frases separadas por ponto e vírgula, a última ligada por "e", terminando
 * com ponto final.
 */
export function frasesIrregularidades(veiculo) {
  const partes = irregularidades(veiculo).map(({ item, obs }) =>
    obs ? `${item.frase} (${obs})` : item.frase
  );
  const extra = (veiculo.obsGerais || '').trim();
  if (extra) partes.push(extra.replace(/\.$/, ''));
  if (!partes.length) return 'Nenhuma irregularidade constatada.';
  let texto;
  if (partes.length === 1) texto = partes[0];
  else texto = `${partes.slice(0, -1).join('; ')}; e ${partes[partes.length - 1]}`;
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}.`;
}

/** Estatísticas consolidadas da fiscalização. */
export function consolidar(veiculos) {
  const contagem = new Map();
  let totalIrregularidades = 0;
  let regulares = 0;
  for (const v of veiculos) {
    const irr = irregularidades(v);
    if (!irr.length) regulares += 1;
    totalIrregularidades += irr.length;
    for (const { item } of irr) {
      contagem.set(item.id, (contagem.get(item.id) || 0) + 1);
    }
  }
  const ranking = [...contagem.entries()]
    .map(([id, qtd]) => ({ item: ITENS_POR_ID[id], qtd, pct: veiculos.length ? (qtd * 100) / veiculos.length : 0 }))
    .filter((r) => r.item)
    .sort((a, b) => b.qtd - a.qtd || a.item.titulo.localeCompare(b.item.titulo));
  return {
    totalVeiculos: veiculos.length,
    totalIrregularidades,
    regulares,
    irregulares: veiculos.length - regulares,
    autuados: veiculos.filter((v) => v.autuado).length,
    retidos: veiculos.filter((v) => /Retido|Removido|interrompido/i.test(v.medida || '')).length,
    ranking,
  };
}

// --------------------------------------------------------- backup / mesclagem

/** Aplica os dados de um veículo importado sobre a base local. */
export async function mesclarVeiculos(fiscalizacaoId, veiculosImportados) {
  const atuais = await listarVeiculos(fiscalizacaoId);
  const porPlaca = new Map(atuais.filter((v) => v.placa).map((v) => [v.placa, v]));
  let novos = 0;
  let atualizados = 0;
  let ignorados = 0;
  const mapaIds = {};
  let ordem = await proximaOrdem(fiscalizacaoId);

  for (const imp of veiculosImportados) {
    const placa = normalizarPlaca(imp.placa);
    const existente = placa ? porPlaca.get(placa) : null;
    if (existente) {
      if ((imp.atualizadoEm || '') > (existente.atualizadoEm || '')) {
        const preservado = { ...imp, id: existente.id, fiscalizacaoId, ordem: existente.ordem };
        await put('veiculos', preservado);
        mapaIds[imp.id] = existente.id;
        atualizados += 1;
      } else {
        mapaIds[imp.id] = existente.id;
        ignorados += 1;
      }
    } else {
      const novoId = uid('veic');
      const copia = { ...imp, id: novoId, fiscalizacaoId, ordem: ordem++, placa };
      await put('veiculos', copia);
      if (placa) porPlaca.set(placa, copia);
      mapaIds[imp.id] = novoId;
      novos += 1;
    }
  }
  return { novos, atualizados, ignorados, mapaIds };
}
