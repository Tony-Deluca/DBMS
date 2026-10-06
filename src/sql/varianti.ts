// Database di prova: varianti dei dati dello scenario, generate in modo riproducibile (seme fisso).
//
// Due query diverse possono coincidere sui dati originali per caso. Per ridurre il rischio la verifica
// controlla la risposta anche su varianti dei dati in cui mancano righe, ci sono righe duplicate e valori NULL.
// Non è una prova formale di equivalenza: è un controllo pratico.
import { qi, type Db } from './motore';
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
  db: Db;
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
  /** nome mostrato (con le maiuscole del modello logico, se la colonna vi compare) */
  nome: string;
  /** nome nel catalogo di PostgreSQL (di solito minuscolo) */
  reale: string;
  tipo: string;
  notnull: boolean;
  pk: number; // posizione nella chiave primaria (0 = non è PK)
  /** può ricevere NULL nelle varianti */
  annullabile: boolean;
}

interface Tabella {
  nome: string;
  reale: string;
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

const k = (s: string) => s.toLowerCase();
const SEP = '\u0001';

/** Tabella per nome (mostrato o reale, senza distinguere maiuscole). */
export function tabellaDi(st: Struttura, nome: string): Tabella | undefined {
  return st.tabelle.find((t) => t.nome === nome) ?? st.tabelle.find((t) => k(t.nome) === k(nome) || k(t.reale) === k(nome));
}
/** Identificatori SQL (quotati con il nome reale) di una tabella e di una sua colonna. */
export const sqlT = (t: Tabella) => qi(t.reale);
export function sqlC(t: Tabella, nome: string): string {
  const c = t.colonne.find((x) => x.nome === nome) ?? t.colonne.find((x) => k(x.nome) === k(nome));
  return qi(c ? c.reale : nome);
}

async function righe(db: Db, sql: string, parametri: (string | number | null)[] = []) {
  return (await db.m.interna(db.schema, sql, parametri)).righe;
}

/** Legge tabelle, colonne e chiavi esterne (dal catalogo di PostgreSQL e dal modello logico). */
export async function leggiStruttura(db: Db, logico: ModelloLogico | null): Promise<Struttura> {
  const info = await righe(
    db,
    `SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::int, COALESCE(array_position(pk.conkey, a.attnum), 0)
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     LEFT JOIN pg_constraint pk ON pk.conrelid = c.oid AND pk.contype = 'p'
     WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
     ORDER BY c.relname, a.attnum`,
    [db.schema],
  );
  const tabelle: Tabella[] = [];
  for (const [rt, rc, tipo, notnullN, pkN] of info) {
    const reale = String(rt);
    let t = tabelle.find((x) => x.reale === reale);
    if (!t) {
      const lt = logico?.tabelle.find((x) => k(x.nome) === k(reale));
      t = { nome: lt && reale === k(reale) ? lt.nome : reale, reale, colonne: [], pk: [] };
      tabelle.push(t);
    }
    const lt = logico?.tabelle.find((x) => k(x.nome) === k(reale));
    const cr = String(rc);
    const lc = lt?.colonne.find((c) => k(c.nome) === k(cr));
    const notnull = Number(notnullN) === 1;
    const pk = Number(pkN);
    // il modello logico, se descrive la colonna, ha l'ultima parola: nullable assente = obbligatoria
    const ammessoDalModello = lc ? lc.nullable === true : true;
    t.colonne.push({
      nome: lc && cr === k(cr) ? lc.nome : cr,
      reale: cr,
      tipo: String(tipo ?? '').toUpperCase(),
      notnull,
      pk,
      annullabile: !notnull && pk === 0 && ammessoDalModello,
    });
  }
  for (const t of tabelle) t.pk = t.colonne.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.nome);
  tabelle.sort((a, b) => k(a.nome).localeCompare(k(b.nome)));

