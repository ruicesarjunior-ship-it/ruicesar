#!/usr/bin/env node
/**
 * Gera uma versão do aplicativo em arquivo único (HTML + CSS + JS embutidos).
 *
 *   node scripts/gerar-arquivo-unico.mjs
 *   → dist/fiscalizacao-transporte-escolar.html
 *
 * Serve para publicar o aplicativo onde não é possível servir vários arquivos
 * (páginas hospedadas, anexos, pen drive). É gerado a partir dos mesmos fontes
 * de js/ e css/ — não edite o arquivo de saída, edite os fontes e rode de novo.
 *
 * Limitação: nessa forma não há service worker (o arquivo é único), então o
 * funcionamento offline depende do cache normal do navegador. A sincronização
 * em nuvem continua funcionando onde a hospedagem permitir conexões externas.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// Ordem de dependência entre os módulos.
const MODULOS = [
  'config.js',
  'db.js',
  'checklist.js',
  'fotos.js',
  'store.js',
  'relatorio.js',
  'backup.js',
  'nuvem-firebase.js',
  'nuvem.js',
  'app.js',
];

// Módulos consumidos por app.js como namespace (`import * as x`).
const NAMESPACES = { 'store.js': 'store', 'fotos.js': 'fotosApi', 'nuvem.js': 'nuvem', 'backup.js': 'backup' };

/** Remove as linhas de import, inclusive as quebradas em várias linhas. */
function removerImports(codigo) {
  const linhas = codigo.split('\n');
  const saida = [];
  let dentroDeImport = false;
  for (const linha of linhas) {
    if (dentroDeImport) {
      if (/;\s*$/.test(linha)) dentroDeImport = false;
      continue;
    }
    if (/^import[\s{]/.test(linha)) {
      if (!/;\s*$/.test(linha)) dentroDeImport = true;
      continue;
    }
    saida.push(linha);
  }
  return saida.join('\n');
}

/** Nomes exportados por um módulo, para montar o objeto de namespace. */
function nomesExportados(codigo) {
  const nomes = new Set();
  const re = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(codigo))) nomes.add(m[1]);
  const reChaves = /^export\s*\{([^}]*)\}/gm;
  while ((m = reChaves.exec(codigo))) {
    for (const parte of m[1].split(',')) {
      const nome = parte.split(/\s+as\s+/).pop().trim();
      if (nome) nomes.add(nome);
    }
  }
  return [...nomes];
}

const removerExports = (codigo) => codigo.replace(/^export\s+/gm, '').replace(/^export\s*\{[^}]*\};?\s*$/gm, '');

/** No arquivo único não existe sw.js ao lado; registrar geraria erro 404. */
function semServiceWorker(codigo, arquivo) {
  if (arquivo !== 'app.js') return codigo;
  const alvo = /if \('serviceWorker' in navigator\) \{[\s\S]*?\n  \}/;
  if (!alvo.test(codigo)) throw new Error('Trecho do service worker não encontrado em app.js.');
  return codigo.replace(alvo, '// (sem service worker nesta versão em arquivo único)');
}

async function principal() {
  const css = await readFile(join(RAIZ, 'css', 'estilos.css'), 'utf8');
  const html = await readFile(join(RAIZ, 'index.html'), 'utf8');

  const partes = [];
  const namespaces = [];
  for (const arquivo of MODULOS) {
    const bruto = await readFile(join(RAIZ, 'js', arquivo), 'utf8');
    const nome = NAMESPACES[arquivo];
    if (nome) {
      const nomes = nomesExportados(bruto);
      if (!nomes.length) throw new Error(`Nenhum export encontrado em ${arquivo}.`);
      namespaces.push(`const ${nome} = { ${nomes.join(', ')} };`);
    }
    partes.push(`\n// ===================== js/${arquivo} =====================\n`);
    partes.push(semServiceWorker(removerExports(removerImports(bruto)), arquivo));
    // Os namespaces precisam existir antes de app.js usá-los.
    if (arquivo === 'nuvem.js') partes.push(`\n// namespaces equivalentes aos "import * as"\n${namespaces.join('\n')}\n`);
  }

  // Corpo da página: o mesmo index.html, sem as referências a arquivos externos.
  const corpo = html
    .replace(/^[\s\S]*?<body>/, '')
    .replace(/<\/body>[\s\S]*$/, '')
    .trim();

  const titulo = 'Fiscalização Escolar';
  const saida = `<title>${titulo}</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f4c3a">
<style>
${css}
</style>

${corpo}

<script>
/* Aplicativo de Fiscalização do Transporte Escolar — arquivo único gerado por
   scripts/gerar-arquivo-unico.mjs a partir dos fontes em js/ e css/. */
(function () {
'use strict';
${partes.join('\n')}
})();
</script>
`;

  await mkdir(join(RAIZ, 'dist'), { recursive: true });
  const destino = join(RAIZ, 'dist', 'fiscalizacao-transporte-escolar.html');
  await writeFile(destino, saida);
  console.log(`Gerado: ${destino} (${(saida.length / 1024).toFixed(0)} KB)`);
}

principal().catch((e) => {
  console.error(`Falhou: ${e.message}`);
  process.exit(1);
});
