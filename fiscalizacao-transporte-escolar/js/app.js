/**
 * Aplicativo de Fiscalização do Transporte Escolar — interface.
 *
 * Funciona inteiramente no aparelho (offline). Navegação por hash:
 *   #/            início
 *   #/dados-fisc  dados da fiscalização
 *   #/veiculos    lista de veículos
 *   #/veiculo/ID  ficha do veículo
 *   #/relatorio   relatório final
 *   #/equipe      sincronização da equipe e backup em arquivo
 */

import { GRUPOS, ITENS, TIPOS_VEICULO, MEDIDAS, GRAVIDADE_LABEL } from './checklist.js';
import * as store from './store.js';
import * as fotosApi from './fotos.js';
import { uso } from './db.js';
import { montarRelatorio, documentoCompleto, gerarCSV, esc, dataCurta, CSS_RELATORIO } from './relatorio.js';
import * as backup from './backup.js';
import * as nuvem from './nuvem.js';

const app = document.getElementById('app');
const areaImpressao = document.getElementById('area-impressao');
const btnStatusNuvem = document.getElementById('status-nuvem');

let fisc = null; // fiscalização atual
let urlsTemporarias = [];

// ------------------------------------------------------------------ utilidades

function toast(msg, tipo = 'ok') {
  const t = document.createElement('div');
  t.className = `toast toast--${tipo}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visivel'));
  setTimeout(() => {
    t.classList.remove('visivel');
    setTimeout(() => t.remove(), 300);
  }, 3200);
}

function liberarURLs() {
  urlsTemporarias.forEach((u) => URL.revokeObjectURL(u));
  urlsTemporarias = [];
}

function objURL(blob) {
  const u = URL.createObjectURL(blob);
  urlsTemporarias.push(u);
  return u;
}

function ir(rota) {
  location.hash = rota;
}

function campo(label, id, valor, opts = {}) {
  const { tipo = 'text', placeholder = '', inputmode = '', maxlength = '', ajuda = '' } = opts;
  return `
    <label class="campo">
      <span>${esc(label)}</span>
      <input id="${id}" type="${tipo}" value="${esc(valor ?? '')}"
        placeholder="${esc(placeholder)}" ${inputmode ? `inputmode="${inputmode}"` : ''}
        ${maxlength ? `maxlength="${maxlength}"` : ''} autocomplete="off">
      ${ajuda ? `<small>${esc(ajuda)}</small>` : ''}
    </label>`;
}

function area(label, id, valor, linhas = 3) {
  return `
    <label class="campo">
      <span>${esc(label)}</span>
      <textarea id="${id}" rows="${linhas}">${esc(valor ?? '')}</textarea>
    </label>`;
}

function select(label, id, valor, opcoes) {
  return `
    <label class="campo">
      <span>${esc(label)}</span>
      <select id="${id}">
        ${opcoes.map((o) => `<option value="${esc(o)}" ${o === valor ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>
    </label>`;
}

// --------------------------------------------------------------------- início

async function viewInicio() {
  const fiscalizacoes = await store.listarFiscalizacoes();
  if (!fisc) {
    app.innerHTML = `
      <section class="cartao destaque">
        <h2>Bem-vindo</h2>
        <p>Nenhuma fiscalização ativa. Crie uma nova para começar a registrar os veículos.</p>
        <button class="btn primario" id="nova">➕ Nova fiscalização</button>
      </section>
      ${listaFiscalizacoesHTML(fiscalizacoes)}`;
    document.getElementById('nova').onclick = criarFiscalizacao;
    ligarListaFiscalizacoes();
    return;
  }

  const veiculos = await store.listarVeiculos(fisc.id);
  const stats = store.consolidar(veiculos);
  const espaco = await uso();

  app.innerHTML = `
    <section class="cartao destaque">
      <div class="etiqueta">Fiscalização em andamento</div>
      <h2>Nº ${esc(fisc.numero)}/${esc(fisc.ano)} — ${esc(fisc.municipio || 'município não informado')}</h2>
      <p class="sub">${esc(dataCurta(fisc.data))} às ${esc(fisc.hora)}${fisc.local ? ` — ${esc(fisc.local)}` : ''}</p>
      <div class="painel-numeros">
        <div><b>${stats.totalVeiculos}</b><span>veículos</span></div>
        <div class="alerta"><b>${stats.irregulares}</b><span>com irregularidade</span></div>
        <div><b>${stats.totalIrregularidades}</b><span>irregularidades</span></div>
        <div><b>${stats.autuados}</b><span>autuados</span></div>
      </div>
      <div class="acoes">
        <button class="btn primario grande" id="novo-veic">📷 Fiscalizar veículo</button>
        <button class="btn" id="ver-veic">🚐 Ver veículos</button>
        <button class="btn" id="ver-rel">📄 Relatório</button>
      </div>
    </section>

    <section class="cartao">
      <h3>Identificação do agente</h3>
      ${campo('Seu nome / posto (vai no registro de cada veículo)', 'inspetor', store.inspetorAtual(), {
        placeholder: 'Ex.: Sd PM Silva',
      })}
    </section>

    ${
      stats.ranking.length
        ? `<section class="cartao">
             <h3>Irregularidades mais frequentes</h3>
             <ol class="ranking-lista">
               ${stats.ranking
                 .slice(0, 6)
                 .map(
                   (r) => `<li><span>${esc(r.item.titulo)}</span><b>${r.qtd}</b></li>`
                 )
                 .join('')}
             </ol>
           </section>`
        : ''
    }

    ${listaFiscalizacoesHTML(fiscalizacoes)}

    ${
      espaco
        ? `<p class="rodape-info">Armazenamento usado: ${(espaco.usage / 1048576).toFixed(1)} MB${
            espaco.quota ? ` de ${(espaco.quota / 1048576).toFixed(0)} MB disponíveis` : ''
          }.</p>`
        : ''
    }`;

  document.getElementById('novo-veic').onclick = criarVeiculo;
  document.getElementById('ver-veic').onclick = () => ir('#/veiculos');
  document.getElementById('ver-rel').onclick = () => ir('#/relatorio');
  document.getElementById('inspetor').oninput = (e) => store.definirInspetor(e.target.value);
  ligarListaFiscalizacoes();
}

function listaFiscalizacoesHTML(lista) {
  return `
    <section class="cartao">
      <div class="cartao-topo">
        <h3>Fiscalizações no aparelho</h3>
        <button class="btn pequeno" id="nova-2">➕ Nova</button>
      </div>
      ${
        lista.length
          ? `<ul class="lista">
               ${lista
                 .map(
                   (f) => `<li class="item-lista ${f.id === fisc?.id ? 'ativo' : ''}">
                     <button class="link-item" data-abrir="${f.id}">
                       <b>Nº ${esc(f.numero)}/${esc(f.ano)} — ${esc(f.municipio || '—')}</b>
                       <small>${esc(dataCurta(f.data))}${f.id === fisc?.id ? ' • ativa' : ''}</small>
                     </button>
                     <button class="btn icone perigo" data-excluir-fisc="${f.id}" aria-label="Excluir">🗑</button>
                   </li>`
                 )
                 .join('')}
             </ul>`
          : '<p class="vazio">Nenhuma fiscalização registrada.</p>'
      }
    </section>`;
}

function ligarListaFiscalizacoes() {
  document.getElementById('nova-2')?.addEventListener('click', criarFiscalizacao);
  app.querySelectorAll('[data-abrir]').forEach((b) => {
    b.onclick = async () => {
      store.definirFiscalizacaoAtual(b.dataset.abrir);
      fisc = await store.obterFiscalizacao(b.dataset.abrir);
      render();
      toast('Fiscalização selecionada.');
    };
  });
  app.querySelectorAll('[data-excluir-fisc]').forEach((b) => {
    b.onclick = async () => {
      const alvo = await store.obterFiscalizacao(b.dataset.excluirFisc);
      if (!confirm(`Excluir a fiscalização nº ${alvo.numero}/${alvo.ano} e TODOS os veículos e fotos vinculados? Esta ação não pode ser desfeita.`)) return;
      await store.excluirFiscalizacao(alvo.id);
      if (fisc?.id === alvo.id) fisc = null;
      render();
      toast('Fiscalização excluída.', 'aviso');
    };
  });
}

async function criarFiscalizacao() {
  const f = store.novaFiscalizacao({ promotor: fisc?.promotor || '', municipio: fisc?.municipio || '' });
  const lista = await store.listarFiscalizacoes();
  const doAno = lista.filter((x) => x.ano === f.ano).length;
  f.numero = String(doAno + 1).padStart(2, '0');
  await store.salvarFiscalizacao(f);
  store.definirFiscalizacaoAtual(f.id);
  fisc = f;
  ir('#/dados-fisc');
  toast('Fiscalização criada. Preencha os dados.');
}

// ------------------------------------------------------- dados da fiscalização

function viewDadosFiscalizacao() {
  if (!fisc) return semFiscalizacao();
  app.innerHTML = `
    <section class="cartao">
      <h2>Dados da fiscalização</h2>
      <div class="grade-2">
        ${campo('Nº do relatório', 'f_numero', fisc.numero, { inputmode: 'numeric', maxlength: 4 })}
        ${campo('Ano', 'f_ano', fisc.ano, { inputmode: 'numeric', maxlength: 4 })}
        ${campo('Data', 'f_data', fisc.data, { tipo: 'date' })}
        ${campo('Horário', 'f_hora', fisc.hora, { tipo: 'time' })}
      </div>
      ${campo('Município', 'f_municipio', fisc.municipio, { placeholder: 'Ex.: Prado' })}
      ${campo('Local / ponto de fiscalização', 'f_local', fisc.local, { placeholder: 'Ex.: BR-489, entrada da sede' })}
      ${campo('Órgão', 'f_orgaoMp', fisc.orgaoMp)}
      ${campo('Promotoria', 'f_promotoria', fisc.promotoria)}
      ${campo('Promotor(a) de Justiça', 'f_promotor', fisc.promotor, { placeholder: 'Nome que assina o relatório' })}
      ${campo('Apoio operacional', 'f_apoio', fisc.apoio)}
      ${area('Equipe (nomes/postos)', 'f_equipe', fisc.equipe, 2)}
      ${area('Conclusão e providências (texto livre do relatório)', 'f_conclusao', fisc.conclusao, 6)}
      <button class="btn" id="sugerir-conclusao">✨ Inserir modelo de conclusão</button>
    </section>`;

  const liga = (id, chave) => {
    const el = document.getElementById(id);
    el.addEventListener('input', async () => {
      fisc[chave] = el.value;
      await store.salvarFiscalizacao(fisc);
      atualizarBarraTopo();
    });
  };
  [
    ['f_numero', 'numero'], ['f_ano', 'ano'], ['f_data', 'data'], ['f_hora', 'hora'],
    ['f_municipio', 'municipio'], ['f_local', 'local'], ['f_orgaoMp', 'orgaoMp'],
    ['f_promotoria', 'promotoria'], ['f_promotor', 'promotor'], ['f_apoio', 'apoio'],
    ['f_equipe', 'equipe'], ['f_conclusao', 'conclusao'],
  ].forEach(([id, chave]) => liga(id, chave));

  document.getElementById('sugerir-conclusao').onclick = async () => {
    const veiculos = await store.listarVeiculos(fisc.id);
    const s = store.consolidar(veiculos);
    const topo = s.ranking.slice(0, 5).map((r) => `${r.item.titulo.toLowerCase()} (${r.qtd})`).join('; ');
    const texto = `Dos ${s.totalVeiculos} veículos fiscalizados, ${s.irregulares} apresentaram irregularidades, totalizando ${s.totalIrregularidades} constatações. As ocorrências de maior incidência foram: ${topo || 'não houve'}.

As irregularidades constatadas revelam risco concreto à incolumidade física dos estudantes transportados, em afronta aos arts. 136 a 139 do Código de Trânsito Brasileiro e ao dever de proteção integral previsto no art. 227 da Constituição Federal e no art. 4º do Estatuto da Criança e do Adolescente.

Diante disso, sugere-se: (a) expedição de recomendação ao Município para que se abstenha de utilizar, no transporte escolar, veículos e condutores em situação irregular, promovendo o recadastramento e a vistoria de toda a frota; (b) notificação dos permissionários para regularização em prazo determinado, com comprovação documental; (c) comunicação ao órgão executivo de trânsito para as providências de sua alçada; e (d) realização de nova fiscalização para verificação do cumprimento das medidas.`;
    fisc.conclusao = fisc.conclusao ? `${fisc.conclusao}\n\n${texto}` : texto;
    await store.salvarFiscalizacao(fisc);
    render();
  };
}

// ------------------------------------------------------------------- veículos

async function viewVeiculos() {
  if (!fisc) return semFiscalizacao();
  const veiculos = await store.listarVeiculos(fisc.id);
  const fotos = await fotosApi.fotosDaFiscalizacao(fisc.id);
  const qtdFotos = new Map();
  fotos.forEach((f) => qtdFotos.set(f.veiculoId, (qtdFotos.get(f.veiculoId) || 0) + 1));

  app.innerHTML = `
    <section class="cartao">
      <div class="cartao-topo">
        <h2>Veículos (${veiculos.length})</h2>
        <button class="btn primario pequeno" id="novo">➕ Novo</button>
      </div>
      <input class="busca" id="busca" type="search" placeholder="Buscar por placa, condutor, rota…">
      <ul class="lista" id="lista-veiculos">
        ${
          veiculos.length
            ? veiculos.map((v) => itemVeiculoHTML(v, qtdFotos.get(v.id) || 0)).join('')
            : '<li class="vazio">Nenhum veículo registrado. Toque em “Novo” para começar.</li>'
        }
      </ul>
    </section>`;

  document.getElementById('novo').onclick = criarVeiculo;
  app.querySelectorAll('[data-veic]').forEach((b) => {
    b.onclick = () => ir(`#/veiculo/${b.dataset.veic}`);
  });
  document.getElementById('busca').oninput = (e) => {
    const termo = e.target.value.toLowerCase();
    app.querySelectorAll('#lista-veiculos .item-lista').forEach((li) => {
      li.style.display = li.dataset.busca.includes(termo) ? '' : 'none';
    });
  };
}

function itemVeiculoHTML(v, nFotos) {
  const irr = store.contarIrregularidades(v);
  const verificados = store.itensVerificados(v);
  const busca = [v.placa, v.condutorNome, v.escolaRota, v.permissionario, v.marcaModelo]
    .filter(Boolean).join(' ').toLowerCase();
  const alerta = !store.placaValida(v.placa) || !nFotos;
  return `
    <li class="item-lista" data-busca="${esc(busca)}">
      <button class="link-item" data-veic="${v.id}">
        <b>${String(v.ordem).padStart(2, '0')}. ${esc(store.formatarPlaca(v.placa) || 'SEM PLACA')}</b>
        <small>${esc(v.tipo)}${v.condutorNome ? ` • ${esc(v.condutorNome)}` : ''} • ${verificados} itens verificados</small>
      </button>
      <div class="selos">
        ${irr ? `<span class="selo perigo">${irr} irreg.</span>` : '<span class="selo ok">regular</span>'}
        <span class="selo ${nFotos ? '' : 'aviso'}">📷 ${nFotos}</span>
        ${alerta ? '<span class="selo aviso" title="Placa inválida ou sem foto">!</span>' : ''}
      </div>
    </li>`;
}

async function criarVeiculo() {
  if (!fisc) return semFiscalizacao();
  const ordem = await store.proximaOrdem(fisc.id);
  const v = store.novoVeiculo(fisc.id, ordem);
  await store.salvarVeiculo(v);
  ir(`#/veiculo/${v.id}`);
}

// -------------------------------------------------------------- ficha veículo

async function viewVeiculo(id) {
  const v = await store.obterVeiculo(id);
  if (!v) {
    app.innerHTML = '<section class="cartao"><p class="vazio">Veículo não encontrado.</p></section>';
    return;
  }
  const fotos = await fotosApi.fotosDoVeiculo(id);

  app.innerHTML = `
    <section class="cartao">
      <div class="cartao-topo">
        <h2>Veículo ${String(v.ordem).padStart(2, '0')}</h2>
        <button class="btn icone perigo" id="excluir" aria-label="Excluir veículo">🗑</button>
      </div>
      <label class="campo placa-campo">
        <span>Placa *</span>
        <input id="v_placa" type="text" value="${esc(store.formatarPlaca(v.placa))}"
          placeholder="ABC1D23" autocapitalize="characters" autocomplete="off" maxlength="8">
        <small id="placa-aviso"></small>
      </label>
      <div class="grade-2">
        ${select('Tipo', 'v_tipo', v.tipo, TIPOS_VEICULO)}
        ${campo('Marca/modelo', 'v_marcaModelo', v.marcaModelo, { placeholder: 'Ex.: Mercedes Sprinter' })}
        ${campo('Ano', 'v_ano', v.ano, { inputmode: 'numeric', maxlength: 4 })}
        ${campo('Cor', 'v_cor', v.cor)}
        ${campo('Lotação', 'v_lotacao', v.lotacao, { inputmode: 'numeric' })}
        ${campo('Escolares a bordo', 'v_alunosBordo', v.alunosBordo, { inputmode: 'numeric' })}
      </div>
      ${campo('Permissionário / empresa', 'v_permissionario', v.permissionario)}
      ${campo('Rota / escola atendida', 'v_escolaRota', v.escolaRota)}
    </section>

    <section class="cartao">
      <h3>Registro fotográfico</h3>
      <p class="ajuda">Registre, no mínimo: a placa, a lateral com a faixa ESCOLAR, o interior (cintos) e cada irregularidade constatada.</p>
      <div class="acoes">
        <label class="btn primario arquivo">📷 Tirar foto
          <input type="file" accept="image/*" capture="environment" multiple hidden id="cam">
        </label>
        <label class="btn arquivo">🖼 Da galeria
          <input type="file" accept="image/*" multiple hidden id="gal">
        </label>
      </div>
      <div class="grade-fotos" id="grade-fotos">
        ${fotos.map((f) => fotoHTML(f)).join('') || '<p class="vazio">Nenhuma foto.</p>'}
      </div>
    </section>

    <section class="cartao">
      <h3>Condutor</h3>
      ${campo('Nome', 'v_condutorNome', v.condutorNome)}
      <div class="grade-2">
        ${campo('CPF', 'v_condutorCpf', v.condutorCpf, { inputmode: 'numeric' })}
        ${campo('Telefone', 'v_condutorTelefone', v.condutorTelefone, { inputmode: 'tel' })}
        ${campo('Nº da CNH', 'v_condutorCnh', v.condutorCnh, { inputmode: 'numeric' })}
        ${campo('Categoria', 'v_condutorCategoria', v.condutorCategoria, { placeholder: 'D, E…' })}
        ${campo('Validade da CNH', 'v_condutorValidadeCnh', v.condutorValidadeCnh, { tipo: 'date' })}
      </div>
      <label class="campo linha-check">
        <input type="checkbox" id="v_monitorPossui" ${v.monitorPossui ? 'checked' : ''}>
        <span>Monitor/acompanhante presente</span>
      </label>
      ${campo('Nome do monitor', 'v_monitorNome', v.monitorNome)}
    </section>

    <section class="cartao">
      <div class="cartao-topo">
        <h3>Checklist</h3>
        <button class="btn pequeno" id="tudo-conforme">✓ Tudo conforme</button>
      </div>
      <p class="ajuda">Marque <b>IRREG.</b> apenas no que estiver em desacordo — o texto do relatório é montado automaticamente.</p>
      ${GRUPOS.map((g) => grupoHTML(g, v)).join('')}
    </section>

    <section class="cartao">
      <h3>Encerramento</h3>
      ${area('Outras observações (entram no relatório)', 'v_obsGerais', v.obsGerais, 3)}
      <label class="campo linha-check">
        <input type="checkbox" id="v_autuado" ${v.autuado ? 'checked' : ''}>
        <span>Auto de infração lavrado</span>
      </label>
      ${campo('Nº do auto de infração', 'v_autuacaoNumero', v.autuacaoNumero)}
      ${select('Medida adotada', 'v_medida', v.medida, MEDIDAS)}
      ${campo('Agente responsável', 'v_inspetor', v.inspetor)}
      <div class="acoes">
        <button class="btn" id="geo">📍 Registrar coordenadas</button>
        <span class="ajuda" id="geo-txt">${v.geo ? `${v.geo.lat.toFixed(5)}, ${v.geo.lng.toFixed(5)}` : 'sem coordenadas'}</span>
      </div>
      <div class="resumo-irr" id="resumo-irr"></div>
      <div class="acoes">
        <button class="btn primario grande" id="concluir">✔ Concluir e voltar</button>
        <button class="btn grande" id="proximo">➕ Salvar e próximo veículo</button>
      </div>
    </section>`;

  ligarFichaVeiculo(v);
  atualizarResumoIrr(v);
}

function grupoHTML(grupo, v) {
  const itens = ITENS.filter((i) => i.grupo === grupo.id);
  const pendentes = itens.filter((i) => !v.itens?.[i.id]?.status).length;
  const irr = itens.filter((i) => v.itens?.[i.id]?.status === 'irregular').length;
  return `
    <details class="grupo" ${irr ? 'open' : ''}>
      <summary>
        <span>${grupo.icone} ${esc(grupo.titulo)}</span>
        <span class="selos">
          ${irr ? `<span class="selo perigo">${irr}</span>` : ''}
          ${pendentes ? `<span class="selo aviso">${pendentes} pend.</span>` : '<span class="selo ok">ok</span>'}
        </span>
      </summary>
      ${itens.map((i) => itemChecklistHTML(i, v)).join('')}
    </details>`;
}

function itemChecklistHTML(item, v) {
  const estado = v.itens?.[item.id] || {};
  const st = estado.status || '';
  return `
    <div class="item-check" data-item="${item.id}">
      <div class="item-check-titulo">
        <b>${esc(item.titulo)}</b>
        <small>${esc(item.base || '')}${item.gravidade ? ` • ${GRAVIDADE_LABEL[item.gravidade]}` : ''}</small>
        ${item.ajuda ? `<small class="ajuda">${esc(item.ajuda)}</small>` : ''}
      </div>
      <div class="opcoes" role="group">
        <button type="button" class="op ok ${st === 'conforme' ? 'sel' : ''}" data-st="conforme">✓ Conforme</button>
        <button type="button" class="op perigo ${st === 'irregular' ? 'sel' : ''}" data-st="irregular">✗ Irreg.</button>
        <button type="button" class="op ${st === 'na' ? 'sel' : ''}" data-st="na">N/A</button>
      </div>
      <input class="obs-item ${st === 'irregular' ? '' : 'oculto'}" type="text"
        placeholder="Detalhe (opcional): ex. lâmpada traseira esquerda queimada"
        value="${esc(estado.obs || '')}">
    </div>`;
}

function fotoHTML(f) {
  return `
    <figure class="foto" data-foto="${f.id}">
      <img src="${objURL(f.blob)}" alt="Foto do veículo" loading="lazy">
      <input class="legenda" type="text" placeholder="Legenda" value="${esc(f.legenda || '')}">
      <button class="btn icone perigo apagar" aria-label="Excluir foto">🗑</button>
    </figure>`;
}

function ligarFichaVeiculo(v) {
  // Gravação atrasada para não escrever no banco a cada tecla; `salvarAgora`
  // é obrigatório antes de qualquer redesenho da tela, sob pena de a leitura
  // seguinte trazer uma versão desatualizada do veículo.
  const salvarAgora = () => store.salvarVeiculo(v);
  const salvar = debounce(salvarAgora, 300);

  const texto = (id, chave, transform = (x) => x) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      v[chave] = transform(el.value);
      salvar();
    });
  };
  texto('v_marcaModelo', 'marcaModelo');
  texto('v_ano', 'ano');
  texto('v_cor', 'cor');
  texto('v_lotacao', 'lotacao');
  texto('v_alunosBordo', 'alunosBordo');
  texto('v_permissionario', 'permissionario');
  texto('v_escolaRota', 'escolaRota');
  texto('v_condutorNome', 'condutorNome');
  texto('v_condutorCpf', 'condutorCpf');
  texto('v_condutorTelefone', 'condutorTelefone');
  texto('v_condutorCnh', 'condutorCnh');
  texto('v_condutorCategoria', 'condutorCategoria', (x) => x.toUpperCase());
  texto('v_condutorValidadeCnh', 'condutorValidadeCnh');
  texto('v_monitorNome', 'monitorNome');
  texto('v_obsGerais', 'obsGerais');
  texto('v_autuacaoNumero', 'autuacaoNumero');
  texto('v_inspetor', 'inspetor');
  document.getElementById('v_tipo').onchange = (e) => { v.tipo = e.target.value; salvar(); };
  document.getElementById('v_medida').onchange = (e) => { v.medida = e.target.value; salvar(); };
  document.getElementById('v_monitorPossui').onchange = (e) => {
    v.monitorPossui = e.target.checked;
    if (e.target.checked) marcarItem(v, 'monitor', 'conforme');
    salvar();
  };
  document.getElementById('v_autuado').onchange = (e) => { v.autuado = e.target.checked; salvar(); };

  // placa com validação e alerta de duplicidade
  const placaEl = document.getElementById('v_placa');
  const avisoEl = document.getElementById('placa-aviso');
  const validarPlaca = async () => {
    const bruta = placaEl.value;
    v.placa = store.normalizarPlaca(bruta);
    salvar();
    if (!v.placa) {
      avisoEl.textContent = 'Informe a placa do veículo.';
      avisoEl.className = 'aviso-txt';
      return;
    }
    if (!store.placaValida(v.placa)) {
      avisoEl.textContent = 'Formato inválido (use ABC1234 ou ABC1D23).';
      avisoEl.className = 'aviso-txt erro';
      return;
    }
    const outros = (await store.listarVeiculos(v.fiscalizacaoId)).filter(
      (o) => o.id !== v.id && o.placa === v.placa
    );
    if (outros.length) {
      avisoEl.textContent = `Atenção: placa já registrada no veículo ${String(outros[0].ordem).padStart(2, '0')}.`;
      avisoEl.className = 'aviso-txt erro';
    } else {
      avisoEl.textContent = 'Placa válida.';
      avisoEl.className = 'aviso-txt ok';
    }
  };
  placaEl.addEventListener('input', () => {
    const p = store.normalizarPlaca(placaEl.value);
    placaEl.value = store.formatarPlaca(p);
    validarPlaca();
  });
  validarPlaca();

  // checklist
  app.querySelectorAll('.item-check').forEach((div) => {
    const itemId = div.dataset.item;
    div.querySelectorAll('.op').forEach((btn) => {
      btn.onclick = () => {
        const novo = btn.classList.contains('sel') ? '' : btn.dataset.st;
        div.querySelectorAll('.op').forEach((b) => b.classList.remove('sel'));
        if (novo) btn.classList.add('sel');
        marcarItem(v, itemId, novo);
        div.querySelector('.obs-item').classList.toggle('oculto', novo !== 'irregular');
        salvar();
        atualizarResumoIrr(v);
        atualizarSelosGrupos(v);
      };
    });
    div.querySelector('.obs-item').addEventListener('input', (e) => {
      marcarItem(v, itemId, v.itens[itemId]?.status || 'irregular', e.target.value);
      salvar();
      atualizarResumoIrr(v);
    });
  });

  document.getElementById('tudo-conforme').onclick = async () => {
    ITENS.forEach((i) => {
      if (!v.itens[i.id]?.status) marcarItem(v, i.id, 'conforme');
    });
    await salvarAgora();
    await viewVeiculo(v.id);
    toast('Itens pendentes marcados como conformes.');
  };

  // fotos
  const receber = async (input) => {
    const arquivos = [...input.files];
    input.value = '';
    if (!arquivos.length) return;
    toast(`Processando ${arquivos.length} foto(s)…`);
    await fotosApi.salvarFotos(arquivos, { veiculoId: v.id, fiscalizacaoId: v.fiscalizacaoId });
    await recarregarFotos(v);
    toast('Foto(s) salva(s).');
  };
  document.getElementById('cam').onchange = (e) => receber(e.target);
  document.getElementById('gal').onchange = (e) => receber(e.target);
  ligarFotos(v);

  document.getElementById('geo').onclick = () => {
    if (!navigator.geolocation) return toast('Geolocalização indisponível.', 'aviso');
    toast('Obtendo coordenadas…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        v.geo = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
        salvar();
        document.getElementById('geo-txt').textContent = `${v.geo.lat.toFixed(5)}, ${v.geo.lng.toFixed(5)} (±${Math.round(v.geo.acc)} m)`;
      },
      () => toast('Não foi possível obter a localização.', 'aviso'),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  document.getElementById('excluir').onclick = async () => {
    if (!confirm('Excluir este veículo e suas fotos?')) return;
    await nuvem.marcarRemocao(fisc, v); // a exclusão precisa alcançar os demais aparelhos
    await store.excluirVeiculo(v.id);
    await store.renumerar(v.fiscalizacaoId);
    ir('#/veiculos');
    toast('Veículo excluído.', 'aviso');
    sincronizarAgora();
  };
  document.getElementById('concluir').onclick = async () => {
    await store.salvarVeiculo(v);
    ir('#/veiculos');
    sincronizarAgora();
  };
  document.getElementById('proximo').onclick = async () => {
    await store.salvarVeiculo(v);
    criarVeiculo();
    sincronizarAgora();
  };
}

