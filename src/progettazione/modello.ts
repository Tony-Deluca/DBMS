// Modello dei dati della sezione «Progettazione»: schema ER (anche ristrutturato) e schema logico
// disegnati dallo studente. Le posizioni sono quelle scelte nell'editor.

export const VERSIONE_PROGETTO = 1;

export type CardinalitaPartecipazione = '(0,1)' | '(1,1)' | '(0,N)' | '(1,N)';
export const CARDINALITA_PARTECIPAZIONE: CardinalitaPartecipazione[] = ['(0,1)', '(1,1)', '(0,N)', '(1,N)'];

/** null = (1,1), cioè attributo semplice obbligatorio */
export type CardinalitaAttributo = null | '(0,1)' | '(1,N)' | '(0,N)';
export const CARDINALITA_ATTRIBUTO: CardinalitaAttributo[] = [null, '(0,1)', '(1,N)', '(0,N)'];

export type Copertura = '(t,e)' | '(t,s)' | '(p,e)' | '(p,s)';
export const COPERTURE: Copertura[] = ['(t,e)', '(t,s)', '(p,e)', '(p,s)'];

export type Lato = 'auto' | 'sopra' | 'sotto' | 'sinistra' | 'destra';
export const LATI: Lato[] = ['auto', 'sopra', 'sotto', 'sinistra', 'destra'];

export interface Attributo {
  id: string;
  nome: string;
  /** fa parte dell'identificatore (interno) */
  identificatore: boolean;
  cardinalita: CardinalitaAttributo;
  lato: Lato;
  /** sotto-attributi di un attributo composto (un solo livello) */
  componenti: Attributo[];
}

export interface Entita {
  id: string;
  nome: string;
  x: number;
  y: number;
  attributi: Attributo[];
  /** relazioni che partecipano all'identificatore (identificatore esterno, entità debole) */
  identificatoreEsterno: string[];
}

export interface Partecipazione {
  id: string;
  entita: string;
  /** null = non ancora scelta (segnalata dai controlli) */
  cardinalita: CardinalitaPartecipazione | null;
  ruolo: string;
}

export interface Relazione {
  id: string;
  nome: string;
  x: number;
  y: number;
  attributi: Attributo[];
  partecipazioni: Partecipazione[];
}

export interface Generalizzazione {
  id: string;
  padre: string;
  figlie: string[];
  copertura: Copertura;
}

export interface SchemaER {
  entita: Entita[];
  relazioni: Relazione[];
  generalizzazioni: Generalizzazione[];
}

export interface Colonna {
  id: string;
  nome: string;
  pk: boolean;
  facoltativa: boolean;
}

/** Chiave esterna per nome (come nella notazione d'esame): i nomi si aggiornano quando si rinomina. */
export interface ChiaveEsternaP {
  id: string;
  colonne: string[];
  tabella: string;
  riferimenti: string[];
}

export interface Tabella {
  id: string;
  nome: string;
  x: number;
  y: number;
  colonne: Colonna[];
  chiaviEsterne: ChiaveEsternaP[];
}

export interface SchemaLogicoP {
  tabelle: Tabella[];
}

export type Pannello = 'traccia' | 'er' | 'erR' | 'note' | 'logico';

export interface Progetto {
  id: string;
  nome: string;
  versione: number;
  creato: number;
  modificato: number;
  traccia: string;
  er: SchemaER;
  erRistrutturato: SchemaER | null;
  noteRistrutturazione: string;
  logico: SchemaLogicoP;
  /** testo del logico con un errore di sintassi, conservato finché non viene corretto */
  bozzaTestoLogico: string | null;
  pannelli: [Pannello, Pannello];
}

// ---------- identificatori ----------

