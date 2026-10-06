import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Scenario, ModelloLogico } from '../../src/scenario/types';
import { Motore, type Db } from '../../src/sql/motore';
import { creaDatabase } from '../../src/sql/engine';
import type { Struttura } from '../../src/sql/varianti';

export function radice(rel: string): string {
  return fileURLToPath(new URL(`../../${rel}`, import.meta.url));
}

let motore: Promise<Motore> | null = null;
/** Un'istanza di PostgreSQL (PGlite) per file di test, avviata dalla cartella dati già pronta. */
export function motoreTest(): Promise<Motore> {
  motore ??= Motore.crea({ datadir: new Blob([readFileSync(radice('src/sql/pg/datadir.tar.gz'))]) });
  return motore;
}

let contatore = 0;
/** Crea un database (schema) nuovo con gli statement indicati; lancia un errore se uno statement fallisce. */
export async function creaDb(statements: string[], logico: ModelloLogico | null = null, schema?: string): Promise<{ db: Db; struttura: Struttura }> {
  const m = await motoreTest();
  const r = await creaDatabase(m, schema ?? `t${++contatore}`, statements, logico);
  if (r.errore || !r.struttura) throw new Error(`statement ${r.errore?.indice}: ${r.errore?.messaggio}`);
  return { db: r.db, struttura: r.struttura };
}

export function leggiScenario(rel = 'scenari-esempio/universita.json'): Scenario {
  return JSON.parse(readFileSync(radice(rel), 'utf-8')) as Scenario;
}
