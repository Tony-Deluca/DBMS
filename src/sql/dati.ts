// Consultazione dei dati del database dello scenario (sola lettura): elenco delle tabelle e pagine di righe
// con filtro. Gli identificatori vengono sempre dal database stesso, mai dal testo digitato.
import type { Valore } from './compare';
import type { Db } from './motore';
import { qi } from './motore';
import { sqlT, tabellaDi, type Struttura } from './varianti';

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

async function conta(db: Db, sql: string, parametri: (string | number | null)[] = []): Promise<number> {
  return Number((await db.m.interna(db.schema, sql, parametri)).righe[0][0]);
}

export async function infoTabelle(db: Db, st: Struttura): Promise<TabellaInfo[]> {
  const out: TabellaInfo[] = [];
  for (const t of st.tabelle) {
    out.push({
      nome: t.nome,
      righe: await conta(db, `SELECT COUNT(*) FROM ${sqlT(t)}`),
      colonne: t.colonne.map((c) => ({
        nome: c.nome,
        tipo: c.tipo,
        pk: c.pk > 0,
        nullable: !c.notnull && c.pk === 0,
        fk: st.fk
          .filter((f) => f.tabella === t.nome && f.colonne.includes(c.nome))
          .map((f) => ({ tabella: f.rifTabella, colonne: f.colonne, rifColonne: f.rifColonne })),
      })),
    });
  }
  return out;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function paginaTabella(db: Db, st: Struttura, r: RichiestaPagina): Promise<Pagina> {
  const tab = tabellaDi(st, r.tabella);
  if (!tab) throw new Error(`La tabella «${r.tabella}» non esiste.`);
  const nomi = tab.colonne.map((c) => c.nome);
  const colonne = tab.colonne.map((c) => qi(c.reale));

  const condizioni: string[] = [];
  const parametri: (string | number | null)[] = [];
  const segnaposto = (v: string | number | null) => {
    parametri.push(v);
    return `$${parametri.length}`;
  };
  for (const u of r.uguali ?? []) {
    const i = nomi.indexOf(u.colonna);
    if (i < 0) throw new Error(`La colonna «${u.colonna}» non esiste in «${tab.nome}».`);
    const v = u.valore instanceof Uint8Array ? null : u.valore;
    // il tipo del parametro lo deduce PostgreSQL dalla colonna (numeri, date come testo, 'true'/'false')
    condizioni.push(v === null ? `${colonne[i]} IS NULL` : `${colonne[i]} = ${segnaposto(v)}`);
  }
  const testo = (r.testo ?? '').trim();
  if (testo) {
    const p = segnaposto(`%${escapeLike(testo)}%`);
    const alternative = colonne.map((c) => `CAST(${c} AS TEXT) ILIKE ${p}`);
    // la ricerca «null» trova anche i valori NULL
    const nulli = testo.toLowerCase() === 'null' ? ` OR ${colonne.map((c) => `${c} IS NULL`).join(' OR ')}` : '';
    condizioni.push(`(${alternative.join(' OR ')}${nulli})`);
  }
  const dove = condizioni.length ? ` WHERE ${condizioni.join(' AND ')}` : '';
  const pk = tab.colonne.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
  const ordine = pk.length ? ` ORDER BY ${pk.map((c) => qi(c.reale)).join(', ')}` : ' ORDER BY ctid';

  const totaleTabella = await conta(db, `SELECT COUNT(*) FROM ${sqlT(tab)}`);
  const totale = condizioni.length ? await conta(db, `SELECT COUNT(*) FROM ${sqlT(tab)}${dove}`, parametri) : totaleTabella;
  const limite = Math.max(1, Math.min(500, Math.floor(r.limite)));
  const offset = Math.max(0, Math.floor(r.offset));
  const righe = (await db.m.interna(db.schema, `SELECT ${colonne.join(', ')} FROM ${sqlT(tab)}${dove}${ordine} LIMIT ${limite} OFFSET ${offset}`, parametri)).righe;
  return { colonne: nomi, righe, totale, totaleTabella };
}
