// Operazioni sugli schemi della Progettazione. Modificano lo schema passato (l'editor salva prima
// un'istantanea per annulla/ripeti) e non correggono mai le scelte dello studente.
import {
  copiaSchemaER,
  nuovoAttributo,
  nuovoIdElemento,
  type Attributo,
  type CardinalitaPartecipazione,
  type ChiaveEsternaP,
  type Colonna,
  type Copertura,
  type Entita,
  type Generalizzazione,
  type Partecipazione,
  type Relazione,
  type SchemaER,
  type SchemaLogicoP,
  type Tabella,
} from './modello';

const k = (s: string) => s.trim().toLowerCase();

// ===================== schema ER =====================

export function nomeUnico(nomiEsistenti: string[], base: string): string {
  const usati = new Set(nomiEsistenti.map(k));
  if (!usati.has(k(base))) return base;
  for (let i = 2; ; i++) if (!usati.has(k(`${base}${i}`))) return `${base}${i}`;
}

const nomiER = (s: SchemaER) => [...s.entita.map((e) => e.nome), ...s.relazioni.map((r) => r.nome)];

export function aggiungiEntita(s: SchemaER, x: number, y: number, nome?: string): Entita {
  const e: Entita = { id: nuovoIdElemento('e'), nome: nome ?? nomeUnico(nomiER(s), 'ENTITA'), x, y, attributi: [], identificatoreEsterno: [] };
  s.entita.push(e);
  return e;
}

export function aggiungiRelazione(s: SchemaER, x: number, y: number, nome?: string): Relazione {
  const r: Relazione = { id: nuovoIdElemento('r'), nome: nome ?? nomeUnico(nomiER(s), 'RELAZIONE'), x, y, attributi: [], partecipazioni: [] };
  s.relazioni.push(r);
  return r;
}

export function trovaEntita(s: SchemaER, id: string): Entita | undefined {
  return s.entita.find((e) => e.id === id);
}
export function trovaRelazione(s: SchemaER, id: string): Relazione | undefined {
  return s.relazioni.find((r) => r.id === id);
}
export function trovaGeneralizzazione(s: SchemaER, id: string): Generalizzazione | undefined {
  return s.generalizzazioni.find((g) => g.id === id);
}
export function trovaPartecipazione(s: SchemaER, id: string): { relazione: Relazione; partecipazione: Partecipazione } | undefined {
  for (const r of s.relazioni) {
    const p = r.partecipazioni.find((x) => x.id === id);
    if (p) return { relazione: r, partecipazione: p };
  }
  return undefined;
}

/** Elemento che possiede attributi (entità o relazione). */
export function proprietario(s: SchemaER, id: string): Entita | Relazione | undefined {
  return trovaEntita(s, id) ?? trovaRelazione(s, id);
}

export function rinomina(s: SchemaER, id: string, nome: string): void {
  const el = proprietario(s, id);
  if (el) el.nome = nome;
}

export interface PosizioneAttributo {
  attributo: Attributo;
  /** array che contiene l'attributo */
  lista: Attributo[];
  proprietario: Entita | Relazione;
  /** attributo composto che lo contiene, se è un componente */
  composto?: Attributo;
}

export function trovaAttributo(s: SchemaER, id: string): PosizioneAttributo | undefined {
  for (const el of [...s.entita, ...s.relazioni]) {
    for (const a of el.attributi) {
      if (a.id === id) return { attributo: a, lista: el.attributi, proprietario: el };
      const c = a.componenti.find((x) => x.id === id);
      if (c) return { attributo: c, lista: a.componenti, proprietario: el, composto: a };
    }
  }
  return undefined;
}

export function aggiungiAttributo(s: SchemaER, idProprietario: string, nome?: string, opz: Partial<Omit<Attributo, 'id'>> = {}): Attributo | undefined {
  const el = proprietario(s, idProprietario);
  if (!el) return undefined;
  const a = nuovoAttributo(nome ?? nomeUnico(el.attributi.map((x) => x.nome), 'Attributo'), opz);
  el.attributi.push(a);
  return a;
}

