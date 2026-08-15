#!/usr/bin/env node
/**
 * Configuração automática do aplicativo de fiscalização.
 *
 * Faz, sem nenhum clique em telas:
 *   1. cria (ou reaproveita) o projeto Supabase na região de São Paulo;
 *   2. executa o supabase/schema.sql nesse projeto;
 *   3. lê a chave pública do projeto e grava js/config.js;
 *   4. opcionalmente liga o GitHub Pages para publicar o aplicativo.
 *
 * COMO USAR (no seu computador, com Node.js 18 ou superior instalado):
 *
 *   1. Gere um token pessoal do Supabase em:
 *        https://supabase.com/dashboard/account/tokens   ("Generate new token")
 *   2. Na pasta do aplicativo, rode:
 *        node scripts/configurar.mjs
 *      e cole o token quando for pedido.
 *
 * Para ligar o GitHub Pages junto, tenha o GitHub CLI (`gh auth login`) instalado,
 * ou informe um token do GitHub com permissão de administração do repositório.
 *
 * Nenhum token é gravado em disco nem sai da sua máquina — vão apenas para as
 * APIs oficiais do Supabase e do GitHub.
 *
 * Se qualquer etapa falhar, o script informa exatamente o que fazer à mão.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.SUPABASE_API || 'https://api.supabase.com';
const NOME_PROJETO = process.env.PROJETO || 'fiscalizacao-transporte-escolar';
const REGIAO = process.env.REGIAO || 'sa-east-1'; // São Paulo

const cores = {
  ok: (t) => `\x1b[32m${t}\x1b[0m`,
  erro: (t) => `\x1b[31m${t}\x1b[0m`,
  destaque: (t) => `\x1b[1m${t}\x1b[0m`,
  fraco: (t) => `\x1b[90m${t}\x1b[0m`,
};

const passo = (n, t) => console.log(`\n${cores.destaque(`[${n}]`)} ${t}`);
const ok = (t) => console.log(`    ${cores.ok('✓')} ${t}`);
const aviso = (t) => console.log(`    ${cores.erro('!')} ${t}`);

async function perguntar(texto, { oculto = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (!oculto) return (await rl.question(texto)).trim();
    // Entrada sem eco, para tokens.
    process.stdout.write(texto);
    rl.close();
    return await new Promise((resolve) => {
      const stdin = process.stdin;
      const eraRaw = stdin.isRaw;
      stdin.setRawMode?.(true);
      stdin.resume();
      let valor = '';
      const aoTeclar = (buf) => {
        const c = buf.toString('utf8');
        if (c === '\r' || c === '\n') {
          stdin.setRawMode?.(eraRaw);
          stdin.pause();
          stdin.removeListener('data', aoTeclar);
          process.stdout.write('\n');
          resolve(valor.trim());
        } else if (c === '\u0003') {
          process.exit(1);
        } else if (c === '\u007f') {
          valor = valor.slice(0, -1);
        } else {
          valor += c;
        }
      };
      stdin.on('data', aoTeclar);
    });
  } finally {
    rl.close();
  }
}

async function api(caminho, { token, metodo = 'GET', corpo } = {}) {
  const resp = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resp.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  if (!resp.ok) {
    const e = new Error(dados?.message || dados?.error || `HTTP ${resp.status} em ${caminho}`);
    e.status = resp.status;
    e.corpo = dados;
    throw e;
  }
  return dados;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function senhaAleatoria() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(randomBytes(24))
    .map((n) => alfabeto[n % alfabeto.length])
    .join('');
}

// --------------------------------------------------------------------- etapas

async function acharOuCriarProjeto(token) {
  passo(1, 'Projeto no Supabase');
  const projetos = await api('/v1/projects', { token });
  const existente = (projetos || []).find((p) => p.name === NOME_PROJETO);
  if (existente) {
    ok(`projeto "${NOME_PROJETO}" já existe (${existente.id}).`);
    return existente;
  }

  const orgs = await api('/v1/organizations', { token });
  if (!orgs?.length) throw new Error('Nenhuma organização encontrada nesta conta Supabase.');
  const org = orgs[0];
  if (orgs.length > 1) ok(`usando a organização "${org.name}" (a primeira da conta).`);

  const senhaBanco = senhaAleatoria();
  console.log(`    ${cores.fraco('criando o projeto — isso leva de 1 a 3 minutos…')}`);
  const criado = await api('/v1/projects', {
    token,
    metodo: 'POST',
    corpo: {
      name: NOME_PROJETO,
      organization_id: org.id,
      region: REGIAO,
      plan: 'free',
      db_pass: senhaBanco,
    },
  });
  await writeFile(
    join(RAIZ, 'senha-do-banco.txt'),
    `Projeto: ${NOME_PROJETO}\nSenha do banco de dados: ${senhaBanco}\n\n` +
      'Guarde em local seguro e apague este arquivo depois. Esta senha NÃO é a senha da operação.\n'
  );
  ok(`projeto criado (${criado.id}). Senha do banco salva em senha-do-banco.txt.`);
  return criado;
}

async function esperarProjetoPronto(token, ref) {
  passo(2, 'Aguardando o banco ficar disponível');
  const limite = Date.now() + 8 * 60 * 1000;
  while (Date.now() < limite) {
    const p = await api(`/v1/projects/${ref}`, { token }).catch(() => null);
    const status = p?.status || 'DESCONHECIDO';
    if (status === 'ACTIVE_HEALTHY') {
      ok('banco pronto.');
      return true;
    }
    console.log(`    ${cores.fraco(`status: ${status} — aguardando…`)}`);
    await esperar(10000);
  }
  throw new Error('O projeto demorou demais para ficar pronto. Rode o script de novo em alguns minutos.');
}

async function aplicarSchema(token, ref) {
  passo(3, 'Criando tabelas e funções (schema.sql)');
  const sql = await readFile(join(RAIZ, 'supabase', 'schema.sql'), 'utf8');
  try {
    await api(`/v1/projects/${ref}/database/query`, { token, metodo: 'POST', corpo: { query: sql } });
    ok('schema aplicado.');
    return true;
  } catch (e) {
    aviso(`não foi possível aplicar automaticamente: ${e.message}`);
    console.log(
      `    Faça à mão (1 minuto): abra ${cores.destaque(`https://supabase.com/dashboard/project/${ref}/sql/new`)},\n` +
        '    cole o conteúdo de supabase/schema.sql e clique em Run.'
    );
    return false;
  }
}

async function pegarChaveAnon(token, ref) {
  passo(4, 'Chave pública do projeto');
  let chaves = await api(`/v1/projects/${ref}/api-keys?reveal=true`, { token }).catch(() => null);
  if (!chaves) chaves = await api(`/v1/projects/${ref}/api-keys`, { token }).catch(() => null);
  const anon = (chaves || []).find((k) => k.name === 'anon' || k.type === 'anon');
  const valor = anon?.api_key || anon?.apiKey;
  if (!valor) {
    aviso('não consegui ler a chave automaticamente.');
    console.log(
      `    Copie a chave "anon public" em ${cores.destaque(`https://supabase.com/dashboard/project/${ref}/settings/api`)}`
    );
    return await perguntar('    Cole a chave anon aqui (ou Enter para pular): ');
  }
  ok('chave obtida.');
  return valor;
}

async function gravarConfig(ref, chaveAnon) {
  passo(5, 'Gravando js/config.js');
  const caminho = join(RAIZ, 'js', 'config.js');
  const atual = await readFile(caminho, 'utf8');
  const novo = atual
    .replace(/SUPABASE_URL: '[^']*'/, `SUPABASE_URL: 'https://${ref}.supabase.co'`)
    .replace(/SUPABASE_ANON_KEY: '[^']*'/, `SUPABASE_ANON_KEY: '${chaveAnon}'`);
  if (novo === atual) {
    aviso('não encontrei os campos em js/config.js — preencha à mão:');
    console.log(`    SUPABASE_URL: 'https://${ref}.supabase.co'`);
    console.log(`    SUPABASE_ANON_KEY: '${chaveAnon}'`);
    return false;
  }
  await writeFile(caminho, novo);
  ok('js/config.js preenchido.');
  return true;
}

async function ligarGithubPages(repo, branch) {
  passo(6, 'Publicando no GitHub Pages');
  const [owner, nome] = repo.split('/');
  const corpo = JSON.stringify({ source: { branch, path: '/' } });
  try {
    await execFileAsync('gh', [
      'api', '-X', 'POST', `repos/${owner}/${nome}/pages`,
      '-H', 'Accept: application/vnd.github+json',
      '--input', '-',
    ], { input: corpo });
    ok('GitHub Pages ligado.');
  } catch (e) {
    const msg = String(e.stderr || e.message);
    if (/already exists|409/i.test(msg)) {
      ok('GitHub Pages já estava ligado.');
    } else {
      aviso('não foi possível ligar o Pages automaticamente.');
      console.log(
        `    Ligue à mão (30 segundos): ${cores.destaque(`https://github.com/${repo}/settings/pages`)}\n` +
          `    Source: "Deploy from a branch" → branch ${branch} → pasta / (root) → Save.`
      );
      return false;
    }
  }
  console.log(
    `    Endereço do aplicativo:\n    ${cores.destaque(`https://${owner}.github.io/${nome}/fiscalizacao-transporte-escolar/`)}`
  );
  return true;
}

// ----------------------------------------------------------------------- main

async function principal() {
  console.log(cores.destaque('\nConfiguração do aplicativo de Fiscalização do Transporte Escolar\n'));

  let token = process.env.SUPABASE_TOKEN;
  if (!token) {
    console.log('Gere um token pessoal em https://supabase.com/dashboard/account/tokens');
    console.log(cores.fraco('(o token fica só na sua máquina; nada é gravado em disco)\n'));
    token = await perguntar('Token do Supabase (sbp_...): ', { oculto: true });
  }
  if (!token?.startsWith('sbp_')) {
    console.log(cores.erro('\nToken inválido — ele começa com "sbp_". Nada foi alterado.'));
    process.exit(1);
  }

  const projeto = await acharOuCriarProjeto(token);
  const ref = projeto.id || projeto.ref;
  await esperarProjetoPronto(token, ref);
  await aplicarSchema(token, ref);
  const chave = await pegarChaveAnon(token, ref);
  if (chave) await gravarConfig(ref, chave);

  const repo = process.env.REPO || 'ruicesarjunior-ship-it/ruicesar';
  const branch = process.env.BRANCH || 'claude/school-transport-inspection-app-rj223v';
  const querPages = (await perguntar('\nLigar o GitHub Pages agora? (s/N) ')).toLowerCase();
  if (querPages === 's') await ligarGithubPages(repo, branch);

  console.log(cores.destaque('\n─────────────────────────────────────────────'));
  console.log(cores.ok('Configuração concluída.'));
  console.log('\nFalta apenas enviar a alteração de js/config.js:');
  console.log(cores.destaque(`\n  git add js/config.js && git commit -m "Configura servidor de sincronização" && git push\n`));
  console.log('Depois, no aplicativo: aba Equipe → criar a operação → "Enviar convite à equipe".');
}

principal().catch((e) => {
  console.error(cores.erro(`\nFalhou: ${e.message}`));
  if (e.corpo) console.error(cores.fraco(JSON.stringify(e.corpo, null, 2).slice(0, 800)));
  console.error('\nNada foi perdido — o passo a passo manual está em COMO_COLOCAR_NO_AR.md.');
  process.exit(1);
});
