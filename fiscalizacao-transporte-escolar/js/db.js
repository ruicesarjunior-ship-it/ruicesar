/**
 * Camada de persistência local (IndexedDB).
 *
 * Todos os dados ficam no próprio aparelho — nada é enviado para servidores.
 * Object stores:
 *   fiscalizacoes: { id, numero, ano, data, hora, municipio, ... }
 *   veiculos:      { id, fiscalizacaoId, ordem, placa, itens, ... }
 *   fotos:         { id, veiculoId, fiscalizacaoId, blob, legenda, criadoEm }
 */

const DB_NAME = 'fte-db';
const DB_VERSION = 1;

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('fiscalizacoes')) {
        db.createObjectStore('fiscalizacoes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('veiculos')) {
        const s = db.createObjectStore('veiculos', { keyPath: 'id' });
        s.createIndex('fiscalizacaoId', 'fiscalizacaoId', { unique: false });
      }
      if (!db.objectStoreNames.contains('fotos')) {
        const s = db.createObjectStore('fotos', { keyPath: 'id' });
        s.createIndex('veiculoId', 'veiculoId', { unique: false });
        s.createIndex('fiscalizacaoId', 'fiscalizacaoId', { unique: false });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(store, obj) {
  const s = await tx(store, 'readwrite');
  await wrap(s.put(obj));
  return obj;
}

export async function get(store, id) {
  const s = await tx(store, 'readonly');
  return wrap(s.get(id));
}

export async function getAll(store) {
  const s = await tx(store, 'readonly');
  return wrap(s.getAll());
}

export async function getAllBy(store, index, value) {
  const s = await tx(store, 'readonly');
  return wrap(s.index(index).getAll(value));
}

export async function remove(store, id) {
  const s = await tx(store, 'readwrite');
  return wrap(s.delete(id));
}

export async function removeAllBy(store, index, value) {
  const itens = await getAllBy(store, index, value);
  await Promise.all(itens.map((i) => remove(store, i.id)));
  return itens.length;
}

export function uid(prefix = 'id') {
  const rand = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}_${rand[0].toString(36)}${rand[1].toString(36)}`;
}

/** Estimativa de uso de armazenamento, para avisar antes de encher o aparelho. */
export async function uso() {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}