function ligarFotos(v) {
  app.querySelectorAll('.foto').forEach((fig) => {
    const id = fig.dataset.foto;
    fig.querySelector('.apagar').onclick = async () => {
      if (!confirm('Excluir esta foto?')) return;
      await fotosApi.excluirFoto(id);
      await recarregarFotos(v);
    };
    fig.querySelector('.legenda').addEventListener(
      'input',
      debounce(async (e) => {
        const fotos = await fotosApi.fotosDoVeiculo(v.id);
        const f = fotos.find((x) => x.id === id);
        if (f) {
          f.legenda = e.target.value;
          await fotosApi.atualizarFoto(f);
        }
      }, 400)
    );
    fig.querySelector('img').onclick = () => abrirVisualizador(fig.querySelector('img').src);
  });
}

async function recarregarFotos(v) {
  const fotos = await fotosApi.fotosDoVeiculo(v.id);
  const grade = document.getElementById('grade-fotos');
  grade.innerHTML = fotos.map((f) => fotoHTML(f)).join('') || '<p class="vazio">Nenhuma foto.</p>';
  ligarFotos(v);
}

function abrirVisualizador(src) {
  const div = document.createElement('div');
  div.className = 'visualizador';
  div.innerHTML = `<img src="${src}" alt="Ampliação"><button class="btn">Fechar</button>`;
  div.onclick = () => div.remove();
  document.body.appendChild(div);
}

