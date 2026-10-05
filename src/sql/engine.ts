// Logica di esecuzione indipendente dall'ambiente: usata dal Web Worker nel
// browser e direttamente dai test in Node.
import type { Database, SqlJsStatic } from 'sql.js';
import { controllaQuery } from './guard';
import { traduciErrore } from './errors';
import {
  confrontaRisultati,
  infoOrdine,
  verificaControSoluzioni,
  type EsitoVerifica,
  type Riferimento,
  type Risultato,
  type Valore,
} from './compare';
import { colonneOrdinamento, haLimitEsterno, orderByEsterno, riscriviConChiavi } from './orderBy';
import { VariantiDB } from './varianti';
import type { ModelloLogico } from '../scenario/types';

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

/**
 * Crea il database dagli statement. `byte` è il contenuto serializzato del database prima di renderlo
 * in sola lettura: serve per generare i database di prova.
 */
export function creaDatabase(SQL: SqlJsStatic, statements: string[]): { db: Database; errore?: ErroreStatement; byte?: Uint8Array } {
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
  // export() chiude e riapre il database e azzera i PRAGMA: query_only si imposta dopo
  const byte = db.export();
  db.exec('PRAGMA query_only = ON;');
  return { db, byte };
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

/**
 * Esegue una soluzione ufficiale e prepara tutto ciò che serve a confrontarla: il risultato e, se ha un
 * ORDER BY, i gruppi di righe a pari chiave (le chiavi che non sono colonne del risultato si ricavano
 * riscrivendo la query con colonne aggiuntive).
 */
export function riferimentoPer(db: Database, sql: string): Riferimento {
  const ris = esegui(db, sql);
  const voci = orderByEsterno(sql);
  let chiavi: Valore[][] | null = null;
  if (voci && voci.length > 0 && !colonneOrdinamento(voci, ris.colonne)) {
    const rw = riscriviConChiavi(sql, voci);
    if (rw) {
      try {
        const r2 = esegui(db, rw.sql);
        if (r2.righe.length === ris.righe.length && r2.colonne.length === ris.colonne.length + rw.chiavi) {
          chiavi = r2.righe.map((r) => r.slice(ris.colonne.length));
        }
      } catch {
        /* la riscrittura non è valida (es. usa un alias): si ripiega sul confronto rigido */
      }
    }
  }
  return { sql, risultato: ris, ordine: infoOrdine(sql, ris, chiavi) };
}

export interface RispostaVerifica {
  esito: EsitoVerifica;
  risultato: RisultatoEsecuzione;
}

export function riferimentiUfficiali(db: Database, soluzioni: string[]): Riferimento[] {
  return soluzioni.map((sql, i) => {
    try {
      return riferimentoPer(db, sql);
    } catch (e) {
      throw new Error(`La soluzione ufficiale n. ${i + 1} non è eseguibile: ${(e as Error).message}`);
    }
  });
}

/** Verifica sui soli dati originali (la verifica completa, con i database di prova, è in verificaRobusta.ts). */
export function verifica(db: Database, testo: string, soluzioni: string[], maxRighe: number): RispostaVerifica {
  const t0 = performance.now();
  const ottenuto = esegui(db, testo);
  const millisecondi = performance.now() - t0;
  const ufficiali = riferimentiUfficiali(db, soluzioni);
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
  logico: ModelloLogico | null = null,
): ProblemaSQL[] {
  const problemi: ProblemaSQL[] = [];
  const { db, errore, byte } = creaDatabase(SQL, statements);
  let varianti: VariantiDB | null = null;
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
    try {
      varianti = byte ? new VariantiDB(SQL, byte, logico) : null;
    } catch {
      varianti = null; // le varianti sono un controllo in più: se non si riescono a creare si va avanti senza
    }
    esercizi.forEach((es, i) => {
      const riferimenti: { j: number; rif: Riferimento }[] = [];
      es.soluzioni.forEach((sql, j) => {
        const percorso = `esercizi[${i}].soluzioni[${j}]`;
        try {
          const rif = riferimentoPer(db, sql);
          if (rif.risultato.righe.length === 0) {
            problemi.push({ livello: 'avviso', percorso, messaggio: `la soluzione dell'esercizio «${es.id}» restituisce un risultato vuoto: la verifica sarebbe poco significativa.` });
          }
          riferimenti.push({ j, rif });
        } catch (e) {
          problemi.push({ livello: 'errore', percorso, messaggio: `la soluzione dell'esercizio «${es.id}» non è eseguibile: ${(e as Error).message}` });
        }
      });
      for (let a = 1; a < riferimenti.length; a++) {
        const { j, rif } = riferimenti[a];
        const percorso = `esercizi[${i}].soluzioni[${j}]`;
        const base = riferimenti[0].rif;
        const v = verificaControSoluzioni([base], rif.risultato);
        if (!v.corretta) {
          problemi.push({ livello: 'avviso', percorso, messaggio: `la soluzione alternativa dell'esercizio «${es.id}» non dà lo stesso risultato della prima.` });
          continue;
        }
        // equivalenza anche sui database di prova (non si controllano le soluzioni con LIMIT: dipendono dai pareggi)
        if (!varianti || haLimitEsterno(base.sql) || haLimitEsterno(rif.sql)) continue;
        for (const variante of varianti.tutte()) {
          let rb: Riferimento;
          let ra: Riferimento;
          try {
            rb = riferimentoPer(variante.db, base.sql);
            ra = riferimentoPer(variante.db, rif.sql);
          } catch {
            continue; // una delle due dà errore su questa variante: variante scartata
          }
          if (!confrontaRisultati(rb, ra.risultato).uguale) {
            problemi.push({
              livello: 'avviso',
              percorso,
              messaggio: `la soluzione alternativa dell'esercizio «${es.id}» coincide con la prima sui dati dello scenario ma non su un database di prova (${variante.caratteristiche.join(', ')}): non sono equivalenti in generale.`,
            });
            break;
          }
        }
      }
    });
  } finally {
    varianti?.chiudi();
    db.close();
  }
  return problemi;
}
