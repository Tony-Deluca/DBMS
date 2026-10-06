// Build in file unico: il worker è incorporato e avviato da un URL blob:. I file del motore (compressi, in
// base64 dentro la pagina) gli vengono passati con il primo messaggio.
import WorkerSQL from './worker.ts?worker&inline';
import { wasm, data, datadir } from 'virtual:pglite-risorse';

function byte(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function creaWorker(): Worker {
  const w = new WorkerSQL();
  const r = { tipo: 'risorse', wasm: byte(wasm), data: byte(data), datadir: byte(datadir) };
  w.postMessage(r, [r.wasm, r.data, r.datadir]);
  return w;
}
