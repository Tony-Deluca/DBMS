// Dove il motore trova i suoi file (build normale): il WebAssembly di PostgreSQL e i file di supporto li
// scarica PGlite accanto al proprio codice; la cartella dati già pronta è un file a parte. Tutti vengono
// messi in cache dal service worker, quindi dopo il primo caricamento l'app funziona offline.
import datadirUrl from './pg/datadir.tar.gz?url';
import type { RisorseMotore } from './motore';

export async function risorseMotore(): Promise<RisorseMotore> {
  const r = await fetch(datadirUrl);
  if (!r.ok) throw new Error(`impossibile scaricare i file del motore SQL (${r.status})`);
  return { datadir: await r.blob() };
}
