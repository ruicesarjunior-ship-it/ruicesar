// Sincronização em nuvem (Firebase Firestore) — opcional.
// Enquanto FIREBASE_CONFIG for null, a nuvem fica DESLIGADA e o app usa o banco
// mestre publicado + localStorage normalmente. Ao preencher a configuração do
// projeto Firebase, o banco de destinatários passa a sincronizar entre todos.
//
// Como ligar: substitua null pelo objeto de configuração do seu app web Firebase:
// export var FIREBASE_CONFIG = {
//   apiKey: "...", authDomain: "...", projectId: "...",
//   storageBucket: "...", messagingSenderId: "...", appId: "..."
// };
export var FIREBASE_CONFIG = null;

// Documento único que guarda o banco compartilhado: coleção "mpba", doc "banco".
var _db = null, _fs = null, _ready = null;

export function cloudAtivo() { return !!FIREBASE_CONFIG; }

export async function cloudInit() {
  if (!FIREBASE_CONFIG) return null;
  if (_ready) return _ready;
  _ready = (async function () {
    var appMod = await import("firebase/app");
    var authMod = await import("firebase/auth");
    _fs = await import("firebase/firestore");
    var app = appMod.initializeApp(FIREBASE_CONFIG);
    try { await authMod.signInAnonymously(authMod.getAuth(app)); } catch (e) { console.warn("anon auth:", e); }
    _db = _fs.getFirestore(app);
    return _db;
  })();
  return _ready;
}

function ref() { return _fs.doc(_db, "mpba", "banco"); }

export async function cloudLerBanco() {
  await cloudInit(); if (!_db) return null;
  var snap = await _fs.getDoc(ref());
  return snap.exists() ? snap.data() : null;
}

export async function cloudEscreverBanco(destinatarios) {
  await cloudInit(); if (!_db) return;
  await _fs.setDoc(ref(), { destinatarios: destinatarios, atualizado: new Date().toISOString() });
}

// Observa mudanças remotas; chama cb(data) a cada alteração. Retorna função para cancelar.
export async function cloudObservar(cb) {
  await cloudInit(); if (!_db) return function () {};
  return _fs.onSnapshot(ref(), function (snap) { if (snap.exists()) cb(snap.data()); });
}
