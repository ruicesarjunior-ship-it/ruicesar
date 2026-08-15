/**
 * Captura e tratamento das fotografias.
 *
 * As imagens são redimensionadas e recomprimidas no próprio aparelho antes de
 * serem gravadas, para que uma fiscalização com dezenas de veículos caiba na
 * memória do celular e o relatório final não fique impossível de compartilhar.
 */

import { put, getAllBy, remove, uid } from './db.js';

const LADO_MAXIMO = 1400; // px
const QUALIDADE = 0.72;

/** Redimensiona/comprime um File de imagem e devolve um Blob JPEG. */
export async function comprimir(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // formato exótico: grava como veio
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALIDADE));
  return blob || file;
}

export async function salvarFotos(files, { veiculoId, fiscalizacaoId, itemId = null }) {
  const salvas = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const blob = await comprimir(file);
    const foto = {
      id: uid('foto'),
      veiculoId,
      fiscalizacaoId,
      itemId,
      blob,
      legenda: '',
      criadoEm: new Date().toISOString(),
    };
    await put('fotos', foto);
    salvas.push(foto);
  }
  return salvas;
}

export function fotosDoVeiculo(veiculoId) {
  return getAllBy('fotos', 'veiculoId', veiculoId);
}

export function fotosDaFiscalizacao(fiscalizacaoId) {
  return getAllBy('fotos', 'fiscalizacaoId', fiscalizacaoId);
}

export function excluirFoto(id) {
  return remove('fotos', id);
}

export function atualizarFoto(foto) {
  return put('fotos', foto);
}

/** Converte um Blob em data URL (usado na montagem do relatório e no backup). */
export function blobParaDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export async function dataURLParaBlob(dataURL) {
  const resp = await fetch(dataURL);
  return resp.blob();
}