/** Aggiunge un sotto-attributo: l'attributo diventa composto. */
export function aggiungiComponente(s: SchemaER, idAttributo: string, nome?: string): Attributo | undefined {
  const pos = trovaAttributo(s, idAttributo);
  if (!pos || pos.composto) return undefined; // un solo livello
  const c = nuovoAttributo(nome ?? nomeUnico(pos.attributo.componenti.map((x) => x.nome), 'Componente'));
  pos.attributo.componenti.push(c);
  // gli attributi composti si disegnano di lato
  if (pos.attributo.lato === 'sopra' || pos.attributo.lato === 'sotto') pos.attributo.lato = 'auto';
  return c;
}

export function modificaAttributo(s: SchemaER, id: string, modifiche: Partial<Omit<Attributo, 'id' | 'componenti'>>): void {
  const pos = trovaAttributo(s, id);
  if (pos) Object.assign(pos.attributo, modifiche);
}

export function eliminaAttributo(s: SchemaER, id: string): void {
  const pos = trovaAttributo(s, id);
  if (pos) pos.lista.splice(pos.lista.indexOf(pos.attributo), 1);
}

export function spostaAttributo(s: SchemaER, id: string, verso: -1 | 1): void {
  const pos = trovaAttributo(s, id);
  if (!pos) return;
  const i = pos.lista.indexOf(pos.attributo);
  const j = i + verso;
  if (j < 0 || j >= pos.lista.length) return;
  [pos.lista[i], pos.lista[j]] = [pos.lista[j], pos.lista[i]];
}

export function aggiungiPartecipazione(
  s: SchemaER,
  idRelazione: string,
  idEntita: string,
  cardinalita: CardinalitaPartecipazione | null = null,
  ruolo = '',
): Partecipazione | undefined {
  const r = trovaRelazione(s, idRelazione);
  if (!r || !trovaEntita(s, idEntita)) return undefined;
  const p: Partecipazione = { id: nuovoIdElemento('p'), entita: idEntita, cardinalita, ruolo };
  r.partecipazioni.push(p);
  return p;
}

export function modificaPartecipazione(s: SchemaER, id: string, modifiche: Partial<Omit<Partecipazione, 'id'>>): void {
  const t = trovaPartecipazione(s, id);
  if (t) Object.assign(t.partecipazione, modifiche);
}

export function eliminaPartecipazione(s: SchemaER, id: string): void {
  const t = trovaPartecipazione(s, id);
  if (!t) return;
  t.relazione.partecipazioni.splice(t.relazione.partecipazioni.indexOf(t.partecipazione), 1);
}

export type EsitoCollegamento =
  | { tipo: 'partecipazione'; partecipazione: Partecipazione; relazione: Relazione }
  | { tipo: 'relazione'; relazione: Relazione }
  | { tipo: 'nessuno' };

/**
 * Collega due elementi trascinando dall'uno all'altro:
 * entità↔relazione = nuova partecipazione; entità↔entità = nuova relazione in mezzo (anche ricorsiva se è la stessa).
 */
export function collega(s: SchemaER, da: string, a: string): EsitoCollegamento {
  const eDa = trovaEntita(s, da);
  const eA = trovaEntita(s, a);
  const rDa = trovaRelazione(s, da);
  const rA = trovaRelazione(s, a);
  if (eDa && rA) return { tipo: 'partecipazione', partecipazione: aggiungiPartecipazione(s, rA.id, eDa.id)!, relazione: rA };
  if (rDa && eA) return { tipo: 'partecipazione', partecipazione: aggiungiPartecipazione(s, rDa.id, eA.id)!, relazione: rDa };
  if (eDa && eA) {
    const ricorsiva = eDa.id === eA.id;
    const x = ricorsiva ? eDa.x + 170 : (eDa.x + eA.x) / 2;
    const y = ricorsiva ? eDa.y : (eDa.y + eA.y) / 2;
    const r = aggiungiRelazione(s, x, y);
    aggiungiPartecipazione(s, r.id, eDa.id, null, ricorsiva ? 'ruolo1' : '');
    aggiungiPartecipazione(s, r.id, eA.id, null, ricorsiva ? 'ruolo2' : '');
    return { tipo: 'relazione', relazione: r };
  }
  return { tipo: 'nessuno' };
}

