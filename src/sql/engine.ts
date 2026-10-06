// Logica di esecuzione indipendente dall'ambiente: usata dal Web Worker nel
// browser e direttamente dai test in Node. Il «database» è uno schema PostgreSQL dentro PGlite (vedi motore.ts).
import { controllaQuery } from './guard';
import { traduciErrore } from './errors';
import { ErrorePostgres, type Db, type Motore } from './motore';
import { tokenize } from './tokenize';
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
import { VariantiDB, leggiStruttura, violazioniChiaviEsterne, type Struttura } from './varianti';
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
 * Crea il database dello scenario nello schema `schema` (ricreato vuoto) e ne legge la struttura.
 * In caso di errore lo schema resta vuoto.
 */
export async function creaDatabase(
  m: Motore,
  schema: string,
  statements: string[],
  logico: ModelloLogico | null = null,
): Promise<{ db: Db; errore?: ErroreStatement; struttura?: Struttura }> {
  const db: Db = { m, schema };
  await m.svuotaSchema(schema);
  const e = await m.caricaStatements(schema, statements);
  if (e) return { db, errore: { indice: e.indice, messaggio: e.errore.message } };
  return { db, struttura: await leggiStruttura(db, logico) };
}

/** Righe che violano le chiavi esterne (dichiarate nei CREATE TABLE o nel modello logico). */
export async function violazioniFK(db: Db, st: Struttura): Promise<{ tabella: string; riferita: string; quante: number }[]> {
  const out: { tabella: string; riferita: string; quante: number }[] = [];
  for (const f of st.fk) {
    const quante = await violazioniChiaviEsterne(db, { tabelle: st.tabelle, fk: [f] });
    if (quante > 0) {
      const g = out.find((x) => x.tabella === f.tabella && x.riferita === f.rifTabella);
      if (g) g.quante += quante;
      else out.push({ tabella: f.tabella, riferita: f.rifTabella, quante });
    }
  }
  return out;
}

/**
 * PostgreSQL scrive in minuscolo i nomi non quotati (`AVG(Voto) AS Media` → «media»): si ripristina la forma
 * scritta nella query quando compare tra le sue parole.
 */
export function nomiComeScritti(sql: string, colonne: string[]): string[] {
  const scritte = new Map<string, string>();
  for (const t of tokenize(sql).token) {
    if (t.tipo !== 'parola') continue;
    const k = t.testo.toLowerCase();
    if (!scritte.has(k) && t.testo !== k) scritte.set(k, t.testo);
  }
  return colonne.map((c) => (c === c.toLowerCase() ? (scritte.get(c) ?? c) : c));
}

/** Controlla la query, la esegue (in sola lettura) e traduce gli errori. */
export async function esegui(db: Db, testo: string): Promise<Risultato> {
  const g = controllaQuery(testo);
  if (!g.ok) throw new ErroreQuery(g.messaggio);
  try {
    const r = await db.m.interroga(db.schema, g.sql);
    return { colonne: nomiComeScritti(g.sql, r.colonne), righe: r.righe };
  } catch (e) {
    if (e instanceof ErrorePostgres) throw new ErroreQuery(traduciErrore(e, g.sql));
    throw new ErroreQuery(traduciErrore(new ErrorePostgres((e as Error).message ?? String(e)), g.sql));
  }
}