  const fk: ChiaveEsterna[] = [];
  const chiave = (f: ChiaveEsterna) => `${k(f.tabella)}|${f.colonne.map(k).join(',')}|${k(f.rifTabella)}|${f.rifColonne.map(k).join(',')}`;
  const viste = new Set<string>();
  const aggiungi = (f: ChiaveEsterna) => {
    if (f.colonne.length === 0 || f.colonne.length !== f.rifColonne.length) return;
    if (!tabellaDi({ tabelle, fk }, f.tabella) || !tabellaDi({ tabelle, fk }, f.rifTabella)) return;
    if (viste.has(chiave(f))) return;
    viste.add(chiave(f));
    fk.push(f);
  };
  const dichiarate = await righe(
    db,
    `SELECT c.relname, f.relname,
       (SELECT string_agg(a.attname, chr(1) ORDER BY x.i) FROM unnest(con.conkey) WITH ORDINALITY x(n, i) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = x.n),
       (SELECT string_agg(a.attname, chr(1) ORDER BY x.i) FROM unnest(con.confkey) WITH ORDINALITY x(n, i) JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = x.n)
     FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_class f ON f.oid = con.confrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE con.contype = 'f' AND n.nspname = $1
     ORDER BY c.relname, con.conname`,
    [db.schema],
  );
  for (const [t, rif, da, a] of dichiarate) {
    aggiungi({ tabella: String(t), colonne: String(da ?? '').split(SEP), rifTabella: String(rif), rifColonne: String(a ?? '').split(SEP) });
  }
  for (const t of logico?.tabelle ?? []) {
    for (const f of t.chiaviEsterne ?? []) {
      aggiungi({ tabella: t.nome, colonne: f.colonne, rifTabella: f.tabella, rifColonne: f.riferimenti });
    }
  }
  // nomi mostrati delle tabelle e delle colonne
  const reale = (t: string) => tabellaDi({ tabelle, fk }, t)!;
  const colReale = (t: string, c: string) => reale(t).colonne.find((x) => k(x.nome) === k(c) || k(x.reale) === k(c))?.nome;
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
    for (const nome of f.rifColonne) {
      const c = reale(f.rifTabella).colonne.find((x) => x.nome === nome);
      if (c) c.annullabile = false;
    }
  }
  return { tabelle, fk: fkOk };
}

// ---------- operazioni sui dati ----------

async function eseguiBlocchi(db: Db, prefisso: string, ids: string[], suffisso = ''): Promise<number> {
  let n = 0;
  for (let i = 0; i < ids.length; i += 400) {
    const lista = ids.slice(i, i + 400).map((x) => `'${x}'::tid`).join(',');
    n += await db.m.modifica(db.schema, `${prefisso} (${lista})${suffisso}`);
  }
  return n;
}

async function ctid(db: Db, t: Tabella): Promise<string[]> {
  return (await righe(db, `SELECT ctid::text FROM ${sqlT(t)}`)).map((r) => String(r[0]));
}

function condizioneOrfana(st: Struttura, f: ChiaveEsterna, alias: string): string {
  const t = tabellaDi(st, f.tabella)!;
  const p = tabellaDi(st, f.rifTabella)!;
  const tutteNonNull = f.colonne.map((c) => `${alias}.${sqlC(t, c)} IS NOT NULL`).join(' AND ');
  const uguali = f.colonne.map((c, i) => `__p.${sqlC(p, f.rifColonne[i])} = ${alias}.${sqlC(t, c)}`).join(' AND ');
  return `${tutteNonNull} AND NOT EXISTS (SELECT 1 FROM ${sqlT(p)} AS __p WHERE ${uguali})`;
}

/**
 * Rende di nuovo valide le chiavi esterne dopo la cancellazione di righe: le righe «orfane» con chiave
 * esterna facoltativa ricevono NULL, le altre vengono cancellate (a cascata).
 */