function marcarItem(v, itemId, status, obs) {
  v.itens = v.itens || {};
  const atual = v.itens[itemId] || {};
  if (!status) {
    delete v.itens[itemId];
    return;
  }
  v.itens[itemId] = { status, obs: obs !== undefined ? obs : atual.obs || '' };
}

function atualizarResumoIrr(v) {
  const el = document.getElementById('resumo-irr');
  if (!el) return;
  const irr = store.irregularidades(v);
  el.innerHTML = irr.length
    ? `<b>${irr.length} irregularidade(s).</b> Texto que irá ao relatório:<br><i>${esc(store.frasesIrregularidades(v))}</i>`
    : '<b>Nenhuma irregularidade marcada até o momento.</b>';
  el.className = `resumo-irr ${irr.length ? 'com-irr' : ''}`;
}

function atualizarSelosGrupos(v) {
  app.querySelectorAll('.grupo').forEach((det, idx) => {
    const grupo = GRUPOS[idx];
    if (!grupo) return;
    const itens = ITENS.filter((i) => i.grupo === grupo.id);
    const pendentes = itens.filter((i) => !v.itens?.[i.id]?.status).length;
    const irr = itens.filter((i) => v.itens?.[i.id]?.status === 'irregular').length;
    const selos = det.querySelector('summary .selos');
    selos.innerHTML = `
      ${irr ? `<span class="selo perigo">${irr}</span>` : ''}
      ${pendentes ? `<span class="selo aviso">${pendentes} pend.</span>` : '<span class="selo ok">ok</span>'}`;
  });
}