export async function eseguiPerVista(db: Db, testo: string, maxRighe: number): Promise<RisultatoEsecuzione> {
  const t0 = performance.now();
  const r = await esegui(db, testo);
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
export async function riferimentoPer(db: Db, sql: string): Promise<Riferimento> {
  const ris = await esegui(db, sql);
  const voci = orderByEsterno(sql);
  let chiavi: Valore[][] | null = null;
  if (voci && voci.length > 0 && !colonneOrdinamento(voci, ris.colonne)) {
    const rw = riscriviConChiavi(sql, voci);
    if (rw) {
      try {
        const r2 = await esegui(db, rw.sql);
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

export async function riferimentiUfficiali(db: Db, soluzioni: string[]): Promise<Riferimento[]> {
  const out: Riferimento[] = [];
  for (let i = 0; i < soluzioni.length; i++) {
    try {
      out.push(await riferimentoPer(db, soluzioni[i]));
    } catch (e) {
      throw new Error(`La soluzione ufficiale n. ${i + 1} non è eseguibile: ${(e as Error).message}`);
    }
  }
  return out;
}

/** Verifica sui soli dati originali (la verifica completa, con i database di prova, è in verificaRobusta.ts). */
export async function verifica(db: Db, testo: string, soluzioni: string[], maxRighe: number): Promise<RispostaVerifica> {
  const t0 = performance.now();
  const ottenuto = await esegui(db, testo);
  const millisecondi = performance.now() - t0;
  const ufficiali = await riferimentiUfficiali(db, soluzioni);
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

/** Tabelle e colonne del database (per l'autocompletamento), con le maiuscole del modello logico. */
export function schemaReale(st: Struttura): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of st.tabelle) out[t.nome] = t.colonne.map((c) => c.nome);
  return out;
}

export interface ProblemaSQL {
  livello: 'errore' | 'avviso';
  percorso: string;
  messaggio: string;
}

const SCHEMA_PROVA = 'prova_scenario';

/**
 * Prova lo scenario in uno schema temporaneo: statements, soluzioni,
 * risultati vuoti, alternative non equivalenti, tabelle del logico.
 */
export async function provaScenario(
  m: Motore,
  statements: string[],
  esercizi: { id: string; soluzioni: string[] }[],
  tabelleLogico: string[],
  logico: ModelloLogico | null = null,
): Promise<ProblemaSQL[]> {
  const problemi: ProblemaSQL[] = [];
  const { db, errore, struttura } = await creaDatabase(m, SCHEMA_PROVA, statements, logico);
  let varianti: VariantiDB | null = null;
  try {
    if (errore || !struttura) {
      const indice = errore?.indice ?? 0;
      const anteprima = (statements[indice] ?? '').trim().slice(0, 80).replace(/\s+/g, ' ');
      problemi.push({
        livello: 'errore',
        percorso: `database.statements[${indice}]`,
        messaggio: `l'istruzione non viene eseguita da PostgreSQL: ${errore?.messaggio ?? 'errore sconosciuto'} — «${anteprima}${anteprima.length >= 80 ? '…' : ''}»`,
      });
      return problemi;
    }
    for (const v of await violazioniFK(db, struttura)) {
      problemi.push({
        livello: 'avviso',
        percorso: 'database.statements',
        messaggio: `${v.quante} ${v.quante === 1 ? 'riga' : 'righe'} di «${v.tabella}» ${v.quante === 1 ? 'fa' : 'fanno'} riferimento a valori inesistenti in «${v.riferita}» (chiave esterna violata).`,
      });
    }
    const nomiReali = new Set(struttura.tabelle.map((t) => t.nome.toLowerCase()));
    tabelleLogico.forEach((nome, i) => {
      if (!nomiReali.has(nome.toLowerCase())) {
        problemi.push({ livello: 'avviso', percorso: `logico.tabelle[${i}].nome`, messaggio: `la tabella «${nome}» non esiste nel database creato dagli statements.` });
      }
    });
    varianti = new VariantiDB(db, struttura, `${SCHEMA_PROVA}_v`);
    for (let i = 0; i < esercizi.length; i++) {
      const es = esercizi[i];
      const riferimenti: { j: number; rif: Riferimento }[] = [];
      for (let j = 0; j < es.soluzioni.length; j++) {
        const percorso = `esercizi[${i}].soluzioni[${j}]`;
        try {
          const rif = await riferimentoPer(db, es.soluzioni[j]);
          if (rif.risultato.righe.length === 0) {
            problemi.push({ livello: 'avviso', percorso, messaggio: `la soluzione dell'esercizio «${es.id}» restituisce un risultato vuoto: la verifica sarebbe poco significativa.` });
          }
          riferimenti.push({ j, rif });
        } catch (e) {
          problemi.push({ livello: 'errore', percorso, messaggio: `la soluzione dell'esercizio «${es.id}» non è eseguibile: ${(e as Error).message}` });
        }
      }
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
        if (haLimitEsterno(base.sql) || haLimitEsterno(rif.sql)) continue;
        for (const variante of await varianti.tutte()) {
          let rb: Riferimento;
          let ra: Riferimento;
          try {
            rb = await riferimentoPer(variante.db, base.sql);
            ra = await riferimentoPer(variante.db, rif.sql);
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
    }
  } finally {
    await varianti?.chiudi();
    await m.eliminaSchemi(SCHEMA_PROVA);
  }
  return problemi;
}
