/// <reference lib="webworker" />
// Web Worker che ospita PostgreSQL (PGlite): le query non bloccano mai l'interfaccia
// e una query troppo lunga si interrompe terminando il worker.
import { Motore } from './motore';
import { risorseMotore } from './risorse';
import { creaDatabase, eseguiPerVista, provaScenario, schemaReale } from './engine';
import { verificaCompleta } from './verificaRobusta';
import { VariantiDB, type Struttura } from './varianti';
import { infoTabelle, paginaTabella } from './dati';
import type { Db } from './motore';
import type { Richiesta } from './protocollo';

const SCHEMA = 'scenario';

let motore: Promise<Motore> | null = null;
let db: Db | null = null;
let varianti: VariantiDB | null = null;
let struttura: Struttura | null = null;

function avviaMotore(): Promise<Motore> {
  motore ??= risorseMotore().then((r) => Motore.crea(r));
  return motore;
}
// il motore parte subito, mentre l'interfaccia si carica
avviaMotore().catch(() => undefined);

async function gestisci(r: Richiesta): Promise<unknown> {
  const m = await avviaMotore();
  switch (r.tipo) {
    case 'carica': {
      const vecchie = varianti;
      varianti = null;
      struttura = null;
      db = null;
      await vecchie?.chiudi();
      const esito = await creaDatabase(m, SCHEMA, r.statements, r.logico);
      if (esito.errore || !esito.struttura) throw new Error(`Errore nello statement n. ${(esito.errore?.indice ?? 0) + 1}: ${esito.errore?.messaggio}`);
      db = esito.db;
      struttura = esito.struttura;
      const mie = new VariantiDB(db, struttura, `${SCHEMA}_v`);
      varianti = mie;
      // i database di prova si costruiscono in background, uno per volta, lasciando spazio alle altre richieste
      const passo = async () => {
        if (varianti === mie && (await mie.costruisciProssima().catch(() => false))) setTimeout(passo, 0);
      };
      setTimeout(passo, 100);
      return { schema: schemaReale(struttura) };
    }
    case 'esegui':
      if (!db) throw new Error('Database non caricato.');
      return eseguiPerVista(db, r.sql, r.maxRighe);
    case 'tabelle':
      if (!db || !struttura) throw new Error('Database non caricato.');
      return infoTabelle(db, struttura);
    case 'pagina':
      if (!db || !struttura) throw new Error('Database non caricato.');
      return paginaTabella(db, struttura, r.richiesta);
    case 'verifica':
      if (!db) throw new Error('Database non caricato.');
      return verificaCompleta(db, varianti, r.sql, r.soluzioni, r.maxRighe);
    case 'prova':
      return provaScenario(m, r.statements, r.esercizi, r.tabelleLogico, r.logico);
  }
}

self.onmessage = async (ev: MessageEvent<{ id: number; richiesta: Richiesta }>) => {
  if (!ev.data || typeof ev.data.id !== 'number') return; // es. i file del motore nella build in file unico
  const { id, richiesta } = ev.data;
  try {
    const risultato = await gestisci(richiesta);
    self.postMessage({ id, ok: true, risultato });
  } catch (e) {
    self.postMessage({ id, ok: false, errore: (e as Error).message ?? String(e) });
  }
};