/** Aggiunge `figlia` alla generalizzazione di `padre` (la crea se non esiste). */
export function aggiungiFiglia(s: SchemaER, idPadre: string, idFiglia: string, copertura: Copertura = '(t,e)'): Generalizzazione | undefined {
  if (idPadre === idFiglia || !trovaEntita(s, idPadre) || !trovaEntita(s, idFiglia)) return undefined;
  let g = s.generalizzazioni.find((x) => x.padre === idPadre);
  if (!g) {
    g = { id: nuovoIdElemento('g'), padre: idPadre, figlie: [], copertura };
    s.generalizzazioni.push(g);
  }
  if (!g.figlie.includes(idFiglia)) g.figlie.push(idFiglia);
  return g;
}

export function modificaGeneralizzazione(s: SchemaER, id: string, modifiche: Partial<Omit<Generalizzazione, 'id'>>): void {
  const g = trovaGeneralizzazione(s, id);
  if (g) Object.assign(g, modifiche);
}

/** Elimina elementi di qualunque tipo; i riferimenti agli elementi eliminati vengono tolti. */
export function elimina(s: SchemaER, ids: string[]): void {
  const via = new Set(ids);
  for (const id of ids) {
    if (trovaPartecipazione(s, id)) eliminaPartecipazione(s, id);
    if (trovaAttributo(s, id)) eliminaAttributo(s, id);
  }
  s.entita = s.entita.filter((e) => !via.has(e.id));
  s.relazioni = s.relazioni.filter((r) => !via.has(r.id));
  s.generalizzazioni = s.generalizzazioni.filter((g) => !via.has(g.id));
  const entitaRimaste = new Set(s.entita.map((e) => e.id));
  const relazioniRimaste = new Set(s.relazioni.map((r) => r.id));
  for (const r of s.relazioni) r.partecipazioni = r.partecipazioni.filter((p) => entitaRimaste.has(p.entita));
  for (const e of s.entita) e.identificatoreEsterno = e.identificatoreEsterno.filter((r) => relazioniRimaste.has(r));
  for (const g of s.generalizzazioni) g.figlie = g.figlie.filter((f) => entitaRimaste.has(f));
  s.generalizzazioni = s.generalizzazioni.filter((g) => entitaRimaste.has(g.padre) && g.figlie.length > 0);
}

export function sposta(s: SchemaER, ids: string[], dx: number, dy: number): void {
  const set = new Set(ids);
  for (const el of [...s.entita, ...s.relazioni]) {
    if (set.has(el.id)) {
      el.x += dx;
      el.y += dy;
    }
  }
}

/**
 * Duplica entità e relazioni (con i loro attributi). Le partecipazioni di una relazione duplicata puntano alle
 * copie delle entità se anche queste sono state duplicate, altrimenti alle entità originali.
 * Restituisce gli id delle copie.
 */