// ------------------------------------------------------------------ relatório

async function viewRelatorio() {
  if (!fisc) return semFiscalizacao();
  const veiculos = await store.listarVeiculos(fisc.id);
  const pendencias = [];
  const semPlaca = veiculos.filter((v) => !store.placaValida(v.placa));
  if (semPlaca.length) pendencias.push(`${semPlaca.length} veículo(s) com placa ausente ou inválida.`);
  const semVerificacao = veiculos.filter((v) => store.itensVerificados(v) === 0);
  if (semVerificacao.length) pendencias.push(`${semVerificacao.length} veículo(s) sem nenhum item verificado.`);
  if (!fisc.municipio) pendencias.push('Município não informado nos dados da fiscalização.');
  if (!fisc.promotor) pendencias.push('Nome do(a) promotor(a) não informado.');

  app.innerHTML = `
    <section class="cartao">
      <h2>Relatório final</h2>
      <p class="sub">Nº ${esc(fisc.numero)}/${esc(fisc.ano)} — ${veiculos.length} veículo(s).</p>
      ${
        pendencias.length
          ? `<div class="alerta-box"><b>Antes de emitir, confira:</b><ul>${pendencias
              .map((p) => `<li>${esc(p)}</li>`)
              .join('')}</ul></div>`
          : '<div class="ok-box">Dados completos para emissão.</div>'
      }
      <label class="campo linha-check">
        <input type="checkbox" id="com-fotos" checked>
        <span>Incluir anexo fotográfico</span>
      </label>
      <div class="acoes">
        <button class="btn primario grande" id="gerar">👁 Gerar / atualizar</button>
        <button class="btn grande" id="imprimir">🖨 Imprimir / salvar PDF</button>
        <button class="btn" id="doc">📝 Baixar .doc (Word)</button>
        <button class="btn" id="csv">📊 Baixar planilha (CSV)</button>
      </div>
    </section>
    <section class="cartao previa">
      <h3>Pré-visualização</h3>
      <div class="documento" id="previa"><p class="vazio">Toque em “Gerar / atualizar”.</p></div>
    </section>`;

  const comFotos = () => document.getElementById('com-fotos').checked;

  const gerar = async () => {
    toast('Montando relatório…');
    const html = await montarRelatorio(fisc, veiculos, { comFotos: comFotos() });
    document.getElementById('previa').innerHTML = html;
    return html;
  };

  document.getElementById('gerar').onclick = gerar;

  document.getElementById('imprimir').onclick = async () => {
    const html = await gerar();
    areaImpressao.innerHTML = `<div class="documento">${html}</div>`;
    document.body.classList.add('imprimindo');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('imprimindo');
        areaImpressao.innerHTML = '';
      }, 800);
    }, 350);
  };

  document.getElementById('doc').onclick = async () => {
    const html = await montarRelatorio(fisc, veiculos, { comFotos: comFotos() });
    const nome = `Relatorio_Fiscalizacao_${fisc.numero}-${fisc.ano}_${(fisc.municipio || 'municipio').replace(/\s+/g, '_')}.doc`;
    await backup.compartilharOuBaixar(
      documentoCompleto(html, `Relatório de Fiscalização nº ${fisc.numero}/${fisc.ano}`),
      nome,
      'application/msword'
    );
  };

  document.getElementById('csv').onclick = async () => {
    const csv = gerarCSV(fisc, veiculos, ITENS);
    await backup.compartilharOuBaixar(
      csv,
      `Fiscalizacao_${fisc.numero}-${fisc.ano}.csv`,
      'text/csv;charset=utf-8'
    );
  };
}

