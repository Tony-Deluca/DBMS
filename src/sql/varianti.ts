// Database di prova: varianti dei dati dello scenario, generate in modo riproducibile (seme fisso).
//
// Due query diverse possono coincidere sui dati originali per caso. Per ridurre il rischio la verifica
// controlla la risposta anche su varianti dei dati in cui mancano righe, ci sono righe duplicate e valori NULL.
// Non è una prova formale di equivalenza: è un controllo pratico.
import type { Database, SqlJsStatic } from 'sql.js';
import type { ModelloLogico } from '../scenario/types';
import type { Riferimento } from './compare';

export const NUMERO_VARIANTI = 6;

/** Cosa si fa ai dati in ciascuna variante (frazioni di righe/valori toccati). */
export const PIANI_VARIANTI = [
  { rimuovi: 0.3, duplica: 0, nulli: 0 },
  { rimuovi: 0.5, duplica: 0, nulli: 0.3 },
  { rimuovi: 0.2, duplica: 0.3, nulli: 0 },
  { rimuovi: 0, duplica: 0, nulli: 0.35 },
  { rimuovi: 0.3, duplica: 0.25, nulli: 0.25 },
  { rimuovi: 0.6, duplica: 0.15, nulli: 0.15 },
] as const;

export interface Variante {
  indice: number;
  db: Database;
  /** Descrizione di cosa è stato modificato: «righe mancanti», «righe duplicate», «valori NULL». */
  caratteristiche: string[];
  /** Risultati delle soluzioni ufficiali su questa variante (null = errore → variante scartata). */
  riferimenti: Map<string, Riferimento | null>;
}

// ---------- generatore pseudo-casuale con seme ----------

