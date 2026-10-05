// Build in file unico: il WebAssembly è incorporato (base64) e passato direttamente a sql.js,
// senza fetch (il contesto della pagina pubblicata non permette di scaricare altri file).
import b64 from 'virtual:sqlite-wasm-base64';

export function opzioniSqlJs(): { locateFile?: (f: string) => string; wasmBinary?: ArrayBuffer } {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { wasmBinary: bytes.buffer };
}
