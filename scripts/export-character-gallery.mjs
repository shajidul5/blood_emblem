import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(process.argv[2] ?? resolve(root, 'dist', 'character-gallery-standalone.html'));
const result = await build({
  configFile: false, root, base: './', logLevel: 'warn',
  build: {
    write: false, assetsInlineLimit: Infinity, cssCodeSplit: false, reportCompressedSize: false,
    rollupOptions: { input: resolve(root, 'character-gallery.html'), output: { codeSplitting: false } },
  },
});
const output = result.output;
const script = output.find((file) => file.type === 'chunk' && file.isEntry);
const css = output.filter((file) => file.fileName.endsWith('.css')).map((file) => file.source).join('\n');
if (!script || output.some((file) => file.type === 'chunk' && !file.isEntry))
  throw new Error('The standalone gallery must contain exactly one JavaScript bundle.');
let html = await readFile(resolve(root, 'character-gallery.html'), 'utf8');
html = html.replace(/<script type="module" src="[^"]+"><\/script>/,
  () => `<script type="module">${script.code.replaceAll('</script', '<\\/script')}</script>`);
html = html.replace('</head>', () => `<style>${css}</style></head>`);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, html);
console.log(`Exported standalone gallery: ${destination} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB)`);
