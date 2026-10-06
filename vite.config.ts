/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base relativa: la stessa build funziona su GitHub Pages (/nome-repo/), Netlify e Cloudflare Pages.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  worker: {
    format: 'es',
  },
  // PGlite carica da sé il proprio WebAssembly: non va pre-impacchettato in sviluppo
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Palestra SQL — Basi di Dati',
        short_name: 'Palestra SQL',
        description: 'Esercizi di query SQL (PostgreSQL) con modello ER, modello logico e verifica automatica. Funziona offline.',
        lang: 'it',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f172a',
        theme_color: '#1e3a8a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // compresi i file del motore PostgreSQL (WebAssembly, file di supporto .data e cartella dati .tar.gz);
        // initdb.wasm non serve perché la cartella dati arriva già pronta
        globPatterns: ['**/*.{js,css,html,wasm,data,gz,svg,png,ico,webmanifest}'],
        globIgnores: ['**/initdb*.wasm'],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // ogni file di test avvia un'istanza di PostgreSQL (PGlite)
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
