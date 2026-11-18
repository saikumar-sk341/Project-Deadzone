// Builds a single self-contained docs/index.html (GitHub Pages ready).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const dev = process.argv.includes('--dev');
const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !dev,
  target: ['es2020'],
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/style.css', 'utf8');
const html = readFileSync('src/index.html', 'utf8')
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js);
mkdirSync('docs', { recursive: true });
writeFileSync('docs/index.html', html);
console.log(`docs/index.html written (${(html.length / 1024).toFixed(0)} KB)`);
