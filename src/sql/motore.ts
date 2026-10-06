// Motore SQL: PostgreSQL compilato in WebAssembly (PGlite), usato dal Web Worker nel browser e dai test in Node.
//
// Un'unica istanza ospita più «schemi» PostgreSQL: i dati dello scenario e i database di prova (varianti),
// ciascuno nel proprio schema. Ogni operazione indica lo schema su cui lavorare e le operazioni sono eseguite
// una alla volta (mutex), perché impostare lo schema e interrogare sono due passi distinti.
// Le query dello studente girano in una transazione READ ONLY che viene sempre annullata (ROLLBACK).
import { PGlite, type PGliteOptions } from '@electric-sql/pglite';
import type { Valore } from './compare';

export const CONF_POSTGRES = ['shared_buffers = 8MB', 'wal_buffers = 1MB'];

export interface RisorseMotore {
  /** cartella dati già inizializzata (tar.gz, vedi scripts/crea-datadir.mjs) */
  datadir: Blob;
  /** solo nella build in file unico: WebAssembly e file di supporto già in memoria */
  wasm?: WebAssembly.Module;
  fsBundle?: Blob;
}

export interface Righe {
  colonne: string[];
  righe: Valore[][];
}

/** Errore restituito da PostgreSQL, con codice SQLSTATE e posizione (1 = primo carattere) quando presenti. */
export class ErrorePostgres extends Error {
  constructor(
    messaggio: string,
    readonly codice?: string,
    readonly posizione?: number,
    readonly dettaglio?: string,
    readonly suggerimento?: string,
  ) {
    super(messaggio);
  }
}

// OID dei tipi PostgreSQL
const T = { bool: 16, int8: 20, int2: 21, int4: 23, float4: 700, float8: 701, numeric: 1700, date: 1082, time: 1083, timestamp: 1114, timestamptz: 1184, interval: 1186, timetz: 1266, money: 790 };

const numero = (x: string) => {
  const n = Number(x);
  return Number.isNaN(n) && x !== 'NaN' ? x : n;
};

/**
 * Conversione dei valori: numeri (anche NUMERIC e BIGINT) come number, così 1 e 1.0 si confrontano come oggi;
 * date e orari come testo nel formato di PostgreSQL ('2024-01-31'); booleani come 'true'/'false'.
 */
export const PARSER: NonNullable<PGliteOptions['parsers']> = {
  [T.int8]: numero,
  [T.int2]: numero,
  [T.int4]: numero,
  [T.float4]: numero,
  [T.float8]: numero,
  [T.numeric]: numero,
  [T.bool]: (x: string) => (x === 't' ? 'true' : 'false'),
  [T.date]: (x: string) => x,
  [T.time]: (x: string) => x,
  [T.timetz]: (x: string) => x,
  [T.timestamp]: (x: string) => x,
  [T.timestamptz]: (x: string) => x,
  [T.interval]: (x: string) => x,
  [T.money]: (x: string) => x,
};

export const qi = (n: string) => `"${n.replace(/"/g, '""')}"`;

function errore(e: unknown): ErrorePostgres {
  const x = e as { message?: string; code?: string; position?: string | number; detail?: string; hint?: string };
  const pos = x.position !== undefined ? Number(x.position) : undefined;
  return new ErrorePostgres(x.message ?? String(e), x.code, Number.isFinite(pos) ? pos : undefined, x.detail, x.hint);
}

type Parametro = string | number | boolean | null | Uint8Array;

export class Motore {
  private coda: Promise<unknown> = Promise.resolve();

  private constructor(readonly pg: PGlite) {}

  static async crea(r: RisorseMotore): Promise<Motore> {
    const opz: PGliteOptions = {
      loadDataDir: r.datadir,
      postgresqlconf: CONF_POSTGRES,
      relaxedDurability: true,
      parsers: PARSER,
    };
    if (r.wasm) opz.pgliteWasmModule = r.wasm;
    // la cartella dati è già inizializzata: initdb non serve. Un modulo vuoto evita che PGlite scarichi
    // comunque initdb.wasm (400 kB) all'avvio, anche offline.
    opz.initdbWasmModule = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    if (r.fsBundle) opz.fsBundle = r.fsBundle;
    const pg = await PGlite.create(opz);
    return new Motore(pg);
  }

