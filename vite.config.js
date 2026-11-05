import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

// Rewritten sprite PNGs (sync tools, re-exports) would otherwise force a full page reload mid-battle.
const ignoreSpriteRewrites = {
  name: 'ignore-sprite-rewrites',
  apply: 'serve',
  hotUpdate({ file }) {
    if (/\/assets\/.+\.png$/i.test(file.replaceAll('\\', '/'))) return [];
  },
};

export default defineConfig({
  base: './',
  plugins: [ignoreSpriteRewrites],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        mapEditor: resolve(root, 'map-editor.html'),
      },
    },
  },
});
