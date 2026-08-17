/**
 * Geração do relatório final de fiscalização.
 *
 * A estrutura reproduz o padrão do "RELATÓRIO DE FISCALIZAÇÃO – Nº 01/2026",
 * acrescida de quadro-resumo estatístico, anexo fotográfico e campo de
 * providências/conclusão.
 */

import { frasesIrregularidades, consolidar, formatarPlaca, irregularidades } from './store.js';
import { GRAVIDADE_LABEL } from './checklist.js';
import { fotosDaFiscalizacao, blobParaDataURL } from './fotos.js';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function dataPorExtenso(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  return `${String(d).padStart(2, '0')} de ${meses[m - 1]} de ${a}`;
}

export function dataCurta(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function num2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Monta o HTML completo do relatório.
 * @param {object} opts.comFotos inclui o anexo fotográfico (data URLs)
 */
export async function montarRelatorio(fisc, veiculos, opts = {}) {
  const { comFotos = true } = opts;
  const stats = consolidar(veiculos);

  let fotosPorVeiculo = new Map();
  if (comFotos) {
    const fotos = await fotosDaFiscalizacao(fisc.id);
    for (const f of fotos) {
      if (!fotosPorVeiculo.has(f.veiculoId)) fotosPorVeiculo.set(f.veiculoId, []);
      fotosPorVeiculo.get(f.veiculoId).push(f);
    }
    for (const [id, lista] of fotosPorVeiculo) {
      const comURL = [];
      for (const f of lista.sort((a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || ''))) {
        comURL.push({ ...f, url: await blobParaDataURL(f.blob) });
      }
      fotosPorVeiculo.set(id, comURL);
    }
  }

  const cabecalho = `
    <header class="cabecalho">
      <div class="orgao">${esc(fisc.orgaoMp)}</div>
      <div class="orgao">${esc(fisc.promotoria)}</div>
      ${fisc.apoio ? `<div class="apoio">Apoio operacional: ${esc(fisc.apoio)}</div>` : ''}
      <h1>RELATÓRIO DE FISCALIZAÇÃO – Nº ${esc(fisc.numero)}/${esc(fisc.ano)}</h1>
      <div class="subtitulo">Transporte escolar — ${esc(fisc.municipio || 'município não informado')}</div>
    </header>`;

  const preambulo = `
    <p class="preambulo">
      Em atendimento à determinação da ${esc(fisc.promotoria)}, foi realizada fiscalização nos veículos
      abaixo elencados, a fim de averiguar as condições de segurança, a regularidade da documentação,
      o atendimento aos requisitos previstos na legislação de trânsito e demais normas aplicáveis ao
      transporte escolar do município de ${esc(fisc.municipio || '—')}.
    </p>`;

  const identificacao = `
    <table class="dados">
      <tbody>
        <tr><th>DATA</th><td>${esc(dataCurta(fisc.data))}</td></tr>
        <tr><th>HORÁRIO</th><td>${esc(fisc.hora)}</td></tr>
        <tr><th>MUNICÍPIO</th><td>${esc(fisc.municipio)}</td></tr>
        ${fisc.local ? `<tr><th>LOCAL</th><td>${esc(fisc.local)}</td></tr>` : ''}
        <tr><th>QUANTITATIVO DE VEÍCULOS</th><td>${stats.totalVeiculos}</td></tr>
        ${fisc.equipe ? `<tr><th>EQUIPE</th><td>${esc(fisc.equipe)}</td></tr>` : ''}
      </tbody>
    </table>`;

  const resumo = `
    <section>
      <h2>1. SÍNTESE DO RESULTADO</h2>
      <table class="dados">
        <tbody>
          <tr><th>Veículos fiscalizados</th><td>${stats.totalVeiculos}</td></tr>
          <tr><th>Veículos com irregularidades</th><td>${stats.irregulares} (${pct(stats.irregulares, stats.totalVeiculos)})</td></tr>
          <tr><th>Veículos sem irregularidades</th><td>${stats.regulares} (${pct(stats.regulares, stats.totalVeiculos)})</td></tr>
          <tr><th>Total de irregularidades constatadas</th><td>${stats.totalIrregularidades}</td></tr>
          <tr><th>Veículos autuados</th><td>${stats.autuados}</td></tr>
          <tr><th>Veículos retidos/removidos</th><td>${stats.retidos}</td></tr>
        </tbody>
      </table>

      <h3>1.1. Irregularidades por incidência</h3>
      ${
        stats.ranking.length
          ? `<table class="ranking">
              <thead><tr><th>#</th><th>Irregularidade</th><th>Base normativa</th><th>Nat.</th><th>Veíc.</th><th>%</th></tr></thead>
              <tbody>
                ${stats.ranking
                  .map(
                    (r, i) => `<tr>
                      <td>${i + 1}</td>
                      <td>${esc(r.item.titulo)}</td>
                      <td class="base">${esc(r.item.base || '')}</td>
                      <td>${esc(GRAVIDADE_LABEL[r.item.gravidade] || '')}</td>
                      <td class="num">${r.qtd}</td>
                      <td class="num">${r.pct.toFixed(0)}%</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
          : '<p>Não foram constatadas irregularidades.</p>'
      }
    </section>`;

  const listaVeiculos = `
    <section>
      <h2>2. VEÍCULOS ABORDADOS</h2>
      ${veiculos
        .map((v, i) => {
          const linhas = [];
          const ident = [v.tipo, v.marcaModelo, v.ano, v.cor].filter(Boolean).join(' — ');
          if (ident) linhas.push(`<div class="linha"><b>Veículo:</b> ${esc(ident)}</div>`);
          if (v.permissionario) linhas.push(`<div class="linha"><b>Permissionário/empresa:</b> ${esc(v.permissionario)}</div>`);
          if (v.escolaRota) linhas.push(`<div class="linha"><b>Rota/escola:</b> ${esc(v.escolaRota)}</div>`);
          const cond = [v.condutorNome, v.condutorCpf ? `CPF ${v.condutorCpf}` : '', v.condutorCnh ? `CNH ${v.condutorCnh}${v.condutorCategoria ? ` cat. ${v.condutorCategoria}` : ''}` : '']
            .filter(Boolean)
            .join(' — ');
          if (cond) linhas.push(`<div class="linha"><b>Condutor:</b> ${esc(cond)}</div>`);
          if (v.lotacao || v.alunosBordo) {
            linhas.push(
              `<div class="linha"><b>Lotação:</b> ${esc(v.lotacao || '—')} — <b>escolares a bordo:</b> ${esc(v.alunosBordo || '—')}</div>`
            );
          }
          if (v.monitorPossui) linhas.push(`<div class="linha"><b>Monitor:</b> ${esc(v.monitorNome || 'presente')}</div>`);
          if (v.autuado) linhas.push(`<div class="linha"><b>Autuação:</b> ${esc(v.autuacaoNumero || 'lavrada')}</div>`);
          if (v.medida && v.medida !== 'Liberado') linhas.push(`<div class="linha"><b>Medida adotada:</b> ${esc(v.medida)}</div>`);

          const fotos = fotosPorVeiculo.get(v.id) || [];
          const qtdIrr = irregularidades(v).length;
          return `
            <article class="veiculo">
              <h3>Veículo ${num2(v.ordem || i + 1)}</h3>
              <div class="linha"><b>Placa:</b> ${esc(formatarPlaca(v.placa) || 'não identificada')}</div>
              ${linhas.join('')}
              <div class="obs"><b>${qtdIrr === 1 ? 'Observação' : 'Observações'}:</b> ${esc(frasesIrregularidades(v))}</div>
              ${
                fotos.length
                  ? `<div class="linha fotos-ref">Registro fotográfico: ${fotos.length} imagem(ns) — Anexo I.</div>`
                  : ''
              }
            </article>`;
        })
        .join('')}
    </section>`;

  const conclusao = fisc.conclusao?.trim()
    ? `<section>
         <h2>3. CONCLUSÃO E PROVIDÊNCIAS</h2>
         ${fisc.conclusao
           .trim()
           .split(/\n{2,}/)
           .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
           .join('')}
       </section>`
    : '';

  const anexo =
    comFotos && fotosPorVeiculo.size
      ? `<section class="anexo">
           <h2>ANEXO I — REGISTRO FOTOGRÁFICO</h2>
           ${veiculos
             .map((v, i) => {
               const fotos = fotosPorVeiculo.get(v.id) || [];
               if (!fotos.length) return '';
               return `
                 <div class="grupo-fotos">
                   <h3>Veículo ${num2(v.ordem || i + 1)} — Placa ${esc(formatarPlaca(v.placa) || '—')}</h3>
                   <div class="grade-fotos">
                     ${fotos
                       .map(
                         (f, j) => `<figure>
                            <img src="${f.url}" alt="Veículo ${num2(v.ordem || i + 1)} foto ${j + 1}">
                            <figcaption>Foto ${j + 1}${f.tipo && f.tipo !== 'outra' ? ` — ${esc(f.tipo)}` : ''}${f.legenda ? ` — ${esc(f.legenda)}` : ''}</figcaption>
                          </figure>`
                       )
                       .join('')}
                   </div>
                 </div>`;
             })
             .join('')}
         </section>`
      : '';

  const assinaturas = `
    <section class="assinaturas">
      <p class="fecho">Respeitosamente,</p>
      <div class="assinatura">
        <div class="linha-assinatura"></div>
        <div>${esc(fisc.promotor || 'Promotor(a) de Justiça')}</div>
        <div class="cargo">${esc(fisc.promotoria)}</div>
      </div>
      <div class="assinatura">
        <div class="linha-assinatura"></div>
        <div>Responsável pelo apoio operacional</div>
        <div class="cargo">${esc(fisc.apoio || '')}</div>
      </div>
      <p class="rodape-doc">${esc(fisc.municipio || '')}${fisc.municipio ? ', ' : ''}${esc(dataPorExtenso(fisc.data))}.</p>
    </section>`;

  return `${cabecalho}${preambulo}${identificacao}${resumo}${listaVeiculos}${conclusao}${anexo}${assinaturas}`;
}

function pct(parte, total) {
  if (!total) return '0%';
  return `${((parte * 100) / total).toFixed(0)}%`;
}

/**
 * Relatório consolidado de várias fiscalizações.
 *
 * Reúne todas as operações registradas no aparelho num documento único, com a
 * síntese geral, o ranking agregado, cada fiscalização na íntegra e — o dado que
 * só aparece no consolidado — a relação de veículos reincidentes, isto é, as
 * placas autuadas em mais de uma operação.
 *
 * @param blocos [{fisc, veiculos}] em ordem cronológica
 */
export async function montarRelatorioConsolidado(blocos, opts = {}) {
  const { comFotos = false, cabecalhoDe = null, conclusao = '' } = opts;
  const todos = blocos.flatMap((b) => b.veiculos);
  const geral = consolidar(todos);
  const base = cabecalhoDe || blocos[0]?.fisc || {};
  const datas = blocos.map((b) => b.fisc.data).filter(Boolean).sort();
  const municipios = [...new Set(blocos.map((b) => b.fisc.municipio).filter(Boolean))];

  const cabecalho = `
    <header class="cabecalho">
      <div class="orgao">${esc(base.orgaoMp || '')}</div>
      <div class="orgao">${esc(base.promotoria || '')}</div>
      <h1>RELATÓRIO CONSOLIDADO DE FISCALIZAÇÃO DO TRANSPORTE ESCOLAR</h1>
      <div class="subtitulo">
        ${blocos.length} fiscalização(ões)${municipios.length ? ` — ${esc(municipios.join(', '))}` : ''}
      </div>
    </header>
    <p class="preambulo">
      O presente documento consolida as fiscalizações do transporte escolar realizadas
      ${datas.length ? `entre ${esc(dataCurta(datas[0]))} e ${esc(dataCurta(datas[datas.length - 1]))}` : ''},
      sob a coordenação da ${esc(base.promotoria || 'Promotoria de Justiça')}, reunindo
      ${geral.totalVeiculos} veículo(s) abordado(s) e ${geral.totalIrregularidades}
      irregularidade(s) constatada(s).
    </p>`;

  const sintese = `
    <section>
      <h2>1. SÍNTESE GERAL</h2>
      <table class="dados">
        <tbody>
          <tr><th>Fiscalizações realizadas</th><td>${blocos.length}</td></tr>
          <tr><th>Municípios</th><td>${esc(municipios.join(', ') || '—')}</td></tr>
          <tr><th>Veículos abordados</th><td>${geral.totalVeiculos}</td></tr>
          <tr><th>Veículos com irregularidades</th><td>${geral.irregulares} (${pct(geral.irregulares, geral.totalVeiculos)})</td></tr>
          <tr><th>Veículos sem irregularidades</th><td>${geral.regulares} (${pct(geral.regulares, geral.totalVeiculos)})</td></tr>
          <tr><th>Total de irregularidades</th><td>${geral.totalIrregularidades}</td></tr>
          <tr><th>Média de irregularidades por veículo</th><td>${
            geral.totalVeiculos ? (geral.totalIrregularidades / geral.totalVeiculos).toFixed(1) : '0'
          }</td></tr>
          <tr><th>Veículos autuados</th><td>${geral.autuados}</td></tr>
          <tr><th>Veículos retidos/removidos</th><td>${geral.retidos}</td></tr>
        </tbody>
      </table>

      <h3>1.1. Fiscalizações reunidas</h3>
      <table class="ranking">
        <thead><tr><th>Relatório</th><th>Data</th><th>Município</th><th>Veíc.</th><th>Irreg.</th></tr></thead>
        <tbody>
          ${blocos
            .map((b) => {
              const s = consolidar(b.veiculos);
              return `<tr>
                <td>${esc(b.fisc.numero)}/${esc(b.fisc.ano)}</td>
                <td>${esc(dataCurta(b.fisc.data))}</td>
                <td>${esc(b.fisc.municipio || '—')}</td>
                <td class="num">${s.totalVeiculos}</td>
                <td class="num">${s.totalIrregularidades}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </section>

    <section>
      <h2>2. IRREGULARIDADES POR INCIDÊNCIA (todas as fiscalizações)</h2>
      ${
        geral.ranking.length
          ? `<table class="ranking">
              <thead><tr><th>#</th><th>Irregularidade</th><th>Base normativa</th><th>Nat.</th><th>Veíc.</th><th>%</th></tr></thead>
              <tbody>
                ${geral.ranking
                  .map(
                    (r, i) => `<tr>
                      <td>${i + 1}</td>
                      <td>${esc(r.item.titulo)}</td>
                      <td class="base">${esc(r.item.base || '')}</td>
                      <td>${esc(GRAVIDADE_LABEL[r.item.gravidade] || '')}</td>
                      <td class="num">${r.qtd}</td>
                      <td class="num">${r.pct.toFixed(0)}%</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
          : '<p>Não foram constatadas irregularidades.</p>'
      }
    </section>`;

  // Reincidência: mesma placa em mais de uma fiscalização.
  const porPlaca = new Map();
  for (const b of blocos) {
    for (const v of b.veiculos) {
      const p = formatarPlaca(v.placa);
      if (!p) continue;
      if (!porPlaca.has(p)) porPlaca.set(p, []);
      porPlaca.get(p).push({ fisc: b.fisc, veiculo: v });
    }
  }
  const reincidentes = [...porPlaca.entries()]
    .filter(([, ocorr]) => new Set(ocorr.map((o) => o.fisc.id)).size > 1)
    .sort((a, b) => b[1].length - a[1].length);

  const reincidencia = `
    <section>
      <h2>3. VEÍCULOS REINCIDENTES</h2>
      ${
        reincidentes.length
          ? `<p>
               Os veículos abaixo foram abordados em mais de uma fiscalização, o que
               permite aferir a persistência das irregularidades e a efetividade das
               providências anteriormente adotadas.
             </p>
             <table class="ranking">
               <thead><tr><th>Placa</th><th>Abordagens</th><th>Histórico</th></tr></thead>
               <tbody>
                 ${reincidentes
                   .map(
                     ([placa, ocorr]) => `<tr>
                       <td>${esc(placa)}</td>
                       <td class="num">${ocorr.length}</td>
                       <td class="base">${ocorr
                         .map(
                           (o) =>
                             `${esc(dataCurta(o.fisc.data))}: ${irregularidades(o.veiculo).length} irregularidade(s)`
                         )
                         .join('; ')}</td>
                     </tr>`
                   )
                   .join('')}
               </tbody>
             </table>`
          : '<p>Nenhum veículo foi abordado em mais de uma fiscalização.</p>'
      }
    </section>`;

  let corpo = '';
  let n = 4;
  for (const bloco of blocos) {
    const interno = await montarRelatorio(bloco.fisc, bloco.veiculos, { comFotos });
    // Reaproveita a redação oficial de cada fiscalização, sem o cabeçalho e as
    // assinaturas, que no consolidado aparecem uma única vez.
    const semCabecalho = interno
      .replace(/<header class="cabecalho">[\s\S]*?<\/header>/, '')
      .replace(/<section class="assinaturas">[\s\S]*?<\/section>/, '')
      .replace(/<h2>1\. SÍNTESE DO RESULTADO<\/h2>/, '<h3>Síntese</h3>')
      .replace(/<h2>2\. VEÍCULOS ABORDADOS<\/h2>/, '<h3>Veículos abordados</h3>')
      .replace(/<h2>3\. CONCLUSÃO E PROVIDÊNCIAS<\/h2>/, '<h3>Conclusão da operação</h3>')
      .replace(/<h3>1\.1\. Irregularidades por incidência<\/h3>/, '<h4>Irregularidades por incidência</h4>');
    corpo += `
      <section>
        <h2>${n}. FISCALIZAÇÃO Nº ${esc(bloco.fisc.numero)}/${esc(bloco.fisc.ano)} — ${esc(
      bloco.fisc.municipio || '—'
    )}</h2>
        ${semCabecalho}
      </section>`;
    n += 1;
  }

  const fecho = `
    ${
      conclusao.trim()
        ? `<section>
             <h2>${n}. CONCLUSÃO CONSOLIDADA</h2>
             ${conclusao
               .trim()
               .split(/\n{2,}/)
               .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
               .join('')}
           </section>`
        : ''
    }
    <section class="assinaturas">
      <p class="fecho">Respeitosamente,</p>
      <div class="assinatura">
        <div class="linha-assinatura"></div>
        <div>${esc(base.promotor || 'Promotor(a) de Justiça')}</div>
        <div class="cargo">${esc(base.promotoria || '')}</div>
      </div>
      <p class="rodape-doc">${esc(municipios[0] || '')}${municipios[0] ? ', ' : ''}${esc(
    dataPorExtenso(new Date().toISOString().slice(0, 10))
  )}.</p>
    </section>`;

  return `${cabecalho}${sintese}${reincidencia}${corpo}${fecho}`;
}

/** CSS aplicado tanto na visualização quanto na impressão/exportação. */
export const CSS_RELATORIO = `
  .documento { font-family: "Times New Roman", Georgia, serif; color: #000; background: #fff; line-height: 1.45; font-size: 12pt; }
  .documento .cabecalho { text-align: center; margin-bottom: 18px; }
  .documento .orgao { font-weight: bold; text-transform: uppercase; font-size: 11pt; letter-spacing: .3px; }
  .documento .apoio { font-size: 10pt; margin-top: 4px; }
  .documento h1 { font-size: 13pt; margin: 16px 0 4px; text-transform: uppercase; }
  .documento .subtitulo { font-size: 11pt; font-style: italic; }
  .documento h2 { font-size: 12pt; margin: 20px 0 8px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 3px; }
  .documento h3 { font-size: 11.5pt; margin: 14px 0 4px; }
  .documento p { text-align: justify; margin: 8px 0; }
  .documento .preambulo { text-indent: 2cm; }
  .documento table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 10.5pt; }
  .documento table th, .documento table td { border: 1px solid #444; padding: 4px 6px; text-align: left; vertical-align: top; }
  .documento table.dados th { width: 38%; background: #f0f0f0; }
  .documento table.ranking thead th { background: #f0f0f0; }
  .documento table .num { text-align: right; }
  .documento table .base { font-size: 9.5pt; }
  .documento .veiculo { margin: 0 0 14px; page-break-inside: avoid; }
  .documento .veiculo h3 { margin-bottom: 2px; }
  .documento .linha { font-size: 11pt; }
  .documento .obs { margin-top: 4px; text-align: justify; }
  .documento .fotos-ref { font-style: italic; font-size: 10pt; }
  .documento .grade-fotos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .documento figure { margin: 0; page-break-inside: avoid; }
  .documento figure img { width: 100%; height: auto; border: 1px solid #666; }
  .documento figcaption { font-size: 9.5pt; text-align: center; }
  .documento .grupo-fotos { margin-bottom: 16px; page-break-inside: avoid; }
  .documento .assinaturas { margin-top: 36px; text-align: center; }
  .documento .fecho { text-align: center; }
  .documento .assinatura { margin: 28px auto 0; width: 70%; }
  .documento .linha-assinatura { border-top: 1px solid #000; margin-bottom: 4px; }
  .documento .cargo { font-size: 10pt; }
  .documento .rodape-doc { margin-top: 28px; text-align: center; font-size: 11pt; }
  @page { size: A4; margin: 2.5cm 2cm; }
`;

/** Documento independente (usado no .doc e no HTML exportado). */
export function documentoCompleto(html, titulo) {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>${CSS_RELATORIO}</style>
</head>
<body><div class="documento">${html}</div></body>
</html>`;
}

/** Planilha CSV com uma linha por veículo e colunas de irregularidades. */
export function gerarCSV(fisc, veiculos, itens) {
  const sep = ';';
  const cabecalho = [
    'Nº', 'Placa', 'Tipo', 'Marca/Modelo', 'Ano', 'Permissionário', 'Rota/Escola',
    'Condutor', 'CPF', 'CNH', 'Categoria', 'Lotação', 'Escolares a bordo',
    'Monitor', 'Qtd. irregularidades', 'Autuado', 'Nº autuação', 'Medida', 'Observações',
    ...itens.map((i) => i.titulo),
  ];
  const linhas = veiculos.map((v) => {
    const base = [
      v.ordem, formatarPlaca(v.placa), v.tipo, v.marcaModelo, v.ano, v.permissionario, v.escolaRota,
      v.condutorNome, v.condutorCpf, v.condutorCnh, v.condutorCategoria, v.lotacao, v.alunosBordo,
      v.monitorPossui ? (v.monitorNome || 'Sim') : 'Não',
      irregularidades(v).length, v.autuado ? 'Sim' : 'Não', v.autuacaoNumero, v.medida,
      frasesIrregularidades(v),
    ];
    const status = itens.map((i) => {
      const s = v.itens?.[i.id];
      if (!s?.status) return '';
      const rotulo = { conforme: 'Conforme', irregular: 'IRREGULAR', na: 'N/A' }[s.status] || '';
      return s.obs ? `${rotulo} - ${s.obs}` : rotulo;
    });
    return [...base, ...status];
  });
  const escapar = (c) => {
    const s = String(c ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${[cabecalho, ...linhas].map((l) => l.map(escapar).join(sep)).join('\r\n')}`;
}
