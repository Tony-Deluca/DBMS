declare module 'sql.js/dist/sql-wasm-browser.js' {
  import type { SqlJsStatic } from 'sql.js';
  const initSqlJs: (config?: { locateFile?: (file: string) => string; wasmBinary?: ArrayBuffer }) => Promise<SqlJsStatic>;
  export default initSqlJs;
}

interface ImportMetaEnv {
  /** '1' nella build in file unico (pagina pubblicata su claude.ai) */
  readonly VITE_ARTIFACT?: string;
}

declare module 'virtual:sqlite-wasm-base64' {
  const base64: string;
  export default base64;
}
