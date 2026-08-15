/**
 * Sincronização da equipe.
 *
 * O aplicativo é "offline-first": tudo é gravado primeiro no aparelho. Esta
 * camada empurra o que mudou e traz o que os outros agentes registraram, quando
 * houver sinal. Sem servidor configurado, nada aqui é executado.
 *
 * Há dois transportes possíveis, com a mesma interface:
 *   - Firebase Realtime Database (padrão): reaproveita o projeto que a
 *     Promotoria já mantém; os registros sobem cifrados no próprio aparelho;
 *   - Supabase: banco próprio, com as funções de supabase/schema.sql.
 */

import { put } from './db.js';
import {
  listarVeiculos, salvarFiscalizacao, obterFiscalizacao, normalizarPlaca,
  proximaOrdem, excluirVeiculo, novaFiscalizacao,
} from './store.js';
import { fotosDaFiscalizacao, blobParaDataURL, dataURLParaBlob } from './fotos.js';
import { uid } from './db.js';
import { CONFIG } from './config.js';
import { configurarFirebase, firebaseDisponivel, transporteFirebase } from './nuvem-firebase.js';

const CHAVE_CFG = 'fte:nuvem';
const LIMITE_FOTOS_POR_SYNC = 8; // evita travar a sincronização numa conexão ruim

configurarFirebase(CONFIG.FIREBASE);

// ------------------------------------------------------------ configuração

/**
 * Configuração vigente. O que foi digitado neste aparelho tem prioridade; na
 * falta dele vale o que está publicado em config.js — assim a equipe abre o
 * endereço e já pode sincronizar, sem digitar nada.
 */
export function configNuvem() {
  try {
    const local = JSON.parse(localStorage.getItem(CHAVE_CFG) || 'null');
    if (local?.url && local?.chave) return { ...local, tipo: 'supabase' };
  } catch {
    /* configuração local corrompida: cai para a publicada */
  }
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    return {
      tipo: 'supabase',
      url: CONFIG.SUPABASE_URL.replace(/\/+$/, ''),
      chave: CONFIG.SUPABASE_ANON_KEY,
      publicada: true,
    };
  }
  if (firebaseDisponivel()) {
    return { tipo: 'firebase', url: CONFIG.FIREBASE.databaseURL, publicada: true };
  }
  return null;
}

export function definirConfigNuvem(url, chave) {
  if (!url || !chave) {
    localStorage.removeItem(CHAVE_CFG);
    return null;
  }
  const cfg = { url: url.trim().replace(/\/+$/, ''), chave: chave.trim() };
  localStorage.setItem(CHAVE_CFG, JSON.stringify(cfg));
  return cfg;
}

export function nuvemConfigurada() {
  return !!configNuvem();
}

export function codigoPadrao() {
  return localStorage.getItem('fte:opPadrao') || CONFIG.CODIGO_OPERACAO_PADRAO || '';
}

/**
 * Configuração por link: o coordenador envia um endereço já com o servidor e o
 * código da operação, e o agente só digita a senha. A senha nunca vai no link.
 */
export function aplicarConfigDaURL() {
  const p = new URLSearchParams(location.search);
  const srv = p.get('srv');
  const chave = p.get('key');
  const op = p.get('op');
  if (!srv && !chave && !op) return false;
  if (srv && chave) definirConfigNuvem(srv, chave);
  if (op) localStorage.setItem('fte:opPadrao', op.trim().toUpperCase());
  history.replaceState(null, '', location.pathname + location.hash);
  return true;
}

/** Link de configuração para distribuir à equipe (sem a senha). */
export function linkConfiguracao(codigoOperacao) {
  const cfg = configNuvem();
  if (!cfg) return null;
  const base = `${location.origin}${location.pathname}`;
  const p = new URLSearchParams();
  if (cfg.tipo === 'supabase' && !cfg.publicada) {
    p.set('srv', cfg.url);
    p.set('key', cfg.chave);
  }
  if (codigoOperacao) p.set('op', codigoOperacao);
  const consulta = p.toString();
  return consulta ? `${base}?${consulta}` : base;
}

// --------------------------------------------------- transporte: Supabase

