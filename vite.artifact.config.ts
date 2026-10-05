// Build in un unico file HTML (JS, CSS, worker e WebAssembly incorporati) da pubblicare
// come pagina su claude.ai e aprire da Safari su iPad. Uso: npm run build:artifact
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const sql = fileURLToPath(new URL('./src/sql/', import.meta.url));

const ID_WASM = 'virtual:sqlite-wasm-base64';

/** Sostituisce wasm.ts e creaWorker.ts con le varianti ".artifact" e fornisce il WASM in base64. */
function varianteArtifact(): Plugin {
  return {
    name: 'variante-artifact',
    enforce: 'pre',
    load(id) {
      if (id !== '\0' + ID_WASM) return null;
      const wasm = readFileSync(fileURLToPath(new URL('./node_modules/sql.js/dist/sql-wasm-browser.wasm', import.meta.url)));
      return `export default ${JSON.stringify(wasm.toString('base64'))};`;
    },
    async resolveId(id, importer) {
      if (id === ID_WASM) return '\0' + ID_WASM;
      if (!importer || !importer.startsWith(sql)) return null;
      if (id === './wasm') return `${sql}wasm.artifact.ts`;
      if (id === './creaWorker') return `${sql}creaWorker.artifact.ts`;
      return null;
    },
  };
}

export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_ARTIFACT': JSON.stringify('1') },
  plugins: [varianteArtifact()],
  worker: { format: 'es', plugins: () => [varianteArtifact()] },
  build: {
    outDir: 'dist-artifact',
    target: 'es2020',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { output: { codeSplitting: false } },
  },
});