// --------------------------------------------------------------------- backup

async function viewEquipe() {
  const lista = await store.listarFiscalizacoes();
  app.innerHTML = `
    <div id="area-nuvem"></div>

    <section class="cartao">
      <h2>Backup em arquivo</h2>
      <p class="ajuda">
        Alternativa para quando não houver sinal em campo: cada agente exporta o arquivo
        <b>.json</b> e envia ao coordenador. Ao importar, veículos com a mesma placa são
        consolidados (prevalece a versão mais recente).
      </p>
      ${
        fisc
          ? `<div class="acoes">
               <button class="btn primario" id="exp-fotos">⬆ Exportar com fotos</button>
               <button class="btn" id="exp-sem">⬆ Exportar só dados (leve)</button>
             </div>`
          : '<p class="vazio">Selecione uma fiscalização para exportar.</p>'
      }
    </section>

    <section class="cartao">
      <h3>Importar arquivo</h3>
      <label class="campo">
        <span>Destino</span>
        <select id="destino">
          <option value="">Criar nova fiscalização</option>
          ${lista
            .map(
              (f) => `<option value="${f.id}" ${f.id === fisc?.id ? 'selected' : ''}>Nº ${esc(f.numero)}/${esc(f.ano)} — ${esc(f.municipio || '—')}</option>`
            )
            .join('')}
        </select>
      </label>
      <label class="btn primario arquivo">⬇ Selecionar arquivo .json
        <input type="file" accept="application/json,.json" hidden id="arq">
      </label>
      <div id="resultado-import"></div>
    </section>

    <section class="cartao">
      <h3>Segurança dos dados</h3>
      <p class="ajuda">
        Sem sincronização, os dados ficam apenas neste aparelho e limpar os dados do navegador
        apaga tudo. Exporte um backup ao final de cada dia de fiscalização, mesmo usando a nuvem.
      </p>
    </section>`;

  await renderNuvem();

  document.getElementById('exp-fotos')?.addEventListener('click', () => exportarBackup(true));
  document.getElementById('exp-sem')?.addEventListener('click', () => exportarBackup(false));

  document.getElementById('arq').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      toast('Importando…');
      const pacote = JSON.parse(await file.text());
      const destino = document.getElementById('destino').value || null;
      const r = await backup.importar(pacote, destino);
      store.definirFiscalizacaoAtual(r.fiscalizacaoId);
      fisc = await store.obterFiscalizacao(r.fiscalizacaoId);
      document.getElementById('resultado-import').innerHTML = `
        <div class="ok-box">
          Importação concluída: <b>${r.novos}</b> veículo(s) novo(s), <b>${r.atualizados}</b> atualizado(s),
          <b>${r.ignorados}</b> mantido(s) sem alteração e <b>${r.fotos}</b> foto(s).
        </div>`;
      atualizarBarraTopo();
      toast('Importação concluída.');
    } catch (err) {
      document.getElementById('resultado-import').innerHTML = `<div class="alerta-box">${esc(err.message)}</div>`;
    }
  };
}

