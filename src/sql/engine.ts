// Logica di esecuzione indipendente dall'ambiente: usata dal Web Worker nel
// browser e direttamente dai test in Node.
import type { Database, SqlJsStatic } from 'sql.js';
import { controllaQuery } from './guard';
import { traduciErrore } from './errors';
import { verificaControSoluzioni, type EsitoVerifica, type Risultato, type Valore } from './compare';

export class ErroreQuery extends Error {}

export interface RisultatoEsecuzione extends Risultato {
  totaleRighe: number;
  troncato: boolean;
  millisecondi: number;
}

export interface ErroreStatement {
  indice: number;
  messaggio: string;
}

export function creaDatabase(SQL: SqlJsStatic, statements: string[]): { db: Database; errore?: ErroreStatement } {
  const db = new SQL.Database();
  // Le FK non sono imposte durante il caricamento (l'ordine degli INSERT non conta);
  // le violazioni vengono segnalate a parte da violazioniFK().
  db.exec('BEGIN;');
  for (let i = 0; i < statements.length; i++) {
    try {
      db.exec(statements[i]);
    } catch (e) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        /* già annullata */
      }
      return { db, errore: { indice: i, messaggio: (e as Error).message } };
    }
  }
  db.exec('COMMIT;');
  db.exec('PRAGMA query_only = ON;');
  return { db };
}

/** Righe che violano le chiavi esterne dichiarate nei CREATE TABLE. */
export function violazioniFK(db: Database): { tabella: string; riferita: string; quante: number }[] {
  const r = db.exec('PRAGMA foreign_key_check;');
  const conta = new Map<string, number>();
  for (const [tabella, , riferita] of r[0]?.values ?? []) {
    const k = `${tabella}\u0001${riferita}`;
    conta.set(k, (conta.get(k) ?? 0) + 1);
  }
  return [...conta].map(([k, quante]) => {
    const [tabella, riferita] = k.split('\u0001');
    return { tabella, riferita, quante };
  });
}

/** Esegue una query già controllata e restituisce tutte le righe. */
function eseguiGrezza(db: Database, sql: string): Risultato {
  const stmt = db.prepare(sql);
  try {
    const colonne = stmt.getColumnNames();
    const righe: Valore[][] = [];
    while (stmt.step()) righe.push(stmt.get() as Valore[]);
    return { colonne, righe };
  } finally {
    stmt.free();
  }
}

/** Controlla la query, la esegue e traduce gli errori. */
export function esegui(db: Database, testo: string): Risultato {
  const g = controllaQuery(testo);
  if (!g.ok) throw new ErroreQuery(g.messaggio);
  try {
    return eseguiGrezza(db, g.sql);
  } catch (e) {
    throw new ErroreQuery(traduciErrore((e as Error).message));
  }
}

export function eseguiPerVista(db: Database, testo: string, maxRighe: number): RisultatoEsecuzione {
  const t0 = performance.now();
  const r = esegui(db, testo);
  const millisecondi = performance.now() - t0;
  return {
    colonne: r.colonne,
    righe: r.righe.slice(0, maxRighe),
    totaleRighe: r.righe.length,
    troncato: r.righe.length > maxRighe,
    millisecondi,
  };
}

export interface RispostaVerifica {
  esito: EsitoVerifica;
  risultato: RisultatoEsecuzione;
}

export function verifica(db: Database, testo: string, soluzioni: string[], maxRighe: number): RispostaVerifica {
  const t0 = performance.now();
  const ottenuto = esegui(db, testo);
  const millisecondi = performance.now() - t0;
  const ufficiali = soluzioni.map((sql, i) => {
    try {
      return { sql, risultato: esegui(db, sql) };
    } catch (e) {
      throw new Error(`La soluzione ufficiale n. ${i + 1} non è eseguibile: ${(e as Error).message}`);
    }
  });
  const esito = verificaControSoluzioni(ufficiali, ottenuto);
  return {
    esito,
    risultato: {
      colonne: ottenuto.colonne,
      righe: ottenuto.righe.slice(0, maxRighe),
      totaleRighe: ottenuto.righe.length,
      troncato: ottenuto.righe.length > maxRighe,
      millisecondi,
    },
  };
}