/** mulberry32: piccolo generatore deterministico. */
export function generatore(seme: number): () => number {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const semeVariante = (indice: number) => (0x5eed1234 + (indice + 1) * 7919) >>> 0;

// ---------- struttura del database ----------

interface Colonna {
  nome: string;
  tipo: string;
  notnull: boolean;
  pk: number; // posizione nella chiave primaria (0 = non è PK)
  /** può ricevere NULL nelle varianti */
  annullabile: boolean;
}

interface Tabella {
  nome: string;
  colonne: Colonna[];
  pk: string[];
}

interface ChiaveEsterna {
  tabella: string;
  colonne: string[];
  rifTabella: string;
  rifColonne: string[];
  /** tutte le colonne ammettono NULL: un genitore tolto si traduce in NULL invece che nella cancellazione */
  annullabile?: boolean;
}

export interface Struttura {
  tabelle: Tabella[];
  fk: ChiaveEsterna[];
}

const q = (n: string) => `"${n.replace(/"/g, '""')}"`;
const k = (s: string) => s.toLowerCase();

function righe(db: Database, sql: string): (string | number | null | Uint8Array)[][] {
  return (db.exec(sql)[0]?.values ?? []) as (string | number | null | Uint8Array)[][];
}

/** Legge tabelle, colonne e chiavi esterne (dichiarate nei CREATE TABLE e nel modello logico). */
export function leggiStruttura(db: Database, logico: ModelloLogico | null): Struttura {
  const nomi = righe(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => String(r[0]));
  const tabelle: Tabella[] = [];
  const fk: ChiaveEsterna[] = [];
  for (const nome of nomi) {
    const info = righe(db, `PRAGMA table_info(${q(nome)})`);
    const logicaT = logico?.tabelle.find((t) => k(t.nome) === k(nome));
    const colonne: Colonna[] = info.map((r) => {
      const cn = String(r[1]);
      const lc = logicaT?.colonne.find((c) => k(c.nome) === k(cn));
      const notnull = Number(r[3]) === 1;
      const pk = Number(r[5]);
      // il modello logico, se descrive la colonna, ha l'ultima parola: nullable assente = obbligatoria
      const ammessoDalModello = lc ? lc.nullable === true : true;
      return { nome: cn, tipo: String(r[2] ?? ''), notnull, pk, annullabile: !notnull && pk === 0 && ammessoDalModello };
    });
    tabelle.push({ nome, colonne, pk: colonne.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.nome) });
  }
  const pkDi = (t: string) => tabelle.find((x) => k(x.nome) === k(t))?.pk ?? [];
  const chiave = (f: ChiaveEsterna) => `${k(f.tabella)}|${f.colonne.map(k).join(',')}|${k(f.rifTabella)}|${f.rifColonne.map(k).join(',')}`;
  const viste = new Set<string>();
  const aggiungi = (f: ChiaveEsterna) => {
    if (f.colonne.length === 0 || f.colonne.length !== f.rifColonne.length) return;
    if (!tabelle.some((t) => k(t.nome) === k(f.tabella)) || !tabelle.some((t) => k(t.nome) === k(f.rifTabella))) return;
    if (viste.has(chiave(f))) return;
    viste.add(chiave(f));
    fk.push(f);
  };
  for (const t of tabelle) {
    const per = new Map<number, { rif: string; da: string[]; a: (string | null)[] }>();
    for (const r of righe(db, `PRAGMA foreign_key_list(${q(t.nome)})`)) {
      const id = Number(r[0]);
      const e = per.get(id) ?? { rif: String(r[2]), da: [], a: [] };
      e.da.push(String(r[3]));
      e.a.push(r[4] === null ? null : String(r[4]));
      per.set(id, e);
    }
    for (const e of per.values()) {
      const rifPk = pkDi(e.rif);
      aggiungi({ tabella: t.nome, colonne: e.da, rifTabella: e.rif, rifColonne: e.a.map((x, i) => x ?? rifPk[i] ?? '') });
    }
  }
  for (const t of logico?.tabelle ?? []) {
    for (const f of t.chiaviEsterne ?? []) {
      aggiungi({ tabella: t.nome, colonne: f.colonne, rifTabella: f.tabella, rifColonne: f.riferimenti });
    }
  }
  // rinomina secondo il nome reale delle tabelle e colonne (il logico può usare altre maiuscole)
  const reale = (t: string) => tabelle.find((x) => k(x.nome) === k(t))!;
  const colReale = (t: string, c: string) => reale(t).colonne.find((x) => k(x.nome) === k(c))?.nome;
  const fkOk: ChiaveEsterna[] = [];
  for (const f of fk) {
    const da = f.colonne.map((c) => colReale(f.tabella, c));
    const a = f.rifColonne.map((c) => colReale(f.rifTabella, c));
    if (da.some((x) => !x) || a.some((x) => !x)) continue;
    const t = reale(f.tabella);
    fkOk.push({
      tabella: t.nome,
      colonne: da as string[],
      rifTabella: reale(f.rifTabella).nome,
      rifColonne: a as string[],
      annullabile: (da as string[]).every((c) => t.colonne.find((x) => x.nome === c)!.annullabile),
    });
  }
  // una colonna a cui altre tabelle fanno riferimento non va resa NULL
  for (const f of fkOk) {
    const c = reale(f.rifTabella).colonne.find((x) => f.rifColonne.includes(x.nome));
    if (c) for (const nome of f.rifColonne) reale(f.rifTabella).colonne.find((x) => x.nome === nome)!.annullabile = false;
  }
  return { tabelle, fk: fkOk };
}

// ---------- operazioni sui dati ----------