  /** Esegue `f` quando le operazioni precedenti sono finite (una alla volta). */
  private inCoda<T>(f: () => Promise<T>): Promise<T> {
    const p = this.coda.then(f, f);
    this.coda = p.catch(() => undefined);
    return p;
  }

  private async righe(sql: string, parametri: Parametro[] = []): Promise<Righe> {
    try {
      const r = await this.pg.query<Valore[]>(sql, parametri, { rowMode: 'array' });
      return { colonne: r.fields.map((f) => f.name), righe: r.rows };
    } catch (e) {
      throw errore(e);
    }
  }

  /** Query interna dell'app (non in sola lettura) sullo schema indicato. */
  interna(schema: string, sql: string, parametri: Parametro[] = []): Promise<Righe> {
    return this.inCoda(async () => {
      await this.pg.exec(`SET search_path TO ${qi(schema)}`);
      return this.righe(sql, parametri);
    });
  }

  /** Esegue un'istruzione interna e restituisce il numero di righe toccate. */
  modifica(schema: string, sql: string, parametri: Parametro[] = []): Promise<number> {
    return this.inCoda(async () => {
      await this.pg.exec(`SET search_path TO ${qi(schema)}`);
      try {
        const r = await this.pg.query(sql, parametri);
        return r.affectedRows ?? 0;
      } catch (e) {
        throw errore(e);
      }
    });
  }

  /** Interrogazione dello studente (già controllata dalla guardia): transazione READ ONLY sempre annullata. */
  interroga(schema: string, sql: string): Promise<Righe> {
    return this.inCoda(async () => {
      await this.pg.exec(`BEGIN READ ONLY; SET LOCAL search_path TO ${qi(schema)};`);
      try {
        return await this.righe(sql);
      } finally {
        await this.pg.exec('ROLLBACK');
      }
    });
  }

  /** Ricrea lo schema vuoto. */
  svuotaSchema(schema: string): Promise<void> {
    return this.inCoda(async () => {
      await this.pg.exec(`DROP SCHEMA IF EXISTS ${qi(schema)} CASCADE; CREATE SCHEMA ${qi(schema)};`);
    });
  }

  eliminaSchemi(prefisso: string): Promise<void> {
    return this.inCoda(async () => {
      const r = await this.pg.query<{ n: string }>('SELECT nspname AS n FROM pg_namespace WHERE nspname LIKE $1', [`${prefisso}%`]);
      for (const { n } of r.rows) await this.pg.exec(`DROP SCHEMA IF EXISTS ${qi(n)} CASCADE`);
    });
  }

  /**
   * Esegue gli statement dello scenario nello schema (vuoto) indicato, in una sola transazione.
   * I vincoli di chiave esterna non sono controllati durante il caricamento (session_replication_role =
   * replica): l'ordine degli INSERT non conta e le violazioni si segnalano a parte.
   */
  caricaStatements(schema: string, statements: string[]): Promise<{ indice: number; errore: ErrorePostgres } | null> {
    return this.inCoda(async () => {
      await this.pg.exec(`BEGIN; SET LOCAL search_path TO ${qi(schema)}; SET LOCAL session_replication_role = replica;`);
      for (let i = 0; i < statements.length; i++) {
        try {
          await this.pg.exec(statements[i]);
        } catch (e) {
          await this.pg.exec('ROLLBACK').catch(() => undefined);
          return { indice: i, errore: errore(e) };
        }
      }
      await this.pg.exec('COMMIT');
      return null;
    });
  }

  /** Copia tutte le tabelle di uno schema in un altro (struttura con PK/NOT NULL/CHECK, senza chiavi esterne). */
  copiaSchema(da: string, a: string, tabelle: string[]): Promise<void> {
    return this.inCoda(async () => {
      let script = `DROP SCHEMA IF EXISTS ${qi(a)} CASCADE; CREATE SCHEMA ${qi(a)};`;
      for (const t of tabelle) {
        script += `CREATE TABLE ${qi(a)}.${qi(t)} (LIKE ${qi(da)}.${qi(t)} INCLUDING ALL); INSERT INTO ${qi(a)}.${qi(t)} OVERRIDING SYSTEM VALUE SELECT * FROM ${qi(da)}.${qi(t)};`;
      }
      await this.pg.exec(script);
    });
  }

  chiudi(): Promise<void> {
    return this.inCoda(() => this.pg.close());
  }
}

/** Un «database»: lo schema PostgreSQL che contiene i dati dello scenario o di una sua variante. */
export interface Db {
  m: Motore;
  schema: string;
}
