/**
 * Transporte de sincronização sobre o Firebase Realtime Database.
 *
 * Escolhido por reaproveitar o projeto Firebase que a Promotoria já mantém,
 * dispensando a criação de qualquer conta nova.
 *
 * SEGURANÇA — por que tudo sobe cifrado:
 * as regras de acesso desse banco não são administradas por este aplicativo, e
 * um banco compartilhado pode ser legível por qualquer sessão anônima. Como os
 * registros contêm dados pessoais de condutores (nome, CPF, CNH) e fotografias,
 * nada trafega em claro:
 *
 *   - a chave de cifra é derivada da SENHA da operação (PBKDF2-SHA256, 150 mil
 *     iterações, sal = código da operação) e nunca sai do aparelho;
 *   - cada registro é cifrado com AES-GCM 256 e vetor de inicialização próprio;
 *   - o próprio caminho no banco é o SHA-256 do código + senha, e as placas
 *     viram hash — nem o endereço do nó revela o que há dentro.
 *
 * Quem não tiver o código e a senha da operação não encontra o nó e, se
 * encontrar, lê apenas bytes embaralhados.
 */

const AUTH_PADRAO = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const REFRESH_PADRAO = 'https://securetoken.googleapis.com/v1/token';
const CHAVE_SESSAO = 'fte:firebaseSessao';

let cfg = null;
const cacheChaves = new Map();

/**
 * @param config {apiKey, databaseURL, authUrl?, refreshUrl?}
 * Os endpoints de autenticação são configuráveis para permitir emuladores e
 * testes automatizados; em produção valem os padrões do Firebase.
 */
export function configurarFirebase(config) {
  cfg = config?.apiKey && config?.databaseURL
    ? { authUrl: AUTH_PADRAO, refreshUrl: REFRESH_PADRAO, ...config }
    : null;
  return cfg;
}

export function firebaseDisponivel() {
  return !!cfg;
}

// ------------------------------------------------------------- autenticação

async function sessao() {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null');
  } catch {
    s = null;
  }
  if (s?.idToken && s.expiraEm > Date.now() + 60000) return s.idToken;

  if (s?.refreshToken) {
    const nova = await renovar(s.refreshToken).catch(() => null);
    if (nova) return nova;
  }
  return entrarAnonimo();
}

async function entrarAnonimo() {
  const resp = await fetch(`${cfg.authUrl}?key=${cfg.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const dados = await resp.json();
  if (!resp.ok) {
    throw new Error(
      dados?.error?.message === 'ADMIN_ONLY_OPERATION'
        ? 'O login anônimo está desativado no projeto Firebase. Ative-o em Authentication → Sign-in method.'
        : `Falha ao autenticar no servidor (${dados?.error?.message || resp.status}).`
    );
  }
  guardarSessao(dados.idToken, dados.refreshToken, Number(dados.expiresIn || 3600));
  return dados.idToken;
}

async function renovar(refreshToken) {
  const resp = await fetch(`${cfg.refreshUrl}?key=${cfg.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!resp.ok) return null;
  const d = await resp.json();
  guardarSessao(d.id_token, d.refresh_token, Number(d.expires_in || 3600));
  return d.id_token;
}

function guardarSessao(idToken, refreshToken, expiraEmSegundos) {
  localStorage.setItem(
    CHAVE_SESSAO,
    JSON.stringify({ idToken, refreshToken, expiraEm: Date.now() + expiraEmSegundos * 1000 })
  );
}

// ------------------------------------------------------------------- cifra

const texto = new TextEncoder();
const decodificador = new TextDecoder();

function base64(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

function deBase64(txt) {
  const bin = atob(txt);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(txt) {
  const buf = await crypto.subtle.digest('SHA-256', texto.encode(txt));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function chaveDe(codigo, senha) {
  const id = `${codigo}::${senha}`;
  if (cacheChaves.has(id)) return cacheChaves.get(id);
  const base = await crypto.subtle.importKey('raw', texto.encode(senha), 'PBKDF2', false, ['deriveKey']);
  const chave = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: texto.encode(`fte:${codigo}`), iterations: 150000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  cacheChaves.set(id, chave);
  return chave;
}

async function cifrar(valor, chave) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = texto.encode(JSON.stringify(valor));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, dados);
  return `${base64(iv)}.${base64(ct)}`;
}

async function decifrar(pacote, chave) {
  if (typeof pacote !== 'string' || !pacote.includes('.')) return null;
  const [ivB64, ctB64] = pacote.split('.');
  try {
    const claro = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: deBase64(ivB64) },
      chave,
      deBase64(ctB64)
    );
    return JSON.parse(decodificador.decode(claro));
  } catch {
    return null; // senha diferente ou registro corrompido
  }
}