async function exportarBackup(comFotos) {
  toast('Preparando arquivo…');
  const pacote = await backup.exportar(fisc.id, { comFotos });
  const nome = `fiscalizacao_${fisc.numero}-${fisc.ano}_${(fisc.municipio || 'municipio').replace(/\s+/g, '_')}${comFotos ? '_com_fotos' : ''}.json`;
  await backup.compartilharOuBaixar(JSON.stringify(pacote), nome, 'application/json');
}

// -------------------------------------------------- sincronização da equipe

async function renderNuvem() {
  const area = document.getElementById('area-nuvem');
  if (!area) return;
  const cfg = nuvem.configNuvem();

  if (!cfg) {
    area.innerHTML = `
      <section class="cartao destaque">
        <h2>Sincronização da equipe</h2>
        <p class="ajuda">
          Com o servidor configurado, todos os agentes trabalham na mesma operação: cada aparelho
          grava offline e envia sozinho assim que houver sinal, e o coordenador acompanha a
          produção ao vivo. Configure uma vez e informe apenas o <b>código da operação</b> à equipe.
        </p>
        <details class="grupo">
          <summary><span>⚙️ Como obter esses dados</span></summary>
          <div class="item-check">
            <ol class="passos">
              <li>Crie um projeto gratuito em <b>supabase.com</b>.</li>
              <li>Em <i>SQL Editor → New query</i>, cole o conteúdo de <b>supabase/schema.sql</b> e execute.</li>
              <li>Em <i>Project Settings → API</i>, copie a <b>Project URL</b> e a chave <b>anon public</b>.</li>
              <li>Cole os dois campos abaixo. A chave pública sozinha não dá acesso a nada:
                  é preciso o código e a senha da operação.</li>
            </ol>
          </div>
        </details>
        ${campo('Endereço do projeto (Project URL)', 'n_url', '', { placeholder: 'https://xxxx.supabase.co' })}
        ${campo('Chave pública (anon public)', 'n_chave', '', { placeholder: 'eyJhbGciOi...' })}
        <button class="btn primario" id="n_salvar">Salvar configuração</button>
      </section>`;
    document.getElementById('n_salvar').onclick = () => {
      const url = document.getElementById('n_url').value.trim();
      const chave = document.getElementById('n_chave').value.trim();
      if (!/^https?:\/\//.test(url) || chave.length < 20) {
        return toast('Verifique o endereço e a chave.', 'aviso');
      }
      nuvem.definirConfigNuvem(url, chave);
      toast('Servidor configurado.');
      renderNuvem();
      atualizarStatusNuvem();
    };
    return;
  }

  if (!fisc || !fisc.sala) {
    // Sem fiscalização local o agente ainda pode (e deve) entrar na operação:
    // a fiscalização é criada automaticamente a partir dos dados da nuvem.
    area.innerHTML = `
      <section class="cartao destaque">
        <h2>Sincronização da equipe</h2>
        <p class="ajuda">
          O <b>coordenador</b> cria a operação e passa o código e a senha à equipe.
          Cada agente entra com esses mesmos dados no seu aparelho.
        </p>
        <div class="grade-2">
          ${campo('Código da operação', 'n_codigo', fisc ? sugerirCodigo() : '', { placeholder: 'PRADO2026' })}
          ${campo('Senha da operação', 'n_senha', '', { placeholder: 'mínimo 4 caracteres' })}
        </div>
        <div class="acoes">
          <button class="btn primario grande" id="n_entrar">🔑 Entrar na operação</button>
          ${fisc ? '<button class="btn grande" id="n_criar">🆕 Criar operação</button>' : ''}
        </div>
        <p class="ajuda">
          “Entrar” vincula este aparelho a uma operação já criada e traz os dados dos demais agentes.
          ${fisc ? '“Criar” envia <b>esta</b> fiscalização para a nuvem — use apenas no aparelho do coordenador.' : ''}
        </p>
        ${botaoTrocarServidorHTML()}
      </section>`;

    const ler = () => ({
      codigo: document.getElementById('n_codigo').value.trim(),
      senha: document.getElementById('n_senha').value,
    });
    document.getElementById('n_criar')?.addEventListener('click', async () => {
      const { codigo, senha } = ler();
      try {
        toast('Criando operação…');
        await nuvem.criarSala(fisc, codigo, senha);
        await sincronizarAgora({ silencioso: false });
        renderNuvem();
      } catch (e) {
        toast(e.message, 'aviso');
      }
    });
    document.getElementById('n_entrar').onclick = async () => {
      const { codigo, senha } = ler();
      try {
        toast('Entrando na operação…');
        const vinculada = await nuvem.entrarSala(fisc || null, codigo, senha);
        store.definirFiscalizacaoAtual(vinculada.id);
        fisc = await store.obterFiscalizacao(vinculada.id);
        await sincronizarAgora({ silencioso: false });
        atualizarBarraTopo();
        renderNuvem();
        toast('Aparelho vinculado à operação.');
      } catch (e) {
        toast(e.message, 'aviso');
      }
    };
    ligarTrocaServidor();
    return;
  }

  const pend = await nuvem.pendencias(fisc);
  area.innerHTML = `
    <section class="cartao destaque">
      <div class="cartao-topo">
        <h2>Operação ${esc(fisc.sala.codigo)}</h2>
        <span class="selo ${pend.veiculos || pend.fotos ? 'aviso' : 'ok'}" id="n_pend">
          ${pend.veiculos || pend.fotos ? `${pend.veiculos} veíc. / ${pend.fotos} fotos pendentes` : 'tudo sincronizado'}
        </span>
      </div>
      <p class="ajuda">
        Última sincronização: ${fisc.sala.ultimoSync ? esc(new Date(fisc.sala.ultimoSync).toLocaleString('pt-BR')) : 'ainda não sincronizado'}.
        ${navigator.onLine ? '' : '<b>Aparelho sem conexão</b> — os registros sobem assim que houver sinal.'}
      </p>
      <label class="campo linha-check">
        <input type="checkbox" id="n_fotos" ${autoFotos() ? 'checked' : ''}>
        <span>Enviar também as fotos (desmarque se o sinal estiver ruim)</span>
      </label>
      <div class="acoes">
        <button class="btn primario grande" id="n_sync">🔄 Sincronizar agora</button>
        <button class="btn" id="n_painel">📊 Atualizar painel</button>
        <button class="btn perigo" id="n_sair">Desvincular aparelho</button>
      </div>
      <div id="n_resultado"></div>
    </section>

    <section class="cartao">
      <h3>Painel da equipe</h3>
      <div id="n_painel_area"><p class="vazio">Toque em “Atualizar painel”.</p></div>
    </section>`;

  document.getElementById('n_fotos').onchange = (e) => {
    localStorage.setItem('fte:autoFotos', e.target.checked ? '1' : '0');
  };
  document.getElementById('n_sync').onclick = () => sincronizarAgora({ silencioso: false });
  document.getElementById('n_sair').onclick = async () => {
    if (!confirm('Desvincular este aparelho da operação? Os dados já registrados permanecem aqui.')) return;
    await nuvem.sairSala(fisc);
    fisc = await store.obterFiscalizacao(fisc.id);
    renderNuvem();
    atualizarStatusNuvem();
  };
  document.getElementById('n_painel').onclick = carregarPainel;
  carregarPainel();
}

