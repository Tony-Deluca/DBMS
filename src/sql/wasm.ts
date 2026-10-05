// Dove sql.js trova il file WebAssembly di SQLite (build normale: file a parte, messo in cache dal service worker).
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';

export function opzioniSqlJs(): { locateFile?: (f: string) => string; wasmBinary?: ArrayBuffer } {
  return { locateFile: () => wasmUrl };
}
