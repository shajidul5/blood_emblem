import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { defineConfig, normalizePath } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

// Vite's eager URL globs otherwise fetch a JavaScript module for every map sprite on cold starts.
function serveSpriteUrls() {
  let base;
  const sourceRoot = `${normalizePath(resolve(root, 'src'))}/`;
  return {
    name: 'serve-sprite-urls',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      base = config.base;
    },
    transform(source, id, options) {
      if (options?.ssr || !id.startsWith(sourceRoot) || !id.endsWith('.js') || !fs.globSync) return;
      const code = source.replace(
        /import\.meta\.glob\(\s*'((?:\.\.\/)+assets\/[^']+)'\s*,\s*\{\s*eager:\s*true,\s*query:\s*'\?url',\s*import:\s*'default',?\s*\}\s*,?\s*\)/g,
        (glob, pattern) => {
          const rooted = normalizePath(relative(root, resolve(dirname(id), pattern)));
          if (!rooted.startsWith('assets/')) return glob;
          return JSON.stringify(Object.fromEntries(fs.globSync(rooted, { cwd: root })
            .map(normalizePath)
            .sort()
            .map((file) => [
              normalizePath(relative(dirname(id), resolve(root, file))),
              `${base}${file.split('/').map(encodeURIComponent).join('/')}`,
            ])));
        },
      );
      return code === source ? undefined : { code, map: null };
    },
  };
}

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
  plugins: [serveSpriteUrls(), ignoreSpriteRewrites],
  build: {
    // Open preview tabs still reference the previous build's hashed maps and battle art.
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        mapEditor: resolve(root, 'map-editor.html'),
        characterGallery: resolve(root, 'character-gallery.html'),
      },
    },
  },
});
