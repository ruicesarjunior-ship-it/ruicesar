/**
 * Backup, transferência entre aparelhos e consolidação do trabalho da equipe.
 *
 * Cada integrante da equipe exporta o arquivo .json da sua fiscalização e envia
 * ao coordenador (WhatsApp, e-mail, cabo). O coordenador importa os arquivos:
 * veículos com a mesma placa são consolidados (prevalece a versão mais recente)
 * e os demais entram na sequência.
 */

import { put, uid } from './db.js';
import {
  obterFiscalizacao, listarVeiculos, salvarFiscalizacao, mesclarVeiculos,
  renumerar, novaFiscalizacao,
} from './store.js';
import { fotosDaFiscalizacao, fotosDoVeiculo, blobParaDataURL, dataURLParaBlob } from './fotos.js';

const FORMATO = 'fte-backup/1';

export async function exportar(fiscalizacaoId, { comFotos = true } = {}) {
  const fisc = await obterFiscalizacao(fiscalizacaoId);
  const veiculos = await listarVeiculos(fiscalizacaoId);
  const pacote = { formato: FORMATO, exportadoEm: new Date().toISOString(), fiscalizacao: fisc, veiculos, fotos: [] };
  if (comFotos) {
    const fotos = await fotosDaFiscalizacao(fiscalizacaoId);
    for (const f of fotos) {
      pacote.fotos.push({
        // `origemId` acompanha a foto entre aparelhos e evita duplicação
        // quando o mesmo arquivo é importado mais de uma vez.
        id: f.origemId || f.id,
        veiculoId: f.veiculoId,
        itemId: f.itemId || null,
        legenda: f.legenda || '',
        criadoEm: f.criadoEm,
        dataURL: await blobParaDataURL(f.blob),
      });
    }
  }
  return pacote;
}

/**
 * @param destinoId  fiscalização local que receberá os dados. Se null, cria uma
 *                   nova fiscalização a partir do pacote.
 */
export async function importar(pacote, destinoId = null) {
  if (!pacote || pacote.formato !== FORMATO) {
    throw new Error('Arquivo não reconhecido — selecione um backup gerado por este aplicativo.');
  }
  let fisc;
  if (destinoId) {
    fisc = await obterFiscalizacao(destinoId);
  } else {
    fisc = novaFiscalizacao({ ...pacote.fiscalizacao, id: uid('fisc') });
    await salvarFiscalizacao(fisc);
  }

  const { novos, atualizados, ignorados, mapaIds } = await mesclarVeiculos(fisc.id, pacote.veiculos || []);

  let fotosImportadas = 0;
  let fotosRepetidas = 0;
  const jaExistentes = new Map(); // veiculoId -> Set de origens já gravadas
  for (const f of pacote.fotos || []) {
    const veiculoId = mapaIds[f.veiculoId];
    if (!veiculoId) continue;
    if (!jaExistentes.has(veiculoId)) {
      const atuais = await fotosDoVeiculo(veiculoId);
      jaExistentes.set(veiculoId, new Set(atuais.map((x) => x.origemId || x.id)));
    }
    const origens = jaExistentes.get(veiculoId);
    if (origens.has(f.id)) {
      fotosRepetidas += 1;
      continue;
    }
    await put('fotos', {
      id: uid('foto'),
      origemId: f.id,
      veiculoId,
      fiscalizacaoId: fisc.id,
      itemId: f.itemId || null,
      legenda: f.legenda || '',
      criadoEm: f.criadoEm || new Date().toISOString(),
      blob: await dataURLParaBlob(f.dataURL),
    });
    origens.add(f.id);
    fotosImportadas += 1;
  }

  await renumerar(fisc.id);
  return { fiscalizacaoId: fisc.id, novos, atualizados, ignorados, fotos: fotosImportadas, fotosRepetidas };
}

export function baixarArquivo(conteudo, nome, tipo) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Extensões alternativas quando a hospedagem não aceita a original.
 * O relatório .doc é HTML por dentro, então .html preserva o conteúdo.
 */
function alternativas(nome) {
  if (/\.doc$/i.test(nome)) return [nome.replace(/\.doc$/i, '.html')];
  if (/\.csv$/i.test(nome)) return [nome.replace(/\.csv$/i, '.txt')];
  return [];
}

/**
 * Quando o aplicativo roda como página publicada no claude.ai, o navegador
 * bloqueia downloads comuns e a gravação passa por uma confirmação do próprio
 * visualizador. Fora desse ambiente, esta função simplesmente não se aplica.
 */
async function salvarPelaPagina(blob, nome) {
  const api = typeof globalThis.claude !== 'undefined' ? globalThis.claude : null;
  if (!api?.use) return false;
  const downloads = await api.use('downloads').catch(() => null);
  if (!downloads) return false;
  for (const tentativa of [nome, ...alternativas(nome)]) {
    try {
      await downloads.save({ filename: tentativa, data: blob });
      return true;
    } catch (e) {
      // Extensão recusada: tenta a alternativa. Recusa do usuário: respeita.
      if (e?.code === 'rejected_extension' || e?.code === 'extension_not_enabled') continue;
      if (e?.code === 'declined' || e?.code === 'rate_limited') return true;
      return false;
    }
  }
  return false;
}

/** Compartilhamento nativo do celular, com queda para download. */
export async function compartilharOuBaixar(conteudo, nome, tipo) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const file = new File([blob], nome, { type: tipo });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nome });
      return 'compartilhado';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelado';
    }
  }
  if (await salvarPelaPagina(blob, nome)) return 'salvo';
  baixarArquivo(blob, nome, tipo);
  return 'baixado';
}