/** Tabelle e colonne effettivamente presenti nel database (per l'autocompletamento). */
export function schemaReale(db: Database): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const t = db.exec("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
  for (const [nome] of t[0]?.values ?? []) {
    const info = db.exec(`PRAGMA table_info(${JSON.stringify(String(nome))})`);
    out[String(nome)] = (info[0]?.values ?? []).map((r) => String(r[1]));
  }
  return out;
}

export interface ProblemaSQL {
  livello: 'errore' | 'avviso';
  percorso: string;
  messaggio: string;
}

/**
 * Prova lo scenario su un database temporaneo: statements, soluzioni,
 * risultati vuoti, alternative non equivalenti, tabelle del logico.
 */
export function provaScenario(
  SQL: SqlJsStatic,
  statements: string[],
  esercizi: { id: string; soluzioni: string[] }[],
  tabelleLogico: string[],
): ProblemaSQL[] {
  const problemi: ProblemaSQL[] = [];
  const { db, errore } = creaDatabase(SQL, statements);
  try {
    if (errore) {
      const anteprima = statements[errore.indice].trim().slice(0, 80).replace(/\s+/g, ' ');
      problemi.push({
        livello: 'errore',
        percorso: `database.statements[${errore.indice}]`,
        messaggio: `l'istruzione non viene eseguita da SQLite: ${errore.messaggio} — «${anteprima}${anteprima.length >= 80 ? '…' : ''}»`,
      });
      return problemi;
    }
    for (const v of violazioniFK(db)) {
      problemi.push({
        livello: 'avviso',
        percorso: 'database.statements',
        messaggio: `${v.quante} ${v.quante === 1 ? 'riga' : 'righe'} di «${v.tabella}» ${v.quante === 1 ? 'fa' : 'fanno'} riferimento a valori inesistenti in «${v.riferita}» (chiave esterna violata).`,
      });
    }
    const reali = schemaReale(db);
    const nomiReali = new Set(Object.keys(reali).map((n) => n.toLowerCase()));
    tabelleLogico.forEach((nome, i) => {
      if (!nomiReali.has(nome.toLowerCase())) {
        problemi.push({ livello: 'avviso', percorso: `logico.tabelle[${i}].nome`, messaggio: `la tabella «${nome}» non esiste nel database creato dagli statements.` });
      }
    });
    esercizi.forEach((es, i) => {
      const risultati: { sql: string; risultato: Risultato }[] = [];
      es.soluzioni.forEach((sql, j) => {
        const percorso = `esercizi[${i}].soluzioni[${j}]`;
        try {
          const r = esegui(db, sql);
          if (r.righe.length === 0) {
            problemi.push({ livello: 'avviso', percorso, messaggio: `la soluzione dell'esercizio «${es.id}» restituisce un risultato vuoto: la verifica sarebbe poco significativa.` });
          }
          risultati.push({ sql, risultato: r });
        } catch (e) {
          problemi.push({ livello: 'errore', percorso, messaggio: `la soluzione dell'esercizio «${es.id}» non è eseguibile: ${(e as Error).message}` });
        }
      });
      for (let j = 1; j < risultati.length; j++) {
        const v = verificaControSoluzioni([risultati[0]], risultati[j].risultato);
        if (!v.corretta) {
          problemi.push({
            livello: 'avviso',
            percorso: `esercizi[${i}].soluzioni[${es.soluzioni.indexOf(risultati[j].sql)}]`,
            messaggio: `la soluzione alternativa dell'esercizio «${es.id}» non dà lo stesso risultato della prima.`,
          });
        }
      }
    });
  } finally {
    db.close();
  }
  return problemi;
}