let contatore = 0;
export function nuovoIdElemento(prefisso: string): string {
  contatore = (contatore + 1) % 1e6;
  return `${prefisso}${Date.now().toString(36)}${contatore.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function schemaVuoto(): SchemaER {
  return { entita: [], relazioni: [], generalizzazioni: [] };
}

export function nuovoAttributo(nome: string, opz: Partial<Omit<Attributo, 'id'>> = {}): Attributo {
  return { id: nuovoIdElemento('a'), nome, identificatore: false, cardinalita: null, lato: 'auto', componenti: [], ...opz };
}

export function nuovoProgetto(nome: string, id: string): Progetto {
  const ora = Date.now();
  return {
    id,
    nome,
    versione: VERSIONE_PROGETTO,
    creato: ora,
    modificato: ora,
    traccia: '',
    er: schemaVuoto(),
    erRistrutturato: null,
    noteRistrutturazione: '',
    logico: { tabelle: [] },
    bozzaTestoLogico: null,
    pannelli: ['er', 'logico'],
  };
}

/** Copia profonda con identificatori nuovi (i riferimenti interni vengono rimappati). */
export function copiaSchemaER(s: SchemaER): SchemaER {
  const mappa = new Map<string, string>();
  const nuovoId = (vecchio: string, prefisso: string) => {
    const n = nuovoIdElemento(prefisso);
    mappa.set(vecchio, n);
    return n;
  };
  const copiaAttr = (a: Attributo): Attributo => ({ ...a, id: nuovoId(a.id, 'a'), componenti: a.componenti.map(copiaAttr) });
  const entita = s.entita.map((e) => ({ ...e, id: nuovoId(e.id, 'e'), attributi: e.attributi.map(copiaAttr), identificatoreEsterno: [...e.identificatoreEsterno] }));
  const relazioni = s.relazioni.map((r) => ({
    ...r,
    id: nuovoId(r.id, 'r'),
    attributi: r.attributi.map(copiaAttr),
    partecipazioni: r.partecipazioni.map((p) => ({ ...p, id: nuovoId(p.id, 'p') })),
  }));
  const generalizzazioni = s.generalizzazioni.map((g) => ({ ...g, id: nuovoId(g.id, 'g'), figlie: [...g.figlie] }));
  const m = (id: string) => mappa.get(id) ?? id;
  for (const e of entita) e.identificatoreEsterno = e.identificatoreEsterno.map(m);
  for (const r of relazioni) for (const p of r.partecipazioni) p.entita = m(p.entita);
  for (const g of generalizzazioni) {
    g.padre = m(g.padre);
    g.figlie = g.figlie.map(m);
  }
  return { entita, relazioni, generalizzazioni };
}

export function clona<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Riporta un progetto letto da file/archivio a una forma completa (campi mancanti → valori predefiniti). */
export function normalizzaProgetto(p: Partial<Progetto> & { id: string }): Progetto {
  const base = nuovoProgetto(p.nome ?? 'Progetto', p.id);
  const norm = (s: Partial<SchemaER> | null | undefined): SchemaER => {
    const attr = (a: Partial<Attributo>): Attributo => ({
      id: a.id ?? nuovoIdElemento('a'),
      nome: a.nome ?? '',
      identificatore: !!a.identificatore,
      cardinalita: (a.cardinalita ?? null) as CardinalitaAttributo,
      lato: (a.lato ?? 'auto') as Lato,
      componenti: (a.componenti ?? []).map(attr),
    });
    return {
      entita: (s?.entita ?? []).map((e) => ({ ...e, attributi: (e.attributi ?? []).map(attr), identificatoreEsterno: e.identificatoreEsterno ?? [] })),
      relazioni: (s?.relazioni ?? []).map((r) => ({
        ...r,
        attributi: (r.attributi ?? []).map(attr),
        partecipazioni: (r.partecipazioni ?? []).map((pp) => ({ ...pp, ruolo: pp.ruolo ?? '', cardinalita: pp.cardinalita ?? null })),
      })),
      generalizzazioni: (s?.generalizzazioni ?? []).map((g) => ({ ...g, figlie: g.figlie ?? [], copertura: g.copertura ?? '(t,e)' })),
    };
  };
  return {
    ...base,
    ...p,
    er: norm(p.er),
    erRistrutturato: p.erRistrutturato ? norm(p.erRistrutturato) : null,
    logico: {
      tabelle: (p.logico?.tabelle ?? []).map((t) => ({
        ...t,
        colonne: (t.colonne ?? []).map((c) => ({ ...c, pk: !!c.pk, facoltativa: !!c.facoltativa })),
        chiaviEsterne: t.chiaviEsterne ?? [],
      })),
    },
    pannelli: p.pannelli ?? base.pannelli,
    traccia: p.traccia ?? '',
    noteRistrutturazione: p.noteRistrutturazione ?? '',
    bozzaTestoLogico: p.bozzaTestoLogico ?? null,
    versione: VERSIONE_PROGETTO,
  };
}