async function cascata(db: Db, st: Struttura): Promise<number> {
  let totale = 0;
  for (let giro = 0; giro < 12; giro++) {
    let cambiato = 0;
    for (const f of st.fk) {
      const t = tabellaDi(st, f.tabella)!;
      const orfana = condizioneOrfana(st, f, sqlT(t));
      if (f.annullabile) cambiato += await db.m.modifica(db.schema, `UPDATE ${sqlT(t)} SET ${f.colonne.map((c) => `${sqlC(t, c)} = NULL`).join(', ')} WHERE ${orfana}`);
      else cambiato += await db.m.modifica(db.schema, `DELETE FROM ${sqlT(t)} WHERE ${orfana}`);
    }
    totale += cambiato;
    if (cambiato === 0) break;
  }
  return totale;
}

export async function violazioniChiaviEsterne(db: Db, st: Struttura): Promise<number> {
  let n = 0;
  for (const f of st.fk) {
    const t = tabellaDi(st, f.tabella)!;
    n += Number((await righe(db, `SELECT COUNT(*) FROM ${sqlT(t)} AS t WHERE ${condizioneOrfana(st, f, 't')}`))[0][0]);
  }
  return n;
}

async function rimuoviRighe(db: Db, st: Struttura, p: number, rng: () => number): Promise<number> {
  let tolte = 0;
  const referenziate = new Set(st.fk.map((f) => k(f.rifTabella)));
  for (const t of st.tabelle) {
    const ids = await ctid(db, t);
    // le tabelle «genitore» perdono meno righe: la cancellazione si propaga ai figli e svuoterebbe tutto
    const pt = referenziate.has(k(t.nome)) ? p * 0.35 : p;
    const da = ids.filter(() => rng() < pt);
    tolte += await eseguiBlocchi(db, `DELETE FROM ${sqlT(t)} WHERE ctid IN`, da);
  }
  return tolte + (await cascata(db, st));
}

async function duplicaRighe(db: Db, st: Struttura, p: number, rng: () => number): Promise<number> {
  let inserite = 0;
  for (const t of st.tabelle) {
    const dati = await righe(db, `SELECT * FROM ${sqlT(t)}`);
    if (dati.length === 0) continue;
    const nomi = t.colonne.map((c) => c.nome);
    const sql = `INSERT INTO ${sqlT(t)} (${t.colonne.map((c) => qi(c.reale)).join(', ')}) OVERRIDING SYSTEM VALUE VALUES (${nomi.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT DO NOTHING`;
    const scelte = dati.filter(() => rng() < p).slice(0, 300);
    if (scelte.length === 0) continue;
    // colonna della chiave da variare per non violare la chiave primaria
    const colPk = t.colonne.filter((c) => c.pk > 0);
    const fkColonna = (c: string) => st.fk.find((f) => k(f.tabella) === k(t.nome) && f.colonne.length === 1 && k(f.colonne[0]) === k(c));
    const daVariare = colPk.find((c) => fkColonna(c.nome)) ?? colPk[0];
    const idx = daVariare ? nomi.indexOf(daVariare.nome) : -1;
    const interaPk = colPk.length === 1 && /^(INTEGER|BIGINT|SMALLINT)$/.test(colPk[0].tipo);
    let massimo = 0;
    if (idx >= 0 && !fkColonna(daVariare.nome)) {
      const m = (await righe(db, `SELECT MAX(${qi(daVariare.reale)}) FROM ${sqlT(t)}`))[0][0];
      massimo = typeof m === 'number' ? m : 0;
    }
    const fkV = idx >= 0 ? fkColonna(daVariare.nome) : undefined;
    const padre = fkV ? tabellaDi(st, fkV.rifTabella)! : null;
    const valoriPadre = fkV && padre ? (await righe(db, `SELECT DISTINCT ${sqlC(padre, fkV.rifColonne[0])} FROM ${sqlT(padre)}`)).map((r) => r[0]) : [];
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
      try {
        inserite += await db.m.modifica(db.schema, sql, v as (string | number | null)[]);
      } catch {
        /* la riga duplicata viola un vincolo (es. CHECK o lunghezza): si salta */
      }
    }
  }
  return inserite;
}