function botaoTrocarServidorHTML() {
  return '<button class="btn pequeno" id="n_trocar">Trocar servidor de sincronização</button>';
}

function ligarTrocaServidor() {
  document.getElementById('n_trocar')?.addEventListener('click', () => {
    if (!confirm('Remover a configuração do servidor deste aparelho?')) return;
    nuvem.definirConfigNuvem(null, null);
    renderNuvem();
    atualizarStatusNuvem();
  });
}

function sugerirCodigo() {
  const m = (fisc?.municipio || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8);
  return `${m || 'OPERACAO'}${fisc?.ano || ''}`;
}

function autoFotos() {
  return localStorage.getItem('fte:autoFotos') !== '0';
}

async function carregarPainel() {
  const area = document.getElementById('n_painel_area');
  if (!area || !fisc?.sala) return;
  try {
    const p = await nuvem.painel(fisc);
    area.innerHTML = `
      <div class="painel-numeros">
        <div><b>${p.veiculos}</b><span>veículos na nuvem</span></div>
        <div><b>${p.fotos}</b><span>fotos</span></div>
        <div><b>${p.agentes.length}</b><span>agentes</span></div>
      </div>
      <ul class="lista">
        ${p.agentes
          .map(
            (a) => `<li class="item-lista">
              <div class="link-item">
                <b>${esc(a.agente)}</b>
                <small>último envio: ${a.ultimo ? esc(new Date(a.ultimo).toLocaleString('pt-BR')) : '—'}</small>
              </div>
              <span class="selo">${a.veiculos} veíc.</span>
            </li>`
          )
          .join('')}
      </ul>`;
  } catch (e) {
    area.innerHTML = `<div class="alerta-box">${esc(e.message)}</div>`;
  }
}

