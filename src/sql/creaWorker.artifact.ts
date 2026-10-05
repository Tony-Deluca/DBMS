// Build in file unico: il worker è incorporato e avviato da un URL blob:.
import WorkerSQL from './worker.ts?worker&inline';

export function creaWorker(): Worker {
  return new WorkerSQL();
}