export function duplica(s: SchemaER, ids: string[], scarto = 40): string[] {
  const set = new Set(ids);
  const parziale: SchemaER = {
    entita: s.entita.filter((e) => set.has(e.id)),
    relazioni: s.relazioni.filter((r) => set.has(r.id)),
    generalizzazioni: [],
  };
  if (parziale.entita.length + parziale.relazioni.length === 0) return [];
  const copia = copiaSchemaER(parziale);
  const nomi = nomiER(s);
  const idCopiaDi = new Map(parziale.entita.map((e, i) => [e.id, copia.entita[i].id]));
  for (const e of copia.entita) {
    e.x += scarto;
    e.y += scarto;
    e.nome = nomeUnico(nomi, e.nome);
    nomi.push(e.nome);
    e.identificatoreEsterno = [];
  }
  for (const r of copia.relazioni) {
    r.x += scarto;
    r.y += scarto;
    r.nome = nomeUnico(nomi, r.nome);
    nomi.push(r.nome);
    // copiaSchemaER rimappa solo le entità copiate: le altre restano quelle originali
    for (const p of r.partecipazioni) p.entita = idCopiaDi.get(p.entita) ?? p.entita;
  }
  s.entita.push(...copia.entita);
  s.relazioni.push(...copia.relazioni);
  return [...copia.entita.map((e) => e.id), ...copia.relazioni.map((r) => r.id)];
}

// ===================== schema logico =====================

export function trovaTabella(l: SchemaLogicoP, id: string): Tabella | undefined {
  return l.tabelle.find((t) => t.id === id);
}

export function trovaColonna(l: SchemaLogicoP, id: string): { tabella: Tabella; colonna: Colonna } | undefined {
  for (const t of l.tabelle) {
    const c = t.colonne.find((x) => x.id === id);
    if (c) return { tabella: t, colonna: c };
  }
  return undefined;
}

export function aggiungiTabella(l: SchemaLogicoP, x: number, y: number, nome?: string): Tabella {
  const t: Tabella = { id: nuovoIdElemento('t'), nome: nome ?? nomeUnico(l.tabelle.map((x2) => x2.nome), 'Tabella'), x, y, colonne: [], chiaviEsterne: [] };
  l.tabelle.push(t);
  return t;
}

/** Rinomina una tabella aggiornando le chiavi esterne che la riferiscono. */
export function rinominaTabella(l: SchemaLogicoP, id: string, nome: string): void {
  const t = trovaTabella(l, id);
  if (!t) return;
  const vecchio = t.nome;
  t.nome = nome;
  for (const u of l.tabelle) for (const fk of u.chiaviEsterne) if (k(fk.tabella) === k(vecchio)) fk.tabella = nome;
}

export function aggiungiColonna(l: SchemaLogicoP, idTabella: string, nome?: string, opz: Partial<Omit<Colonna, 'id' | 'nome'>> = {}): Colonna | undefined {
  const t = trovaTabella(l, idTabella);
  if (!t) return undefined;
  const c: Colonna = { id: nuovoIdElemento('c'), nome: nome ?? nomeUnico(t.colonne.map((x) => x.nome), 'Colonna'), pk: false, facoltativa: false, ...opz };
  t.colonne.push(c);
  return c;
}

/** Modifica una colonna; se cambia nome, aggiorna le chiavi esterne della tabella e quelle che la riferiscono. */
export function modificaColonna(l: SchemaLogicoP, id: string, modifiche: Partial<Omit<Colonna, 'id'>>): void {
  const tc = trovaColonna(l, id);
  if (!tc) return;
  const { tabella, colonna } = tc;
  if (modifiche.nome !== undefined && modifiche.nome !== colonna.nome) {
    const vecchio = colonna.nome;
    for (const fk of tabella.chiaviEsterne) fk.colonne = fk.colonne.map((c) => (k(c) === k(vecchio) ? modifiche.nome! : c));
    for (const u of l.tabelle) {
      for (const fk of u.chiaviEsterne) {
        if (k(fk.tabella) === k(tabella.nome)) fk.riferimenti = fk.riferimenti.map((c) => (k(c) === k(vecchio) ? modifiche.nome! : c));
      }
    }
  }
  Object.assign(colonna, modifiche);
}