/** Executa a sincronização e atualiza os avisos da tela. */
async function sincronizarAgora({ silencioso = true } = {}) {
  if (!fisc?.sala || !nuvem.nuvemConfigurada() || nuvem.estaSincronizando()) return null;
  if (!navigator.onLine) {
    if (!silencioso) toast('Aparelho sem conexão.', 'aviso');
    return null;
  }
  try {
    if (!silencioso) toast('Sincronizando…');
    marcarStatusNuvem('sincronizando');
    const r = await nuvem.sincronizar(fisc.id, { comFotos: autoFotos() });
    fisc = await store.obterFiscalizacao(fisc.id);
    const resumo = `Enviados ${r.enviados} veículo(s) e ${r.fotosEnviadas} foto(s); recebidos ${r.recebidos} veículo(s) e ${r.fotosRecebidas} foto(s).`;
    const alvo = document.getElementById('n_resultado');
    if (alvo) {
      alvo.innerHTML = `<div class="ok-box">${esc(resumo)}${
        r.fotosPendentes ? ` <b>${r.fotosPendentes} foto(s) ainda na fila</b> — toque novamente para continuar.` : ''
      }</div>`;
    }
    if (!silencioso) toast('Sincronização concluída.');
    await atualizarStatusNuvem();
    if (!silencioso && document.getElementById('n_painel_area')) carregarPainel();
    if ((r.recebidos || r.apagados) && ['#/veiculos', '#/relatorio', '#/'].includes(location.hash || '#/')) {
      render();
    }
    return r;
  } catch (e) {
    marcarStatusNuvem('erro');
    const alvo = document.getElementById('n_resultado');
    if (alvo) alvo.innerHTML = `<div class="alerta-box">${esc(e.message)}</div>`;
    if (!silencioso) toast(e.message, 'aviso');
    return null;
  }
}

function marcarStatusNuvem(estado, texto) {
  if (!btnStatusNuvem) return;
  btnStatusNuvem.hidden = !fisc?.sala || !nuvem.nuvemConfigurada();
  btnStatusNuvem.className = `status-nuvem ${estado}`;
  const rotulos = { sincronizando: '⏳', ok: '☁️', pendente: '⬆️', erro: '⚠️', offline: '📴' };
  btnStatusNuvem.textContent = `${rotulos[estado] || '☁️'}${texto ? ` ${texto}` : ''}`;
}

async function atualizarStatusNuvem() {
  if (!btnStatusNuvem) return;
  if (!fisc?.sala || !nuvem.nuvemConfigurada()) {
    btnStatusNuvem.hidden = true;
    return;
  }
  const p = await nuvem.pendencias(fisc);
  const total = (p?.veiculos || 0) + (p?.fotos || 0);
  const selo = document.getElementById('n_pend');
  if (selo) {
    selo.className = `selo ${total ? 'aviso' : 'ok'}`;
    selo.textContent = total ? `${p.veiculos} veíc. / ${p.fotos} fotos pendentes` : 'tudo sincronizado';
  }
  if (!navigator.onLine) return marcarStatusNuvem('offline');
  marcarStatusNuvem(total ? 'pendente' : 'ok', total ? String(total) : '');
}

function iniciarAutoSync() {
  const tentar = () => sincronizarAgora({ silencioso: true });
  setInterval(tentar, 60000);
  window.addEventListener('online', () => {
    atualizarStatusNuvem();
    tentar();
  });
  window.addEventListener('offline', atualizarStatusNuvem);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tentar();
  });
}

// ------------------------------------------------------------------- roteador

function semFiscalizacao() {
  app.innerHTML = `
    <section class="cartao">
      <p class="vazio">Nenhuma fiscalização ativa.</p>
      <button class="btn primario" id="nova">➕ Criar fiscalização</button>
    </section>`;
  document.getElementById('nova').onclick = criarFiscalizacao;
}

function atualizarBarraTopo() {
  const el = document.getElementById('barra-contexto');
  el.textContent = fisc
    ? `Nº ${fisc.numero}/${fisc.ano} • ${fisc.municipio || 'município não informado'} • ${dataCurta(fisc.data)}`
    : 'Nenhuma fiscalização ativa';
}

async function render() {
  liberarURLs();
  const hash = location.hash || '#/';
  const [, rota, param] = hash.split('/');
  atualizarBarraTopo();
  atualizarStatusNuvem();
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.rota === `#/${rota || ''}`);
  });
  window.scrollTo(0, 0);

  switch (rota) {
    case '':
    case undefined:
      return viewInicio();
    case 'dados-fisc':
      return viewDadosFiscalizacao();
    case 'veiculos':
      return viewVeiculos();
    case 'veiculo':
      return viewVeiculo(param);
    case 'relatorio':
      return viewRelatorio();
    case 'equipe':
    case 'backup':
      return viewEquipe();
    default:
      return viewInicio();
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function iniciar() {
  // O mesmo CSS usado no arquivo exportado vale para a prévia e para a impressão.
  const estilo = document.createElement('style');
  estilo.textContent = CSS_RELATORIO;
  document.head.appendChild(estilo);

  const id = store.idFiscalizacaoAtual();
  if (id) fisc = await store.obterFiscalizacao(id);
  if (!fisc) {
    const lista = await store.listarFiscalizacoes();
    if (lista.length) {
      fisc = lista[0];
      store.definirFiscalizacaoAtual(fisc.id);
    }
  }
  window.addEventListener('hashchange', render);
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.onclick = () => ir(b.dataset.rota);
  });
  btnStatusNuvem.onclick = () => ir('#/equipe');
  await render();
  iniciarAutoSync();
  sincronizarAgora();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  navigator.storage?.persist?.().catch(() => {});
}

iniciar();
