/// <reference lib="webworker" />
// Web Worker che ospita SQLite (sql.js): le query non bloccano mai l'interfaccia
// e una query troppo lunga si interrompe terminando il worker.
import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { opzioniSqlJs } from './wasm';
import { creaDatabase, eseguiPerVista, provaScenario, schemaReale } from './engine';
import { verificaCompleta } from './verificaRobusta';
import { VariantiDB, leggiStruttura, type Struttura } from './varianti';
import { infoTabelle, paginaTabella } from './dati';
import type { Richiesta } from './protocollo';

let SQL: Promise<SqlJsStatic> | null = null;
let db: Database | null = null;
let varianti: VariantiDB | null = null;
let struttura: Struttura | null = null;

function sqljs(): Promise<SqlJsStatic> {
  SQL ??= initSqlJs(opzioniSqlJs());
  return SQL;
}

async function gestisci(r: Richiesta): Promise<unknown> {
  const S = await sqljs();
  switch (r.tipo) {
    case 'carica': {
      varianti?.chiudi();
      varianti = null;
      struttura = null;
      db?.close();
      const esito = creaDatabase(S, r.statements);
      db = esito.db;
      if (esito.errore) throw new Error(`Errore nello statement n. ${esito.errore.indice + 1}: ${esito.errore.messaggio}`);
      if (esito.byte) {
        try {
          const mie = new VariantiDB(S, esito.byte, r.logico);
          varianti = mie;
          // i database di prova si costruiscono in background, uno per volta, lasciando spazio alle altre richieste
          const passo = () => {
            if (varianti === mie && mie.costruisciProssima()) setTimeout(passo, 0);
          };
          setTimeout(passo, 100);
        } catch {
          varianti = null; // senza database di prova la verifica funziona solo sui dati originali
        }
      }
      struttura = leggiStruttura(db, r.logico);
      return { schema: schemaReale(db) };
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
      return provaScenario(S, r.statements, r.esercizi, r.tabelleLogico, r.logico);
  }
}

self.onmessage = async (ev: MessageEvent<{ id: number; richiesta: Richiesta }>) => {
  const { id, richiesta } = ev.data;
  try {
    const risultato = await gestisci(richiesta);
    self.postMessage({ id, ok: true, risultato });
  } catch (e) {
    self.postMessage({ id, ok: false, errore: (e as Error).message ?? String(e) });
  }
};