/** Identificador do nó da operação: só quem tem código e senha o encontra. */
async function idSala(codigo, senha) {
  return (await sha256Hex(`fte-sala:${codigo}:${senha}`)).slice(0, 40);
}

/** Placas não podem virar nome de nó — viram hash. */
async function idChave(chave, sala) {
  return (await sha256Hex(`${sala}:${chave}`)).slice(0, 32);
}

// -------------------------------------------------------------- acesso REST

async function db(caminho, { metodo = 'GET', corpo, query = '' } = {}) {
  const token = await sessao();
  const url = `${cfg.databaseURL.replace(/\/+$/, '')}/${caminho}.json?auth=${encodeURIComponent(token)}${query}`;
  let resp;
  try {
    resp = await fetch(url, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new Error('Sem conexão com o servidor.');
  }
  if (resp.status === 401) {
    localStorage.removeItem(CHAVE_SESSAO);
    throw new Error('Sessão expirada — toque em sincronizar novamente.');
  }
  if (resp.status === 403) {
    throw new Error(
      'O banco recusou o acesso. Confira as regras do Realtime Database (é preciso permitir leitura e escrita em "fiscalizacao" para usuários autenticados).'
    );
  }
  if (!resp.ok) throw new Error(`Falha na sincronização (HTTP ${resp.status}).`);
  const txt = await resp.text();
  return txt && txt !== 'null' ? JSON.parse(txt) : null;
}

// ------------------------------------------------------------- o transporte

export const transporteFirebase = {
  nome: 'firebase',

  async criar(codigo, senha, fisc) {
    const sala = await idSala(codigo, senha);
    const existente = await db(`fiscalizacao/${sala}/meta`);
    if (existente) {
      throw new Error(`Já existe uma operação com o código ${codigo}. Use "Entrar na operação".`);
    }
    const chave = await chaveDe(codigo, senha);
    await db(`fiscalizacao/${sala}/meta`, {
      metodo: 'PUT',
      corpo: { criadoEm: new Date().toISOString(), versao: 1 },
    });
    await db(`fiscalizacao/${sala}/fisc`, {
      metodo: 'PUT',
      corpo: { cifra: await cifrar(fisc, chave), atualizadoEm: fisc.atualizadoEm || new Date().toISOString() },
    });
    return { codigo };
  },

  async entrar(codigo, senha) {
    const sala = await idSala(codigo, senha);
    const meta = await db(`fiscalizacao/${sala}/meta`);
    if (!meta) throw new Error('Código ou senha da operação inválidos.');
    const chave = await chaveDe(codigo, senha);
    const no = await db(`fiscalizacao/${sala}/fisc`);
    const fiscalizacao = no?.cifra ? await decifrar(no.cifra, chave) : null;
    if (no?.cifra && !fiscalizacao) throw new Error('Senha da operação incorreta.');
    return { codigo, fiscalizacao };
  },

  async sync(codigo, senha, { fisc, veiculos = [], removidos = [], chavesLocais = [] }) {
    const sala = await idSala(codigo, senha);
    const chave = await chaveDe(codigo, senha);

    // As placas viram hash no caminho do banco; para reconhecer as exclusões
    // vindas de outros aparelhos, refaz-se o hash das placas conhecidas aqui.
    const porHash = new Map();
    for (const c of chavesLocais) porHash.set(await idChave(c, sala), c);

    // 1. Estado atual da nuvem.
    const [noFisc, remotos, lapides] = await Promise.all([
      db(`fiscalizacao/${sala}/fisc`),
      db(`fiscalizacao/${sala}/veiculos`),
      db(`fiscalizacao/${sala}/removidos`),
    ]);

    // 2. Exclusões feitas neste aparelho.
    const agora = new Date().toISOString();
    for (const { chave: placa } of removidos) {
      const id = await idChave(placa, sala);
      await db(`fiscalizacao/${sala}/removidos/${id}`, { metodo: 'PUT', corpo: { quando: agora } });
      await db(`fiscalizacao/${sala}/veiculos/${id}`, { metodo: 'DELETE' });
      if (remotos) delete remotos[id];
    }

    // 3. Envio: vence sempre o registro editado por último.
    for (const v of veiculos) {
      const id = await idChave(v.chave, sala);
      const remoto = remotos?.[id];
      if (remoto && (remoto.atualizadoEm || '') >= (v.dados.atualizadoEm || '')) continue;
      const morto = lapides?.[id]?.quando;
      if (morto && morto > (v.dados.atualizadoEm || '')) continue;
      const corpo = {
        cifra: await cifrar({ dados: v.dados, agente: v.agente, chave: v.chave }, chave),
        atualizadoEm: v.dados.atualizadoEm || agora,
      };
      await db(`fiscalizacao/${sala}/veiculos/${id}`, { metodo: 'PUT', corpo });
      if (remotos) remotos[id] = corpo;
    }

    // 4. Cabeçalho da fiscalização.
    let fiscalizacao = noFisc?.cifra ? await decifrar(noFisc.cifra, chave) : null;
    if (fisc && (fisc.atualizadoEm || '') > (noFisc?.atualizadoEm || '')) {
      await db(`fiscalizacao/${sala}/fisc`, {
        metodo: 'PUT',
        corpo: { cifra: await cifrar(fisc, chave), atualizadoEm: fisc.atualizadoEm || agora },
      });
      fiscalizacao = fisc;
    }

    // 5. Devolve o que existe na nuvem para o motor de mesclagem local.
    const saida = [];
    for (const registro of Object.values(remotos || {})) {
      const aberto = await decifrar(registro.cifra, chave);
      if (aberto?.dados) saida.push({ chave: aberto.chave, dados: aberto.dados, agente: aberto.agente || '' });
    }

    const fotos = [];
    const listaFotos = await db(`fiscalizacao/${sala}/fotos`, { query: '&shallow=true' });
    for (const id of Object.keys(listaFotos || {})) fotos.push({ id, origemId: id });

    const removidosSaida = [];
    for (const [id, valor] of Object.entries(lapides || {})) {
      const placa = porHash.get(id);
      if (placa) removidosSaida.push({ chave: placa, quando: valor?.quando || null });
    }

    return { servidorEm: agora, fiscalizacao, veiculos: saida, removidos: removidosSaida, fotos };
  },

  async enviarFoto(codigo, senha, { veiculoChave, origemId, legenda, agente, imagemBase64 }) {
    const sala = await idSala(codigo, senha);
    const chave = await chaveDe(codigo, senha);
    await db(`fiscalizacao/${sala}/fotos/${origemId}`, {
      metodo: 'PUT',
      corpo: {
        cifra: await cifrar({ veiculoChave, legenda, agente, imagem: imagemBase64 }, chave),
        criadoEm: new Date().toISOString(),
      },
    });
  },

  async baixarFoto(codigo, senha, id) {
    const sala = await idSala(codigo, senha);
    const chave = await chaveDe(codigo, senha);
    const no = await db(`fiscalizacao/${sala}/fotos/${id}`);
    if (!no?.cifra) return null;
    const aberto = await decifrar(no.cifra, chave);
    if (!aberto) return null;
    return {
      origemId: id,
      veiculoChave: aberto.veiculoChave,
      legenda: aberto.legenda || '',
      criadoEm: no.criadoEm,
      imagem: aberto.imagem,
    };
  },
};

/** Identificador do nó — exposto para o diagnóstico da tela "Equipe". */
export { idSala };
