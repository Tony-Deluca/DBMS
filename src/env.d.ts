interface ImportMetaEnv {
  /** '1' nella build in file unico (pagina pubblicata su claude.ai) */
  readonly VITE_ARTIFACT?: string;
}

/** Build in file unico: file del motore PostgreSQL compressi (gzip) in base64. */
declare module 'virtual:pglite-risorse' {
  export const wasm: string;
  export const data: string;
  export const datadir: string;
}
