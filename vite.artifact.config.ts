// Build in un unico file HTML (JS, CSS, worker e motore PostgreSQL incorporati) da pubblicare
// come pagina su claude.ai e aprire da Safari su iPad. Uso: npm run build:artifact
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const sql = fileURLToPath(new URL('./src/sql/', import.meta.url));
const pglite = fileURLToPath(new URL('./node_modules/@electric-sql/pglite/dist/', import.meta.url));

const ID_RISORSE = 'virtual:pglite-risorse';

/**
 * Sostituisce risorse.ts e creaWorker.ts con le varianti ".artifact" e fornisce i file del motore
 * (WebAssembly e file di supporto compressi con gzip, cartella dati già compressa) in base64.
 * I riferimenti di PGlite ai propri file vengono neutralizzati: altrimenti verrebbero incorporati una
 * seconda volta, non compressi, dentro il worker.
 */
function varianteArtifact(): Plugin {
  return {
    name: 'variante-artifact',
    enforce: 'pre',
    load(id) {
      if (id !== '\0' + ID_RISORSE) return null;
      const b64 = (b: Buffer) => JSON.stringify(b.toString('base64'));
      const wasm = gzipSync(readFileSync(`${pglite}pglite.wasm`), { level: 9 });
      const data = gzipSync(readFileSync(`${pglite}pglite.data`), { level: 9 });
      const datadir = readFileSync(`${sql}pg/datadir.tar.gz`);
      return `export const wasm = ${b64(wasm)};\nexport const data = ${b64(data)};\nexport const datadir = ${b64(datadir)};`;
    },
    transform(codice, id) {
      if (!id.startsWith(pglite) || !id.endsWith('.js')) return null;
      return codice.replace(/new URL\("\.?\/?(pglite\.wasm|pglite\.data|initdb\.wasm)",\s*import\.meta\.url\)/g, 'new URL("data:,$1")');
    },
    async resolveId(id, importer) {
      if (id === ID_RISORSE) return '\0' + ID_RISORSE;
      if (!importer || !importer.startsWith(sql)) return null;
      if (id === './risorse') return `${sql}risorse.artifact.ts`;
      if (id === './creaWorker') return `${sql}creaWorker.artifact.ts`;
      return null;
    },
  };
}

export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_ARTIFACT': JSON.stringify('1') },
  plugins: [varianteArtifact()],
  // anche il worker in un solo pezzo: un worker avviato da URL blob: non può importare altri file
  worker: { format: 'es', plugins: () => [varianteArtifact()], rollupOptions: { output: { codeSplitting: false } } },
  build: {
    outDir: 'dist-artifact',
    target: 'es2022',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 20000,
    rollupOptions: { output: { codeSplitting: false } },
  },
});
