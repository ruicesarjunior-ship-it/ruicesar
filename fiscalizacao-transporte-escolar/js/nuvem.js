/**
 * Sincronização da equipe (opcional).
 *
 * O aplicativo continua sendo "offline-first": tudo é gravado primeiro no
 * aparelho. Esta camada apenas empurra o que mudou para a nuvem e traz o que os
 * outros agentes registraram, quando houver sinal. Sem configuração de servidor,
 * nada aqui é executado e o aplicativo funciona exatamente como antes.
 *
 * Servidor: projeto Supabase do próprio usuário (ver supabase/schema.sql).
 * Autenticação: código + senha da operação, verificados no banco; as tabelas
 * não são acessíveis diretamente com a chave pública.
 */

import { put } from './db.js';
import {
  listarVeiculos, salvarFiscalizacao, obterFiscalizacao, normalizarPlaca,
  proximaOrdem, excluirVeiculo, novaFiscalizacao,
} from './store.js';
import { fotosDaFiscalizacao, blobParaDataURL, dataURLParaBlob } from './fotos.js';
import { uid } from './db.js';

const CHAVE_CFG = 'fte:nuvem';
const LIMITE_FOTOS_POR_SYNC = 8; // evita travar a sincronização numa conexão ruim

// ------------------------------------------------------------ configuração

export function configNuvem() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CFG) || 'null');
  } catch {
    return null;
  }
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

/** Chamada a uma função do banco (RPC). */
export async function rpc(funcao, params) {
  const cfg = configNuvem();
  if (!cfg) throw new Error('Servidor de sincronização não configurado.');
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
  const texto = await resp.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }
  if (!resp.ok) {
    throw new Error(corpo?.message || corpo?.hint || `Falha na sincronização (HTTP ${resp.status}).`);
  }
  return corpo;
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
  await rpc('fisc_criar', { p_codigo: codigo, p_senha: senha, p_dados: fiscParaNuvem(fisc) });
  fisc.sala = { codigo: codigo.trim().toUpperCase(), senha, ultimoSync: null, removidos: [] };
  await salvarFiscalizacao(fisc);
  return fisc;
}

/**
 * Entra numa operação já existente. Se `fiscLocal` for informada, ela é vinculada
 * à sala; caso contrário é criada uma fiscalização local a partir da nuvem.
 */
export async function entrarSala(fiscLocal, codigo, senha) {
  const r = await rpc('fisc_entrar', { p_codigo: codigo, p_senha: senha });
  let fisc = fiscLocal;
  if (!fisc) {
    fisc = novaFiscalizacao({ ...r.fiscalizacao, id: uid('fisc') });
  } else if (r.fiscalizacao) {
    Object.assign(fisc, r.fiscalizacao, { id: fisc.id });
  }
  fisc.sala = { codigo: String(r.codigo), senha, ultimoSync: null, removidos: [] };
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

    const resposta = await rpc('fisc_sync', {
      p_codigo: codigo,
      p_senha: senha,
      p_fisc: fiscParaNuvem(fisc),
      p_veiculos: paraEnviar,
      p_removidos: (fisc.sala.removidos || []).map((chave) => ({ chave })),
      p_desde: desde,
    });

    // Cabeçalho da fiscalização — prevalece a versão mais recente.
    if (resposta.fiscalizacao && (resposta.fiscalizacao.atualizadoEm || '') > (fisc.atualizadoEm || '')) {
      const sala = fisc.sala;
      Object.assign(fisc, resposta.fiscalizacao, { id: fisc.id, sala });
    }

    // Exclusões feitas por outros aparelhos.
    let apagados = 0;
    const porChave = new Map(locais.map((v) => [chaveVeiculo(v), v]));
    for (const chave of resposta.removidos || []) {
      const alvo = porChave.get(chave);
      if (alvo) {
        await excluirVeiculo(alvo.id);
        porChave.delete(chave);
        apagados += 1;
      }
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
    await rpc('fisc_foto_enviar', {
      p_codigo: codigo,
      p_senha: senha,
      p_veiculo_chave: chaveVeiculo(veiculo),
      p_origem_id: f.origemId || f.id,
      p_legenda: f.legenda || '',
      p_agente: veiculo.inspetor || '',
      p_imagem: dataURL.split(',')[1],
    });
    f.sincronizada = true;
    await put('fotos', f);
    enviadas += 1;
  }

  // Recebimento das fotos dos demais agentes.
  let recebidas = 0;
  const novas = metadadosRemotos.filter((m) => !origensLocais.has(m.origemId));
  for (const meta of novas.slice(0, LIMITE_FOTOS_POR_SYNC)) {
    const veiculo = porChave.get(meta.veiculoChave);
    if (!veiculo) continue;
    const completa = await rpc('fisc_foto_baixar', { p_codigo: codigo, p_senha: senha, p_id: meta.id });
    if (!completa?.imagem) continue;
    await put('fotos', {
      id: uid('foto'),
      origemId: completa.origemId,
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

  const restantes =
    pendentes.length - enviadas + Math.max(0, novas.length - recebidas);
  return { enviadas, recebidas, pendentes: restantes };
}

/** Produção consolidada por agente (painel do coordenador). */
export async function painel(fisc) {
  if (!fisc?.sala) throw new Error('Fiscalização sem operação em nuvem.');
  return rpc('fisc_painel', { p_codigo: fisc.sala.codigo, p_senha: fisc.sala.senha });
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
