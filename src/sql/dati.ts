// Consultazione dei dati del database dello scenario (sola lettura): elenco delle tabelle e pagine di righe
// con filtro. Gli identificatori vengono sempre dal database stesso, mai dal testo digitato.
import type { Database } from 'sql.js';
import type { Valore } from './compare';
import type { Struttura } from './varianti';

export interface RiferimentoFK {
  tabella: string;
  /** colonne della tabella corrente che formano la chiave esterna */
  colonne: string[];
  /** colonne referenziate nella tabella di destinazione, nello stesso ordine */
  rifColonne: string[];
}

export interface ColonnaInfo {
  nome: string;
  tipo: string;
  pk: boolean;
  /** chiavi esterne di cui la colonna fa parte */
  fk: RiferimentoFK[];
  /** la colonna ammette NULL secondo il database */
  nullable: boolean;
}

export interface TabellaInfo {
  nome: string;
  righe: number;
  colonne: ColonnaInfo[];
}

export interface RichiestaPagina {
  tabella: string;
  offset: number;
  limite: number;
  /** cerca il testo in qualunque colonna (senza distinguere maiuscole e minuscole) */
  testo?: string;
  /** vincoli di uguaglianza esatta (salto da una chiave esterna); NULL ammesso */
  uguali?: { colonna: string; valore: Valore }[];
}

export interface Pagina {
  colonne: string[];
  righe: Valore[][];
  /** righe che soddisfano il filtro */
  totale: number;
  /** righe della tabella senza filtro */
  totaleTabella: number;
}

const q = (n: string) => `"${n.replace(/"/g, '""')}"`;

export function infoTabelle(db: Database, st: Struttura): TabellaInfo[] {
  return st.tabelle.map((t) => ({
    nome: t.nome,
    righe: Number(db.exec(`SELECT COUNT(*) FROM ${q(t.nome)}`)[0].values[0][0]),
    colonne: t.colonne.map((c) => ({
      nome: c.nome,
      tipo: c.tipo,
      pk: c.pk > 0,
      nullable: !c.notnull && c.pk === 0,
      fk: st.fk
        .filter((f) => f.tabella === t.nome && f.colonne.includes(c.nome))
        .map((f) => ({ tabella: f.rifTabella, colonne: f.colonne, rifColonne: f.rifColonne })),
    })),
  }));
}

function haRowid(db: Database, tabella: string): boolean {
  try {
    db.exec(`SELECT rowid FROM ${q(tabella)} LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function eseguiConParametri(db: Database, sql: string, parametri: (string | number | Uint8Array | null)[]): Valore[][] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(parametri);
    const out: Valore[][] = [];
    while (stmt.step()) out.push(stmt.get() as Valore[]);
    return out;
  } finally {
    stmt.free();
  }
}

export function paginaTabella(db: Database, st: Struttura, r: RichiestaPagina): Pagina {
  const tab = st.tabelle.find((t) => t.nome === r.tabella);
  if (!tab) throw new Error(`La tabella «${r.tabella}» non esiste.`);
  const nomi = tab.colonne.map((c) => c.nome);
  const colonne = nomi.map(q);

  const condizioni: string[] = [];
  const parametri: (string | number | Uint8Array | null)[] = [];
  for (const u of r.uguali ?? []) {
    if (!nomi.includes(u.colonna)) throw new Error(`La colonna «${u.colonna}» non esiste in «${tab.nome}».`);
    condizioni.push(`${q(u.colonna)} IS ?`);
    parametri.push(u.valore);
  }
  const testo = (r.testo ?? '').trim();
  if (testo) {
    const alternative = colonne.map((c) => `CAST(${c} AS TEXT) LIKE ? ESCAPE '\\'`);
    for (let i = 0; i < colonne.length; i++) parametri.push(`%${escapeLike(testo)}%`);
    // la ricerca «null» trova anche i valori NULL
    const nulli = testo.toLowerCase() === 'null' ? ` OR ${colonne.map((c) => `${c} IS NULL`).join(' OR ')}` : '';
    condizioni.push(`(${alternative.join(' OR ')}${nulli})`);
  }
  const dove = condizioni.length ? ` WHERE ${condizioni.join(' AND ')}` : '';
  const ordine = haRowid(db, tab.nome) ? ' ORDER BY rowid' : tab.pk.length ? ` ORDER BY ${tab.pk.map(q).join(', ')}` : '';

  const totaleTabella = Number(db.exec(`SELECT COUNT(*) FROM ${q(tab.nome)}`)[0].values[0][0]);
  const totale = condizioni.length ? Number(eseguiConParametri(db, `SELECT COUNT(*) FROM ${q(tab.nome)}${dove}`, parametri)[0][0]) : totaleTabella;
  const limite = Math.max(1, Math.min(500, Math.floor(r.limite)));
  const offset = Math.max(0, Math.floor(r.offset));
  const righe = eseguiConParametri(db, `SELECT ${colonne.join(', ')} FROM ${q(tab.nome)}${dove}${ordine} LIMIT ${limite} OFFSET ${offset}`, parametri);
  return { colonne: nomi, righe, totale, totaleTabella };
}
