#!/usr/bin/env node
'use strict';

// Empacota a extensão para Chrome/Edge e Firefox em extension/dist/{chrome,firefox}.
// Sem dependências externas (só fs/path/child_process do Node) — roda com
// `npm run build` ou `node scripts/build.js`.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const TARGETS = [
  { name: 'chrome', manifest: 'manifest.chrome.json' }, // também usado pelo Edge
  { name: 'firefox', manifest: 'manifest.firefox.json' },
];

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function build(target) {
  const outDir = path.join(DIST, target.name);
  resetDir(outDir);

  fs.cpSync(path.join(ROOT, 'src'), path.join(outDir, 'src'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'icons'), path.join(outDir, 'icons'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, target.manifest), path.join(outDir, 'manifest.json'));

  validateManifest(outDir);
  console.log(`[build] ${target.name}: pacote gerado em ${path.relative(ROOT, outDir)}`);

  tryZip(outDir, target.name);
}

/**
 * Confere que o manifest é JSON válido e que todo arquivo que ele referencia
 * (ícones, scripts, páginas) realmente existe no pacote final — evita
 * publicar/carregar uma extensão quebrada por um caminho errado.
 */
function validateManifest(outDir) {
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const referenced = [];
  const collectIcons = (icons) => Object.values(icons || {}).forEach((p) => referenced.push(p));

  collectIcons(manifest.icons);
  if (manifest.action) {
    collectIcons(manifest.action.default_icon);
    if (manifest.action.default_popup) referenced.push(manifest.action.default_popup);
  }
  if (manifest.options_page) referenced.push(manifest.options_page);
  if (manifest.background) {
    if (manifest.background.service_worker) referenced.push(manifest.background.service_worker);
    (manifest.background.scripts || []).forEach((p) => referenced.push(p));
  }
  (manifest.content_scripts || []).forEach((cs) => (cs.js || []).forEach((p) => referenced.push(p)));

  const missing = referenced.filter((rel) => !fs.existsSync(path.join(outDir, rel)));
  if (missing.length > 0) {
    throw new Error(`Manifest referencia arquivo(s) inexistente(s): ${missing.join(', ')}`);
  }
}

function tryZip(outDir, name) {
  const zipPath = path.join(DIST, `factai-${name}.zip`);
  fs.rmSync(zipPath, { force: true });
  const result = spawnSync('zip', ['-r', '-q', zipPath, '.'], { cwd: outDir });
  if (result.error || result.status !== 0) {
    console.log(`[build] (opcional) não foi possível gerar ${path.basename(zipPath)} automaticamente — zipe a pasta manualmente se for publicar na loja.`);
    return;
  }
  console.log(`[build] ${name}: zip gerado em ${path.relative(ROOT, zipPath)}`);
}

resetDir(DIST);
for (const target of TARGETS) build(target);
console.log('[build] concluído.');
