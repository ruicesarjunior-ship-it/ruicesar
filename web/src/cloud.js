// Sincronização em nuvem (Firebase Realtime Database) — opcional e GRÁTIS (plano Spark).
// Enquanto FIREBASE_CONFIG for null, a nuvem fica DESLIGADA e o app usa o banco
// mestre publicado + localStorage normalmente. Ao preencher a configuração do
// projeto Firebase, o banco de destinatários passa a sincronizar entre todos.
//
// A config vem do Firebase (Configurações do projeto → app Web) e DEVE incluir
// "databaseURL" (aparece depois de criar o Realtime Database). Ex.:
// export var FIREBASE_CONFIG = {
//   apiKey: "...", authDomain: "...", databaseURL: "https://xxx.firebaseio.com",
//   projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..."
// };
export var FIREBASE_CONFIG = null;

var _db = null, _fs = null, _ready = null;
var CAMINHO = "mpba/banco"; // nó único com o banco compartilhado

export function cloudAtivo() { return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL); }

export async function cloudInit() {
  if (!cloudAtivo()) return null;
  if (_ready) return _ready;
  _ready = (async function () {
    var appMod = await import("firebase/app");
    var authMod = await import("firebase/auth");
    _fs = await import("firebase/database");
    var app = appMod.initializeApp(FIREBASE_CONFIG);
    try { await authMod.signInAnonymously(authMod.getAuth(app)); } catch (e) { console.warn("anon auth:", e); }
    _db = _fs.getDatabase(app);
    return _db;
  })();
  return _ready;
}

function lerVal(val) {
  if (!val) return null;
  var dest = [];
  try { dest = val.json ? JSON.parse(val.json) : (Array.isArray(val.destinatarios) ? val.destinatarios : []); } catch (e) {}
  return { destinatarios: dest, atualizado: val.atualizado };
}

export async function cloudLerBanco() {
  await cloudInit(); if (!_db) return null;
  var snap = await _fs.get(_fs.ref(_db, CAMINHO));
  return snap.exists() ? lerVal(snap.val()) : null;
}

export async function cloudEscreverBanco(destinatarios) {
  await cloudInit(); if (!_db) return;
  // Guarda como string JSON para evitar as conversoes de array do Realtime Database.
  await _fs.set(_fs.ref(_db, CAMINHO), { json: JSON.stringify(destinatarios), atualizado: new Date().toISOString() });
}

// Observa mudanças remotas; chama cb({destinatarios}) a cada alteração. Retorna função para cancelar.
export async function cloudObservar(cb) {
  await cloudInit(); if (!_db) return function () {};
  return _fs.onValue(_fs.ref(_db, CAMINHO), function (snap) {
    var d = lerVal(snap.val());
    if (d) cb(d);
  });
}