async function inserisciNull(db: Db, st: Struttura, p: number, rng: () => number): Promise<number> {
  let n = 0;
  for (const t of st.tabelle) {
    const candidate = t.colonne.filter((c) => c.annullabile);
    if (candidate.length === 0) continue;
    for (const c of candidate) {
      // ctid cambia a ogni UPDATE: si rilegge per ogni colonna
      const ids = await ctid(db, t);
      const da = ids.filter(() => rng() < p);
      try {
        n += await eseguiBlocchi(db, `UPDATE ${sqlT(t)} SET ${qi(c.reale)} = NULL WHERE ctid IN`, da, ` AND ${qi(c.reale)} IS NOT NULL`);
      } catch {
        /* un vincolo CHECK non ammette NULL: la colonna resta com'è */
      }
    }
  }
  return n;
}

/** Crea la variante `indice` copiando lo schema originale. Null se non è utilizzabile. */
export async function creaVariante(origine: Db, st: Struttura, indice: number, schema: string): Promise<Variante | null> {
  const piano = PIANI_VARIANTI[indice % PIANI_VARIANTI.length];
  const rng = generatore(semeVariante(indice));
  const db: Db = { m: origine.m, schema };
  try {
    await db.m.copiaSchema(origine.schema, schema, st.tabelle.map((t) => t.reale));
    const caratteristiche: string[] = [];
    if (piano.rimuovi > 0 && (await rimuoviRighe(db, st, piano.rimuovi, rng)) > 0) caratteristiche.push('righe mancanti');
    if (piano.duplica > 0 && (await duplicaRighe(db, st, piano.duplica, rng)) > 0) caratteristiche.push('righe duplicate');
    if (piano.nulli > 0 && (await inserisciNull(db, st, piano.nulli, rng)) > 0) caratteristiche.push('valori NULL');
    let righeTotali = 0;
    for (const t of st.tabelle) righeTotali += Number((await righe(db, `SELECT COUNT(*) FROM ${sqlT(t)}`))[0][0]);
    if (caratteristiche.length === 0 || righeTotali === 0 || (await violazioniChiaviEsterne(db, st)) > 0) {
      await db.m.eliminaSchemi(schema);
      return null;
    }
    return { indice, db, caratteristiche, riferimenti: new Map() };
  } catch {
    await db.m.eliminaSchemi(schema).catch(() => undefined);
    return null;
  }
}

/** Insieme delle varianti di uno scenario, costruite una alla volta (anche in background). */
export class VariantiDB {
  private costruite: (Variante | null)[] = [];
  private chiuso = false;
  private inCorso: Promise<boolean> | null = null;

  constructor(
    private origine: Db,
    private struttura: Struttura,
    /** prefisso degli schemi delle varianti (es. «v» → v0, v1, …) */
    private prefisso: string,
    private quante = NUMERO_VARIANTI,
  ) {}

  /** Costruisce la prossima variante. Restituisce true se ne restano da costruire. */
  costruisciProssima(): Promise<boolean> {
    // una costruzione alla volta, anche se richiesta sia dal background sia da una verifica
    this.inCorso ??= (async () => {
      try {
        if (this.chiuso || this.costruite.length >= this.quante) return false;
        const i = this.costruite.length;
        const v = await creaVariante(this.origine, this.struttura, i, `${this.prefisso}${i}`);
        if (this.chiuso) return false;
        this.costruite.push(v);
        return this.costruite.length < this.quante;
      } finally {
        this.inCorso = null;
      }
    })();
    return this.inCorso;
  }

  /** Varianti utilizzabili (le costruisce tutte se serve). */
  async tutte(): Promise<Variante[]> {
    while (await this.costruisciProssima());
    return this.costruite.filter((v): v is Variante => v !== null);
  }

  async chiudi() {
    this.chiuso = true;
    this.costruite = [];
    await this.origine.m.eliminaSchemi(this.prefisso).catch(() => undefined);
  }
}