function haRowid(db: Database, tabella: string): boolean {
  try {
    db.exec(`SELECT rowid FROM ${q(tabella)} LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

function eseguiBlocchi(db: Database, prefisso: string, ids: number[], suffisso = ''): number {
  let n = 0;
  for (let i = 0; i < ids.length; i += 400) {
    db.run(`${prefisso} (${ids.slice(i, i + 400).join(',')})${suffisso}`);
    n += db.getRowsModified();
  }
  return n;
}

/**
 * Rende di nuovo valide le chiavi esterne dopo la cancellazione di righe: le righe «orfane» con chiave
 * esterna facoltativa ricevono NULL, le altre vengono cancellate (a cascata).
 */
function cascata(db: Database, fk: ChiaveEsterna[]): number {
  let totale = 0;
  for (let giro = 0; giro < 12; giro++) {
    let cambiato = 0;
    for (const f of fk) {
      const tutteNonNull = f.colonne.map((c) => `${q(f.tabella)}.${q(c)} IS NOT NULL`).join(' AND ');
      const uguali = f.colonne.map((c, i) => `__p.${q(f.rifColonne[i])} = ${q(f.tabella)}.${q(c)}`).join(' AND ');
      const orfana = `${tutteNonNull} AND NOT EXISTS (SELECT 1 FROM ${q(f.rifTabella)} AS __p WHERE ${uguali})`;
      if (f.annullabile) db.run(`UPDATE ${q(f.tabella)} SET ${f.colonne.map((c) => `${q(c)} = NULL`).join(', ')} WHERE ${orfana}`);
      else db.run(`DELETE FROM ${q(f.tabella)} WHERE ${orfana}`);
      cambiato += db.getRowsModified();
    }
    totale += cambiato;
    if (cambiato === 0) break;
  }
  return totale;
}

export function violazioniChiaviEsterne(db: Database, fk: ChiaveEsterna[]): number {
  let n = 0;
  for (const f of fk) {
    const tutteNonNull = f.colonne.map((c) => `t.${q(c)} IS NOT NULL`).join(' AND ');
    const uguali = f.colonne.map((c, i) => `__p.${q(f.rifColonne[i])} = t.${q(c)}`).join(' AND ');
    n += Number(righe(db, `SELECT COUNT(*) FROM ${q(f.tabella)} AS t WHERE ${tutteNonNull} AND NOT EXISTS (SELECT 1 FROM ${q(f.rifTabella)} AS __p WHERE ${uguali})`)[0][0]);
  }
  return n;
}

function rimuoviRighe(db: Database, st: Struttura, p: number, rng: () => number): number {
  let tolte = 0;
  const referenziate = new Set(st.fk.map((f) => k(f.rifTabella)));
  for (const t of st.tabelle) {
    if (!haRowid(db, t.nome)) continue;
    const ids = righe(db, `SELECT rowid FROM ${q(t.nome)}`).map((r) => Number(r[0]));
    // le tabelle «genitore» perdono meno righe: la cancellazione si propaga ai figli e svuoterebbe tutto
    const pt = referenziate.has(k(t.nome)) ? p * 0.35 : p;
    const da = ids.filter(() => rng() < pt);
    tolte += eseguiBlocchi(db, `DELETE FROM ${q(t.nome)} WHERE rowid IN`, da);
  }
  return tolte + cascata(db, st.fk);
}

function duplicaRighe(db: Database, st: Struttura, p: number, rng: () => number): number {
  let inserite = 0;
  for (const t of st.tabelle) {
    const dati = righe(db, `SELECT * FROM ${q(t.nome)}`);
    if (dati.length === 0) continue;
    const nomi = t.colonne.map((c) => c.nome);
    const sql = `INSERT OR IGNORE INTO ${q(t.nome)} (${nomi.map(q).join(', ')}) VALUES (${nomi.map(() => '?').join(', ')})`;
    const scelte = dati.filter(() => rng() < p).slice(0, 300);
    if (scelte.length === 0) continue;
    // colonna della chiave da variare per non violare la chiave primaria
    const colPk = t.colonne.filter((c) => c.pk > 0);
    const fkColonna = (c: string) => st.fk.find((f) => k(f.tabella) === k(t.nome) && f.colonne.length === 1 && k(f.colonne[0]) === k(c));
    const daVariare = colPk.find((c) => fkColonna(c.nome)) ?? colPk[0];
    const idx = daVariare ? nomi.indexOf(daVariare.nome) : -1;
    const interaPk = colPk.length === 1 && /^integer$/i.test(colPk[0].tipo);
    let massimo = 0;
    if (idx >= 0 && !fkColonna(daVariare.nome)) {
      const m = righe(db, `SELECT MAX(${q(daVariare.nome)}) FROM ${q(t.nome)}`)[0][0];
      massimo = typeof m === 'number' ? m : 0;
    }
    const fkV = idx >= 0 ? fkColonna(daVariare.nome) : undefined;
    const valoriPadre = fkV ? righe(db, `SELECT DISTINCT ${q(fkV.rifColonne[0])} FROM ${q(fkV.rifTabella)}`).map((r) => r[0]) : [];
    let contatore = 0;
    for (const r of scelte) {
      const v = [...r];
      contatore++;
      if (idx >= 0) {
        if (fkV) {
          if (valoriPadre.length > 0) v[idx] = valoriPadre[Math.floor(rng() * valoriPadre.length)];
        } else if (interaPk || typeof v[idx] === 'number') {
          v[idx] = massimo + contatore;
        } else {
          v[idx] = `${String(v[idx])}~${contatore}`;
        }
      }
      db.run(sql, v as (string | number | null)[]);
      inserite += db.getRowsModified();
    }
  }
  return inserite;
}

function inserisciNull(db: Database, st: Struttura, p: number, rng: () => number): number {
  let n = 0;
  for (const t of st.tabelle) {
    const candidate = t.colonne.filter((c) => c.annullabile);
    if (candidate.length === 0 || !haRowid(db, t.nome)) continue;
    const ids = righe(db, `SELECT rowid FROM ${q(t.nome)}`).map((r) => Number(r[0]));
    for (const c of candidate) {
      const da = ids.filter(() => rng() < p);
      n += eseguiBlocchi(db, `UPDATE OR IGNORE ${q(t.nome)} SET ${q(c.nome)} = NULL WHERE rowid IN`, da, ` AND ${q(c.nome)} IS NOT NULL`);
    }
  }
  return n;
}

/** Crea la variante `indice` a partire dal database originale serializzato. Null se non è utilizzabile. */
export function creaVariante(SQL: SqlJsStatic, byte: Uint8Array, st: Struttura, indice: number): Variante | null {
  const piano = PIANI_VARIANTI[indice % PIANI_VARIANTI.length];
  const rng = generatore(semeVariante(indice));
  const db = new SQL.Database(byte);
  try {
    db.exec('BEGIN');
    const caratteristiche: string[] = [];
    if (piano.rimuovi > 0 && rimuoviRighe(db, st, piano.rimuovi, rng) > 0) caratteristiche.push('righe mancanti');
    if (piano.duplica > 0 && duplicaRighe(db, st, piano.duplica, rng) > 0) caratteristiche.push('righe duplicate');
    if (piano.nulli > 0 && inserisciNull(db, st, piano.nulli, rng) > 0) caratteristiche.push('valori NULL');
    db.exec('COMMIT');
    const righeTotali = st.tabelle.reduce((n, t) => n + Number(righe(db, `SELECT COUNT(*) FROM ${q(t.nome)}`)[0][0]), 0);
    if (caratteristiche.length === 0 || righeTotali === 0 || violazioniChiaviEsterne(db, st.fk) > 0) {
      db.close();
      return null;
    }
    db.exec('PRAGMA query_only = ON');
    return { indice, db, caratteristiche, riferimenti: new Map() };
  } catch {
    db.close();
    return null;
  }
}

/** Insieme delle varianti di uno scenario, costruite una alla volta (anche in background). */
export class VariantiDB {
  private costruite: (Variante | null)[] = [];
  private struttura: Struttura;
  private chiuso = false;

  constructor(
    private SQL: SqlJsStatic,
    private byte: Uint8Array,
    logico: ModelloLogico | null,
    private quante = NUMERO_VARIANTI,
  ) {
    const db = new SQL.Database(byte);
    try {
      this.struttura = leggiStruttura(db, logico);
    } finally {
      db.close();
    }
  }

  /** Costruisce la prossima variante. Restituisce true se ne restano da costruire. */
  costruisciProssima(): boolean {
    if (this.chiuso || this.costruite.length >= this.quante) return false;
    this.costruite.push(creaVariante(this.SQL, this.byte, this.struttura, this.costruite.length));
    return this.costruite.length < this.quante;
  }

  /** Varianti utilizzabili (le costruisce tutte se serve). */
  tutte(): Variante[] {
    while (this.costruisciProssima());
    return this.costruite.filter((v): v is Variante => v !== null);
  }

  chiudi() {
    this.chiuso = true;
    for (const v of this.costruite) v?.db.close();
    this.costruite = [];
  }
}