export function eliminaColonna(l: SchemaLogicoP, id: string): void {
  const tc = trovaColonna(l, id);
  if (!tc) return;
  const { tabella, colonna } = tc;
  tabella.colonne.splice(tabella.colonne.indexOf(colonna), 1);
  tabella.chiaviEsterne = tabella.chiaviEsterne.filter((fk) => !fk.colonne.some((c) => k(c) === k(colonna.nome)));
  for (const u of l.tabelle) {
    u.chiaviEsterne = u.chiaviEsterne.filter((fk) => !(k(fk.tabella) === k(tabella.nome) && fk.riferimenti.some((c) => k(c) === k(colonna.nome))));
  }
}

export function spostaColonna(l: SchemaLogicoP, id: string, verso: -1 | 1): void {
  const tc = trovaColonna(l, id);
  if (!tc) return;
  const lista = tc.tabella.colonne;
  const i = lista.indexOf(tc.colonna);
  const j = i + verso;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
}

/** Chiave esterna su una sola colonna verso tabella.colonna (null = nessuna). Sostituisce quella semplice esistente. */
export function impostaChiaveEsternaSemplice(l: SchemaLogicoP, idColonna: string, verso: { tabella: string; colonna: string } | null): void {
  const tc = trovaColonna(l, idColonna);
  if (!tc) return;
  const { tabella, colonna } = tc;
  tabella.chiaviEsterne = tabella.chiaviEsterne.filter((fk) => !(fk.colonne.length === 1 && k(fk.colonne[0]) === k(colonna.nome)));
  if (verso) tabella.chiaviEsterne.push({ id: nuovoIdElemento('f'), colonne: [colonna.nome], tabella: verso.tabella, riferimenti: [verso.colonna] });
}

export function aggiungiChiaveEsterna(l: SchemaLogicoP, idTabella: string, fk: Omit<ChiaveEsternaP, 'id'>): ChiaveEsternaP | undefined {
  const t = trovaTabella(l, idTabella);
  if (!t) return undefined;
  const nuova = { id: nuovoIdElemento('f'), ...fk };
  t.chiaviEsterne.push(nuova);
  return nuova;
}

export function eliminaChiaveEsterna(l: SchemaLogicoP, idFk: string): void {
  for (const t of l.tabelle) t.chiaviEsterne = t.chiaviEsterne.filter((f) => f.id !== idFk);
}

/** Elimina tabelle e colonne; le chiavi esterne verso le tabelle eliminate vengono tolte. */
export function eliminaLogico(l: SchemaLogicoP, ids: string[]): void {
  for (const id of ids) if (trovaColonna(l, id)) eliminaColonna(l, id);
  const via = l.tabelle.filter((t) => ids.includes(t.id)).map((t) => k(t.nome));
  l.tabelle = l.tabelle.filter((t) => !ids.includes(t.id));
  for (const t of l.tabelle) t.chiaviEsterne = t.chiaviEsterne.filter((fk) => !via.includes(k(fk.tabella)) && !ids.includes(fk.id));
}

export function spostaTabelle(l: SchemaLogicoP, ids: string[], dx: number, dy: number): void {
  for (const t of l.tabelle) {
    if (ids.includes(t.id)) {
      t.x += dx;
      t.y += dy;
    }
  }
}

export function duplicaTabelle(l: SchemaLogicoP, ids: string[], scarto = 40): string[] {
  const nuove: Tabella[] = [];
  const nomi = l.tabelle.map((t) => t.nome);
  for (const t of l.tabelle.filter((x) => ids.includes(x.id))) {
    const nome = nomeUnico(nomi, t.nome);
    nomi.push(nome);
    nuove.push({
      id: nuovoIdElemento('t'),
      nome,
      x: t.x + scarto,
      y: t.y + scarto,
      colonne: t.colonne.map((c) => ({ ...c, id: nuovoIdElemento('c') })),
      chiaviEsterne: t.chiaviEsterne.map((f) => ({ ...f, id: nuovoIdElemento('f'), colonne: [...f.colonne], riferimenti: [...f.riferimenti] })),
    });
  }
  l.tabelle.push(...nuove);
  return nuove.map((t) => t.id);
}