async function rpc(funcao, params) {
  const cfg = configNuvem();
  let resp;
  try {
    resp = await fetch(`${cfg.url}/rest/v1/rpc/${funcao}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.chave,
        Authorization: `Bearer ${cfg.chave}`,
      },
      body: JSON.stringify(params),
    });
  } catch {
    throw new Error('Sem conexão com o servidor.');
  }
  const txt = await resp.text();
  let corpo = null;
  try {
    corpo = txt ? JSON.parse(txt) : null;
  } catch {
    corpo = null;
  }
  if (!resp.ok) throw new Error(corpo?.message || corpo?.hint || `Falha na sincronização (HTTP ${resp.status}).`);
  return corpo;
}

const transporteSupabase = {
  nome: 'supabase',
  async criar(codigo, senha, fisc) {
    await rpc('fisc_criar', { p_codigo: codigo, p_senha: senha, p_dados: fisc });
    return { codigo: codigo.trim().toUpperCase() };
  },
  async entrar(codigo, senha) {
    const r = await rpc('fisc_entrar', { p_codigo: codigo, p_senha: senha });
    return { codigo: String(r.codigo), fiscalizacao: r.fiscalizacao };
  },
  async sync(codigo, senha, { fisc, veiculos, removidos, desde }) {
    const r = await rpc('fisc_sync', {
      p_codigo: codigo,
      p_senha: senha,
      p_fisc: fisc,
      p_veiculos: veiculos,
      p_removidos: removidos,
      p_desde: desde,
    });
    return {
      servidorEm: r.servidorEm,
      fiscalizacao: r.fiscalizacao,
      veiculos: r.veiculos || [],
      removidos: (r.removidos || []).map((chave) => ({ chave, quando: null })),
      fotos: r.fotos || [],
    };
  },
  enviarFoto(codigo, senha, { veiculoChave, origemId, legenda, agente, imagemBase64 }) {
    return rpc('fisc_foto_enviar', {
      p_codigo: codigo,
      p_senha: senha,
      p_veiculo_chave: veiculoChave,
      p_origem_id: origemId,
      p_legenda: legenda,
      p_agente: agente,
      p_imagem: imagemBase64,
    });
  },
  baixarFoto(codigo, senha, id) {
    return rpc('fisc_foto_baixar', { p_codigo: codigo, p_senha: senha, p_id: id });
  },
};

function transporte() {
  const cfg = configNuvem();
  if (!cfg) throw new Error('Servidor de sincronização não configurado.');
  return cfg.tipo === 'firebase' ? transporteFirebase : transporteSupabase;
}

/** Nome amigável do servidor em uso, para a tela "Equipe". */
export function servidorEmUso() {
  const cfg = configNuvem();
  if (!cfg) return null;
  return cfg.tipo === 'firebase'
    ? { tipo: 'firebase', descricao: 'Firebase da Promotoria (registros cifrados no aparelho)' }
    : { tipo: 'supabase', descricao: (cfg.url || '').replace(/^https?:\/\//, '') };
}

// ------------------------------------------------------------------ sala

/** Identidade do veículo na nuvem: a placa; sem placa, um identificador local. */
export function chaveVeiculo(v) {
  const p = normalizarPlaca(v.placa);
  return p || `local:${v.id}`;
}

function fiscParaNuvem(fisc) {
  const { sala, ...limpo } = fisc; // a senha da operação nunca sobe
  return limpo;
}

export async function criarSala(fisc, codigo, senha) {
  const cod = codigo.trim().toUpperCase();
  if (cod.length < 4) throw new Error('O código da operação deve ter ao menos 4 caracteres.');
  if ((senha || '').length < 4) throw new Error('A senha da operação deve ter ao menos 4 caracteres.');
  await transporte().criar(cod, senha, fiscParaNuvem(fisc));
  fisc.sala = { codigo: cod, senha, ultimoSync: null, ultimoEnvio: null, removidos: [] };
  await salvarFiscalizacao(fisc);
  return fisc;
}

export async function entrarSala(fiscLocal, codigo, senha) {
  const cod = codigo.trim().toUpperCase();
  const r = await transporte().entrar(cod, senha);
  let fisc = fiscLocal;
  if (!fisc) {
    fisc = novaFiscalizacao({ ...(r.fiscalizacao || {}), id: uid('fisc') });
  } else if (r.fiscalizacao) {
    Object.assign(fisc, r.fiscalizacao, { id: fisc.id });
  }
  fisc.sala = { codigo: String(r.codigo || cod), senha, ultimoSync: null, ultimoEnvio: null, removidos: [] };
  await salvarFiscalizacao(fisc);
  return fisc;
}

export async function sairSala(fisc) {
  delete fisc.sala;
  await salvarFiscalizacao(fisc);
  return fisc;
}

/** Registra a exclusão para que ela alcance os demais aparelhos. */
export async function marcarRemocao(fisc, veiculo) {
  if (!fisc?.sala) return;
  fisc.sala.removidos = fisc.sala.removidos || [];
  const chave = chaveVeiculo(veiculo);
  if (!fisc.sala.removidos.includes(chave)) fisc.sala.removidos.push(chave);
  await salvarFiscalizacao(fisc);
}

// ---------------------------------------------------------- sincronização

let sincronizando = false;

export function estaSincronizando() {
  return sincronizando;
}

/**
 * Envia as alterações locais e aplica as alterações vindas dos demais agentes.
 * @returns {{enviados:number, recebidos:number, apagados:number,
 *            fotosEnviadas:number, fotosRecebidas:number, fotosPendentes:number}}
 */
export async function sincronizar(fiscId, { comFotos = true } = {}) {
  if (sincronizando) throw new Error('Sincronização já em andamento.');
  let fisc = await obterFiscalizacao(fiscId);
  if (!fisc?.sala) throw new Error('Esta fiscalização não está vinculada a uma operação em nuvem.');
  sincronizando = true;
  try {
    const { codigo, senha } = fisc.sala;
    // Dois marcadores, porque são dois relógios diferentes: `ultimoSync` é a hora
    // do servidor (define o que baixar) e `ultimoEnvio` é a hora deste aparelho
    // (define o que subir). Misturá-los faria um celular com a hora atrasada
    // parar de enviar os registros.
    const desde = fisc.sala.ultimoSync || null;
    const desdeLocal = fisc.sala.ultimoEnvio || null;
    const inicioLocal = new Date().toISOString();
    const locais = await listarVeiculos(fisc.id);

    const paraEnviar = locais
      .filter((v) => !desdeLocal || (v.atualizadoEm || '') > desdeLocal)
      .map((v) => ({ chave: chaveVeiculo(v), agente: v.inspetor || '', dados: v }));

    const resposta = await transporte().sync(codigo, senha, {
      fisc: fiscParaNuvem(fisc),
      veiculos: paraEnviar,
      removidos: (fisc.sala.removidos || []).map((chave) => ({ chave })),
      chavesLocais: locais.map((v) => chaveVeiculo(v)),
      desde,
    });

    // Cabeçalho da fiscalização — prevalece a versão mais recente.
    if (resposta.fiscalizacao && (resposta.fiscalizacao.atualizadoEm || '') > (fisc.atualizadoEm || '')) {
      const sala = fisc.sala;
      Object.assign(fisc, resposta.fiscalizacao, { id: fisc.id, sala });
    }

    // Exclusões feitas por outros aparelhos.
    let apagados = 0;
    const porChave = new Map(locais.map((v) => [chaveVeiculo(v), v]));
    for (const { chave, quando } of resposta.removidos || []) {
      const alvo = porChave.get(chave);
      if (!alvo) continue;
      if (quando && (alvo.atualizadoEm || '') > quando) continue; // reeditado depois: mantém
      await excluirVeiculo(alvo.id);
      porChave.delete(chave);
      apagados += 1;
    }

    // Veículos vindos da nuvem.
    let recebidos = 0;
    let ordem = await proximaOrdem(fisc.id);
    for (const remoto of resposta.veiculos || []) {
      const dados = remoto.dados;
      const local = porChave.get(remoto.chave);
      if (local) {
        if ((dados.atualizadoEm || '') > (local.atualizadoEm || '')) {
          await put('veiculos', { ...dados, id: local.id, fiscalizacaoId: fisc.id, ordem: local.ordem });
          recebidos += 1;
        }
      } else {
        const novo = { ...dados, id: uid('veic'), fiscalizacaoId: fisc.id, ordem: ordem++ };
        await put('veiculos', novo);
        porChave.set(remoto.chave, novo);
        recebidos += 1;
      }
    }

    let fotosEnviadas = 0;
    let fotosRecebidas = 0;
    let fotosPendentes = 0;
    if (comFotos) {
      const r = await sincronizarFotos(fisc, porChave, resposta.fotos || []);
      fotosEnviadas = r.enviadas;
      fotosRecebidas = r.recebidas;
      fotosPendentes = r.pendentes;
    } else {
      fotosPendentes = (await fotosDaFiscalizacao(fisc.id)).filter((f) => !f.sincronizada).length;
    }

    fisc = await obterFiscalizacao(fisc.id); // recarrega após as gravações acima
    fisc.sala = {
      ...fisc.sala,
      codigo,
      senha,
      ultimoSync: resposta.servidorEm,
      ultimoEnvio: inicioLocal,
      removidos: [],
    };
    await salvarFiscalizacao(fisc);

    return {
      enviados: paraEnviar.length,
      recebidos,
      apagados,
      fotosEnviadas,
      fotosRecebidas,
      fotosPendentes,
    };
  } finally {
    sincronizando = false;
  }
}

async function sincronizarFotos(fisc, porChave, metadadosRemotos) {
  const { codigo, senha } = fisc.sala;
  const locais = await fotosDaFiscalizacao(fisc.id);
  const origensLocais = new Set(locais.map((f) => f.origemId || f.id));

  // Envio (limitado por rodada, para não estourar conexões ruins).
  const pendentes = locais.filter((f) => !f.sincronizada);
  let enviadas = 0;
  const veiculoPorId = new Map([...porChave.values()].map((v) => [v.id, v]));
  for (const f of pendentes.slice(0, LIMITE_FOTOS_POR_SYNC)) {
    const veiculo = veiculoPorId.get(f.veiculoId);
    if (!veiculo) continue;
    const dataURL = await blobParaDataURL(f.blob);
    await transporte().enviarFoto(codigo, senha, {
      veiculoChave: chaveVeiculo(veiculo),
      origemId: f.origemId || f.id,
      legenda: f.legenda || '',
      agente: veiculo.inspetor || '',
      imagemBase64: dataURL.split(',')[1],
    });
    f.sincronizada = true;
    f.origemId = f.origemId || f.id;
    await put('fotos', f);
    enviadas += 1;
  }

  // Recebimento das fotos dos demais agentes.
  let recebidas = 0;
  const novas = metadadosRemotos.filter((m) => !origensLocais.has(m.origemId));
  for (const meta of novas.slice(0, LIMITE_FOTOS_POR_SYNC)) {
    const completa = await transporte().baixarFoto(codigo, senha, meta.id);
    if (!completa?.imagem) continue;
    const veiculo = porChave.get(completa.veiculoChave || meta.veiculoChave);
    if (!veiculo) continue;
    await put('fotos', {
      id: uid('foto'),
      origemId: completa.origemId || meta.origemId,
      veiculoId: veiculo.id,
      fiscalizacaoId: fisc.id,
      itemId: null,
      legenda: completa.legenda || '',
      criadoEm: completa.criadoEm || new Date().toISOString(),
      sincronizada: true,
      blob: await dataURLParaBlob(`data:image/jpeg;base64,${completa.imagem}`),
    });
    recebidas += 1;
  }

  const restantes = pendentes.length - enviadas + Math.max(0, novas.length - recebidas);
  return { enviadas, recebidas, pendentes: restantes };
}

/**
 * Produção por agente, calculada a partir do que já foi consolidado neste
 * aparelho — funciona igual nos dois transportes e também sem sinal.
 */
export async function painel(fisc) {
  if (!fisc?.sala) throw new Error('Fiscalização sem operação em nuvem.');
  const veiculos = await listarVeiculos(fisc.id);
  const fotos = await fotosDaFiscalizacao(fisc.id);
  const porAgente = new Map();
  for (const v of veiculos) {
    const nome = (v.inspetor || '').trim() || '(sem identificação)';
    const atual = porAgente.get(nome) || { agente: nome, veiculos: 0, ultimo: null };
    atual.veiculos += 1;
    if (!atual.ultimo || (v.atualizadoEm || '') > atual.ultimo) atual.ultimo = v.atualizadoEm;
    porAgente.set(nome, atual);
  }
  return {
    veiculos: veiculos.length,
    fotos: fotos.length,
    agentes: [...porAgente.values()].sort((a, b) => b.veiculos - a.veiculos),
  };
}

/** Quantidade de registros ainda não enviados (mostrado na barra superior). */
export async function pendencias(fisc) {
  if (!fisc?.sala) return null;
  const desde = fisc.sala.ultimoEnvio;
  const veiculos = await listarVeiculos(fisc.id);
  const fotos = await fotosDaFiscalizacao(fisc.id);
  return {
    veiculos: veiculos.filter((v) => !desde || (v.atualizadoEm || '') > desde).length,
    fotos: fotos.filter((f) => !f.sincronizada).length,
  };
}
