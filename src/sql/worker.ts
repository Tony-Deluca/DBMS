/// <reference lib="webworker" />
// Web Worker che ospita SQLite (sql.js): le query non bloccano mai l'interfaccia
// e una query troppo lunga si interrompe terminando il worker.
import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { opzioniSqlJs } from './wasm';
import { creaDatabase, eseguiPerVista, provaScenario, schemaReale, verifica } from './engine';
import type { Richiesta } from './protocollo';

let SQL: Promise<SqlJsStatic> | null = null;
let db: Database | null = null;

function sqljs(): Promise<SqlJsStatic> {
  SQL ??= initSqlJs(opzioniSqlJs());
  return SQL;
}

async function gestisci(r: Richiesta): Promise<unknown> {
  const S = await sqljs();
  switch (r.tipo) {
    case 'carica': {
      db?.close();
      const esito = creaDatabase(S, r.statements);
      db = esito.db;
      if (esito.errore) throw new Error(`Errore nello statement n. ${esito.errore.indice + 1}: ${esito.errore.messaggio}`);
      return { schema: schemaReale(db) };
    }
    case 'esegui':
      if (!db) throw new Error('Database non caricato.');
      return eseguiPerVista(db, r.sql, r.maxRighe);
    case 'verifica':
      if (!db) throw new Error('Database non caricato.');
      return verifica(db, r.sql, r.soluzioni, r.maxRighe);
    case 'prova':
      return provaScenario(S, r.statements, r.esercizi, r.tabelleLogico);
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
