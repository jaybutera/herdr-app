// vitest's defineConfig is vite's plus the `test` key; importing it from
// 'vite' leaves `test` unknown to the type checker.
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

// Build hash shown in Settings > About. Falls back when the tree is not a repo
// yet, so a fresh clone still builds — and is overridable, because the hosted
// build happens in a container that was handed the files without the history.
function buildHash(): string {
  const given = process.env.ORCHA_BUILD_HASH?.trim();
  if (given) return given;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

// Tauri Android loads the bundle from a dev server on the host during `tauri
// android dev` and from the packaged assets otherwise. Relative base keeps the
// same build working when opened as a static file on the laptop.
export default defineConfig({
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_HASH__: JSON.stringify(buildHash()),
  },
  base: '/',
  clearScreen: false,
  server: { host: '0.0.0.0', port: 1420, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    // Tauri's asset embedder walks index.html; a build split across chunks left
    // the main bundle out of the APK (verified 2026-09-06 by listing the asset
    // keys inside libapp_lib.so). One chunk, and it is always picked up.
    modulePreload: { polyfill: false },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  test: {
    // The parser and formatting tests are plain functions and run in node,
    // where `import.meta.url` still resolves the fixture file. Only the
    // component tests need a DOM, so jsdom is opted into by filename rather
    // than made the default.
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/**/*.component.test.ts'],
        },
      },
      {
        extends: true,
        // Without the browser condition Vite hands back Svelte's server build,
        // whose `mount` throws: components render to a string on the server and
        // there is nothing to query.
        resolve: { conditions: ['browser'] },
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['test/**/*.component.test.ts'],
        },
      },
    ],
  },
});
