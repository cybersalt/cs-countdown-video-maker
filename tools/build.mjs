// Bundles index.html + css/ + js/ into one self-contained file, for hosting the
// app as a single page (e.g. https://cybersalt.com/countdown.html).
//
//   node tools/build.mjs [output]      default output: dist/countdown.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] || 'dist/countdown.html');
const read = p => readFileSync(join(root, p), 'utf8');

let html = read('index.html');
let n = 0;

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  n++;
  return `<style>\n${read(href)}</style>`;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = read(src);
  if (/<\/script/i.test(code)) throw new Error(`${src} contains "</script" and can't be inlined`);
  n++;
  return `<script>\n// ── ${src}\n${code}</script>`;
});

if (/(?:src|href)="(?:css|js)\//.test(html)) throw new Error('a local css/js reference was not inlined');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Inlined ${n} files → ${out} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
