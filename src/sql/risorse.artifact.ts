// Build in file unico: la pagina pubblicata non può scaricare altri file, quindi WebAssembly, file di supporto
// e cartella dati sono incorporati (compressi) nella pagina e arrivano al worker con il primo messaggio
// (vedi creaWorker.artifact.ts). Qui si decomprimono e si compila il WebAssembly.
import type { RisorseMotore } from './motore';

export interface RisorseCompresse {
  tipo: 'risorse';
  wasm: ArrayBuffer;
  data: ArrayBuffer;
  datadir: ArrayBuffer;
}

let arrivate: (r: RisorseCompresse) => void;
const promessa = new Promise<RisorseCompresse>((ok) => (arrivate = ok));
self.addEventListener('message', (ev: MessageEvent) => {
  if ((ev.data as RisorseCompresse | undefined)?.tipo === 'risorse') arrivate(ev.data as RisorseCompresse);
});

async function gunzip(b: ArrayBuffer): Promise<ArrayBuffer> {
  const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(s).arrayBuffer();
}

export async function risorseMotore(): Promise<RisorseMotore> {
  const r = await promessa;
  const [wasm, data] = await Promise.all([gunzip(r.wasm), gunzip(r.data)]);
  return {
    wasm: await WebAssembly.compile(wasm),
    fsBundle: new Blob([data]),
    datadir: new Blob([r.datadir]), // già tar.gz: lo decomprime PGlite
  };
}
