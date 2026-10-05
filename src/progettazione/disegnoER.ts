// Disegno dello schema ER della Progettazione (notazione Atzeni–Ceri) con le posizioni scelte dallo studente.
// Calcola la geometria (anche per la selezione col dito/mouse e per l'esportazione) e produce l'SVG.
import type { Attributo, Entita, Relazione, SchemaER } from './modello';
import { bordoRettangolo, bordoRombo, esc, type Punto, type Rettangolo } from '../diagram/geometry';
import { larghezzaTesto } from '../diagram/textMeasure';

export const G = {
  fontNome: 14,
  fontAttr: 12,
  altezzaEntita: 42,
  altezzaRombo: 54,
  passoRiga: 18,
  passoX: 13,
  raggio: 4.5,
  distanzaLato: 26,
};

export interface DisegnoAttributo {
  id: string;
  proprietario: string;
  etichetta: string;
  identificatore: boolean;
  composto: boolean;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  ancora: 'start' | 'end';
  componenti: DisegnoAttributo[];
  box: Rettangolo;
}

export interface DisegnoFigura {
  id: string;
  tipo: 'entita' | 'relazione';
  nome: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface DisegnoPartecipazione {
  id: string;
  relazione: string;
  da: Punto; // sul rombo
  a: Punto; // sull'entità
  etichetta: { testo: string; x: number; y: number };
  idEsterno: Punto | null;
}

export interface DisegnoGeneralizzazione {
  id: string;
  /** segmenti figlia → giunzione (o direttamente al padre se c'è una sola figlia) */
  rami: [Punto, Punto][];
  freccia: [Punto, Punto];
  giunzione: Punto;
  copertura: { testo: string; x: number; y: number };
}

export interface DisegnoER {
  figure: DisegnoFigura[];
  attributi: DisegnoAttributo[];
  partecipazioni: DisegnoPartecipazione[];
  generalizzazioni: DisegnoGeneralizzazione[];
  box: Rettangolo;
}

export function dimensioniFigura(tipo: 'entita' | 'relazione', nome: string): { w: number; h: number } {
  const tw = larghezzaTesto(nome || ' ', G.fontNome, true);
  if (tipo === 'entita') return { w: Math.max(100, tw + 30), h: G.altezzaEntita };
  return { w: Math.max(104, tw * 1.5 + 24), h: G.altezzaRombo };
}

function etichetta(a: Attributo): string {
  return a.cardinalita ? `${a.nome} ${a.cardinalita}` : a.nome;
}

/** Bordo superiore (−1) o inferiore (+1) alla coordinata x relativa al centro. */
function bordoY(f: DisegnoFigura, xRel: number, segno: 1 | -1): number {
  if (f.tipo === 'relazione') return segno * (f.h / 2) * Math.max(0, 1 - Math.abs(xRel) / (f.w / 2));
  return (segno * f.h) / 2;
}
/** Bordo destro (+1) o sinistro (−1) alla coordinata y relativa al centro. */
function bordoX(f: DisegnoFigura, yRel: number, segno: 1 | -1): number {
  if (f.tipo === 'relazione') return segno * (f.w / 2) * Math.max(0, 1 - Math.abs(yRel) / (f.h / 2));
  return (segno * f.w) / 2;
}

function boxTesto(x: number, y: number, testo: string, ancora: 'start' | 'end', grassetto = false): Rettangolo {
  const w = larghezzaTesto(testo || ' ', G.fontAttr, grassetto);
  return { x: ancora === 'start' ? x : x - w, y: y - 8, w, h: 16 };
}

function unisci(...b: Rettangolo[]): Rettangolo {
  const x = Math.min(...b.map((r) => r.x));
  const y = Math.min(...b.map((r) => r.y));
  const x2 = Math.max(...b.map((r) => r.x + r.w));
  const y2 = Math.max(...b.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

type Lato = 'sopra' | 'sotto' | 'sinistra' | 'destra';

/** Lato della figura da cui esce una linea diretta verso `p`. */
function latoVerso(f: DisegnoFigura, p: Punto): Lato {
  const dx = p.x - f.cx;
  const dy = p.y - f.cy;
  if (Math.abs(dx) / (f.w / 2) > Math.abs(dy) / (f.h / 2)) return dx > 0 ? 'destra' : 'sinistra';
  return dy > 0 ? 'sotto' : 'sopra';
}

/**
 * Lato effettivo di ogni attributo. Quelli in «auto» evitano i lati da cui escono linee (relazioni,
 * generalizzazioni); gli attributi composti stanno sempre a destra o a sinistra.
 */
function latiAttributi(attributi: Attributo[], occupati: Set<Lato>): Map<string, Lato> {
  const out = new Map<string, Lato>();
  const auto = [...attributi.filter((a) => a.identificatore), ...attributi.filter((a) => !a.identificatore)].filter(
    (a) => a.lato === 'auto' && a.componenti.length === 0,
  );
  const liberi = (['sopra', 'sotto', 'destra', 'sinistra'] as Lato[]).filter((l) => !occupati.has(l));
  const verticali = liberi.filter((l) => l === 'sopra' || l === 'sotto');
  const laterali = liberi.filter((l) => l === 'destra' || l === 'sinistra');
  let gruppi: Lato[];
  if (verticali.length === 2 || liberi.length === 0) gruppi = ['sopra', 'sotto'];
  else if (verticali.length === 1) gruppi = auto.length > 3 && laterali.length ? [verticali[0], laterali[0]] : [verticali[0]];
  else gruppi = laterali;
  const quanti = Math.ceil(auto.length / gruppi.length);
  auto.forEach((a, i) => out.set(a.id, gruppi[Math.min(gruppi.length - 1, Math.floor(i / quanti))]));
  for (const a of attributi) {
    if (out.has(a.id)) continue;
    if (a.componenti.length > 0) out.set(a.id, a.lato === 'sinistra' ? 'sinistra' : a.lato === 'destra' ? 'destra' : occupati.has('destra') && !occupati.has('sinistra') ? 'sinistra' : 'destra');
    else out.set(a.id, a.lato === 'auto' ? 'sopra' : a.lato);
  }
  return out;
}

function disegnaAttributi(f: DisegnoFigura, attributi: Attributo[], occupati: Set<Lato> = new Set()): DisegnoAttributo[] {
  const lati = latiAttributi(attributi, occupati);
  const ordinati = [...attributi.filter((a) => a.identificatore), ...attributi.filter((a) => !a.identificatore)];
  const perLato = (l: string) => ordinati.filter((a) => lati.get(a.id) === l);
  const out: DisegnoAttributo[] = [];
  const passo = (n: number) => (n <= 1 ? G.passoX : Math.min(G.passoX, (f.w - 16) / (n - 1)));

  const sopra = perLato('sopra');
  sopra.forEach((a, i) => {
    const xRel = -f.w / 2 + 8 + i * passo(sopra.length);
    const cy = f.cy - f.h / 2 - ((sopra.length - i) * G.passoRiga + 4);
    const tx = f.cx + xRel + G.raggio + 4;
    out.push({
      id: a.id, proprietario: f.id, etichetta: etichetta(a), identificatore: a.identificatore, composto: false,
      x1: f.cx + xRel, y1: f.cy + bordoY(f, xRel, -1), cx: f.cx + xRel, cy, tx, ty: cy, ancora: 'start', componenti: [],
      box: unisci(boxTesto(tx, cy, etichetta(a), 'start', a.identificatore), { x: f.cx + xRel - 6, y: cy - 6, w: 12, h: 12 }),
    });
  });
  const sotto = perLato('sotto');
  sotto.forEach((a, i) => {
    const xRel = f.w / 2 - 8 - i * passo(sotto.length);
    const cy = f.cy + f.h / 2 + ((sotto.length - i) * G.passoRiga + 4);
    const tx = f.cx + xRel - G.raggio - 4;
    out.push({
      id: a.id, proprietario: f.id, etichetta: etichetta(a), identificatore: a.identificatore, composto: false,
      x1: f.cx + xRel, y1: f.cy + bordoY(f, xRel, 1), cx: f.cx + xRel, cy, tx, ty: cy, ancora: 'end', componenti: [],
      box: unisci(boxTesto(tx, cy, etichetta(a), 'end', a.identificatore), { x: f.cx + xRel - 6, y: cy - 6, w: 12, h: 12 }),
    });
  });

  for (const segno of [1, -1] as const) {
    const lista = perLato(segno === 1 ? 'destra' : 'sinistra');
    if (lista.length === 0) continue;
    const righe = lista.reduce((n, a) => n + 1 + a.componenti.length, 0);
    let r = 0;
    const y0 = f.cy - ((righe - 1) * G.passoRiga) / 2;
    const ancora = segno === 1 ? 'start' : 'end';
    for (const a of lista) {
      const cy = y0 + r * G.passoRiga;
      const yEdge = Math.max(f.cy - f.h / 2 + 5, Math.min(f.cy + f.h / 2 - 5, cy));
      const x1 = f.cx + bordoX(f, yEdge - f.cy, segno);
      const cx = f.cx + segno * (f.w / 2 + G.distanzaLato);
      const tx = cx + segno * (G.raggio + 4);
      const componenti: DisegnoAttributo[] = a.componenti.map((c, j) => {
        const ccy = cy + (j + 1) * G.passoRiga;
        const ccx = cx + segno * 22;
        const ctx = ccx + segno * (G.raggio + 4);
        return {
          id: c.id, proprietario: f.id, etichetta: etichetta(c), identificatore: c.identificatore, composto: false,
          x1: cx, y1: cy, cx: ccx, cy: ccy, tx: ctx, ty: ccy, ancora, componenti: [],
          box: unisci(boxTesto(ctx, ccy, etichetta(c), ancora), { x: ccx - 6, y: ccy - 6, w: 12, h: 12 }),
        };
      });
      const boxA = unisci(boxTesto(tx, cy, etichetta(a), ancora, a.identificatore), { x: cx - 7, y: cy - 7, w: 14, h: 14 });
      out.push({
        id: a.id, proprietario: f.id, etichetta: etichetta(a), identificatore: a.identificatore, composto: a.componenti.length > 0,
        x1, y1: yEdge, cx, cy, tx, ty: cy, ancora, componenti,
        box: componenti.length ? unisci(boxA, ...componenti.map((c) => c.box)) : boxA,
      });
      r += 1 + a.componenti.length;
    }
  }
  return out;
}

function figura(el: Entita | Relazione, tipo: 'entita' | 'relazione'): DisegnoFigura {
  const { w, h } = dimensioniFigura(tipo, el.nome);
  return { id: el.id, tipo, nome: el.nome, cx: el.x, cy: el.y, w, h };
}

function bordo(f: DisegnoFigura, verso: Punto): Punto {
  return f.tipo === 'relazione' ? bordoRombo(f.cx, f.cy, f.w, f.h, verso) : bordoRettangolo(f.cx, f.cy, f.w, f.h, verso);
}

export function calcolaDisegnoER(s: SchemaER): DisegnoER {
  const figure = [...s.entita.map((e) => figura(e, 'entita')), ...s.relazioni.map((r) => figura(r, 'relazione'))];
  const perId = new Map(figure.map((f) => [f.id, f]));
  // lati da cui escono linee, per tenere lontani gli attributi posizionati automaticamente
  const occupati = new Map<string, Set<Lato>>(figure.map((f) => [f.id, new Set<Lato>()]));
  const occupa = (a: DisegnoFigura | undefined, b: Punto) => a && occupati.get(a.id)!.add(latoVerso(a, b));
  for (const r of s.relazioni) {
    const fr = perId.get(r.id)!;
    for (const p of r.partecipazioni) {
      const fe = perId.get(p.entita);
      if (!fe) continue;
      occupa(fr, { x: fe.cx, y: fe.cy });
      occupa(fe, { x: fr.cx, y: fr.cy });
    }
  }
  for (const g of s.generalizzazioni) {
    const padre = perId.get(g.padre);
    const figlie = g.figlie.map((f) => perId.get(f)).filter((x): x is DisegnoFigura => !!x);
    if (!padre || figlie.length === 0) continue;
    const centro = { x: figlie.reduce((n, f) => n + f.cx, 0) / figlie.length, y: figlie.reduce((n, f) => n + f.cy, 0) / figlie.length };
    occupa(padre, centro);
    for (const f of figlie) occupa(f, { x: (padre.cx + centro.x) / 2, y: (padre.cy + centro.y) / 2 });
  }
  const attributi = [
    ...s.entita.flatMap((e) => disegnaAttributi(perId.get(e.id)!, e.attributi, occupati.get(e.id))),
    ...s.relazioni.flatMap((r) => disegnaAttributi(perId.get(r.id)!, r.attributi, occupati.get(r.id))),
  ];

  const partecipazioni: DisegnoPartecipazione[] = [];
  for (const r of s.relazioni) {
    const fr = perId.get(r.id)!;
    const gruppi = new Map<string, typeof r.partecipazioni>();
    for (const p of r.partecipazioni) gruppi.set(p.entita, [...(gruppi.get(p.entita) ?? []), p]);
    for (const [idEnt, gruppo] of gruppi) {
      const fe = perId.get(idEnt);
      if (!fe) continue;
      gruppo.forEach((p, i) => {
        const scarto = gruppo.length > 1 ? (i - (gruppo.length - 1) / 2) * 22 : 0;
        const dx = fe.cx - fr.cx;
        const dy = fe.cy - fr.cy;
        const len = Math.hypot(dx, dy) || 1;
        const ox = (-dy / len) * scarto;
        const oy = (dx / len) * scarto;
        const sr = { ...fr, cx: fr.cx + ox, cy: fr.cy + oy };
        const se = { ...fe, cx: fe.cx + ox, cy: fe.cy + oy };
        const da = bordo(sr, { x: se.cx, y: se.cy });
        const a = bordo(se, { x: sr.cx, y: sr.cy });
        const ux = (da.x - a.x) / (Math.hypot(da.x - a.x, da.y - a.y) || 1);
        const uy = (da.y - a.y) / (Math.hypot(da.x - a.x, da.y - a.y) || 1);
        const testo = `${p.cardinalita ?? '(?,?)'}${p.ruolo.trim() ? ` ${p.ruolo.trim()}` : ''}`;
        // etichetta vicino all'entità: sulle linee orizzontali si sposta di mezza larghezza per non coprire la figura
        const lunghezza = Math.hypot(da.x - a.x, da.y - a.y);
        const dist = Math.min(lunghezza * 0.45, 12 + (larghezzaTesto(testo, G.fontAttr, true) / 2) * Math.abs(ux) + 4);
        // etichetta sopra o a destra della linea; con più linee parallele, dalla parte esterna
        let nx = -uy;
        let ny = ux;
        if (ny > 0 || (Math.abs(ny) < 0.2 && nx < 0)) {
          nx = -nx;
          ny = -ny;
        }
        if (scarto !== 0 && ox * nx + oy * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        const ent = s.entita.find((e) => e.id === idEnt);
        const esterno = !!ent?.identificatoreEsterno.includes(r.id);
        partecipazioni.push({
          id: p.id,
          relazione: r.id,
          da,
          a,
          etichetta: { testo, x: a.x + ux * dist + nx * 11, y: a.y + uy * dist + ny * 11 },
          idEsterno: esterno ? { x: a.x + ux * 10, y: a.y + uy * 10 } : null,
        });
      });
    }
  }

  const generalizzazioni: DisegnoGeneralizzazione[] = [];
  for (const g of s.generalizzazioni) {
    const padre = perId.get(g.padre);
    const figlie = g.figlie.map((f) => perId.get(f)).filter((x): x is DisegnoFigura => !!x);
    if (!padre || figlie.length === 0) continue;
    const cx = figlie.reduce((n, f) => n + f.cx, 0) / figlie.length;
    const cy = figlie.reduce((n, f) => n + f.cy, 0) / figlie.length;
    const giunzione = figlie.length === 1 ? bordo(figlie[0], { x: padre.cx, y: padre.cy }) : { x: padre.cx + (cx - padre.cx) * 0.5, y: padre.cy + (cy - padre.cy) * 0.5 };
    const rami: [Punto, Punto][] = figlie.length === 1 ? [] : figlie.map((f) => [bordo(f, giunzione), giunzione]);
    const freccia: [Punto, Punto] = [giunzione, bordo(padre, giunzione)];
    generalizzazioni.push({ id: g.id, rami, freccia, giunzione, copertura: { testo: g.copertura, x: giunzione.x + 10, y: giunzione.y } });
  }

  const scatole: Rettangolo[] = [
    ...figure.map((f) => ({ x: f.cx - f.w / 2, y: f.cy - f.h / 2, w: f.w, h: f.h })),
    ...attributi.map((a) => a.box),
    ...partecipazioni.map((p) => boxTesto(p.etichetta.x - 30, p.etichetta.y, p.etichetta.testo + '      ', 'start')),
    ...generalizzazioni.map((g) => boxTesto(g.copertura.x, g.copertura.y, g.copertura.testo, 'start')),
  ];
  const box = scatole.length ? unisci(...scatole) : { x: 0, y: 0, w: 400, h: 300 };
  return { figure, attributi, partecipazioni, generalizzazioni, box };
}

// ---------- selezione col puntatore ----------

export type Colpo =
  | { tipo: 'figura'; id: string }
  | { tipo: 'attributo'; id: string; proprietario: string }
  | { tipo: 'partecipazione'; id: string; relazione: string }
  | { tipo: 'generalizzazione'; id: string };

function distanzaSegmento(p: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const dentro = (p: Punto, r: Rettangolo, m = 0) => p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m;

/** Elemento sotto il punto (coordinate del diagramma). `tolleranza` cresce col touch. */
export function colpisci(d: DisegnoER, p: Punto, tolleranza = 6): Colpo | null {
  for (let i = d.figure.length - 1; i >= 0; i--) {
    const f = d.figure[i];
    if (f.tipo === 'entita' ? dentro(p, { x: f.cx - f.w / 2, y: f.cy - f.h / 2, w: f.w, h: f.h }, tolleranza / 2) : Math.abs(p.x - f.cx) / (f.w / 2 + tolleranza) + Math.abs(p.y - f.cy) / (f.h / 2 + tolleranza) <= 1) {
      return { tipo: 'figura', id: f.id };
    }
  }
  for (const a of d.attributi) {
    for (const c of a.componenti) if (dentro(p, c.box, 2)) return { tipo: 'attributo', id: c.id, proprietario: c.proprietario };
    if (dentro(p, { x: a.cx - 8, y: a.cy - 8, w: 16, h: 16 }) || dentro(p, boxTesto(a.tx, a.ty, a.etichetta, a.ancora), 2)) {
      return { tipo: 'attributo', id: a.id, proprietario: a.proprietario };
    }
  }
  for (const pp of d.partecipazioni) {
    if (distanzaSegmento(p, pp.da, pp.a) <= tolleranza || dentro(p, boxTesto(pp.etichetta.x - 20, pp.etichetta.y, pp.etichetta.testo, 'start'), 2)) {
      return { tipo: 'partecipazione', id: pp.id, relazione: pp.relazione };
    }
  }
  for (const g of d.generalizzazioni) {
    const segmenti = [...g.rami, g.freccia];
    if (segmenti.some(([a, b]) => distanzaSegmento(p, a, b) <= tolleranza)) return { tipo: 'generalizzazione', id: g.id };
  }
  return null;
}

/** Figure (entità e relazioni) interamente o in parte dentro il rettangolo di selezione. */
export function figureNelRettangolo(d: DisegnoER, r: Rettangolo): string[] {
  return d.figure.filter((f) => f.cx >= r.x && f.cx <= r.x + r.w && f.cy >= r.y && f.cy <= r.y + r.h).map((f) => f.id);
}

// ---------- SVG ----------

const f1 = (n: number) => Math.round(n * 10) / 10;

export interface OpzioniSvgER {
  selezionati?: Set<string>;
  segnalati?: Set<string>;
}

export function svgDisegnoER(d: DisegnoER, opz: OpzioniSvgER = {}): string {
  const sel = opz.selezionati ?? new Set<string>();
  const seg = opz.segnalati ?? new Set<string>();
  const p: string[] = [];
  p.push(`<defs><marker id="pg-freccia" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="er-freccia"/></marker></defs>`);
  for (const g of d.generalizzazioni) {
    const cls = `er-linea er-gen${sel.has(g.id) ? ' pg-sel-linea' : ''}`;
    for (const [a, b] of g.rami) p.push(`<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" class="${cls}"/>`);
    const [a, b] = g.freccia;
    p.push(`<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" class="${cls}" marker-end="url(#pg-freccia)"/>`);
    if (g.rami.length) p.push(`<circle cx="${f1(g.giunzione.x)}" cy="${f1(g.giunzione.y)}" r="3" class="er-giunzione"/>`);
  }
  for (const pp of d.partecipazioni) {
    p.push(`<line x1="${f1(pp.da.x)}" y1="${f1(pp.da.y)}" x2="${f1(pp.a.x)}" y2="${f1(pp.a.y)}" class="er-linea${sel.has(pp.id) ? ' pg-sel-linea' : ''}${seg.has(pp.id) ? ' pg-segnalato-linea' : ''}"/>`);
    if (pp.idEsterno) p.push(`<circle cx="${f1(pp.idEsterno.x)}" cy="${f1(pp.idEsterno.y)}" r="${G.raggio}" class="er-chiave"/>`);
  }
  const disegnaAttr = (a: DisegnoAttributo) => {
    p.push(`<line x1="${f1(a.x1)}" y1="${f1(a.y1)}" x2="${f1(a.cx)}" y2="${f1(a.cy)}" class="er-linea-attr"/>`);
    for (const c of a.componenti) disegnaAttr(c);
    const r = a.composto ? G.raggio + 1.5 : G.raggio;
    p.push(`<circle cx="${f1(a.cx)}" cy="${f1(a.cy)}" r="${r}" class="${a.identificatore ? 'er-chiave' : 'er-attr'}${sel.has(a.id) ? ' pg-sel-attr' : ''}"/>`);
    p.push(`<text x="${f1(a.tx)}" y="${f1(a.ty)}" text-anchor="${a.ancora}" dominant-baseline="central" class="er-testo-attr${a.identificatore ? ' er-testo-chiave' : ''}">${esc(a.etichetta)}</text>`);
  };
  for (const a of d.attributi) disegnaAttr(a);
  for (const f of d.figure) {
    const extra = `${sel.has(f.id) ? ' pg-sel' : ''}${seg.has(f.id) ? ' pg-segnalato' : ''}`;
    if (f.tipo === 'entita') {
      p.push(`<rect x="${f1(f.cx - f.w / 2)}" y="${f1(f.cy - f.h / 2)}" width="${f1(f.w)}" height="${f1(f.h)}" rx="2" class="er-entita${extra}"/>`);
    } else {
      const pts = [[f.cx, f.cy - f.h / 2], [f.cx + f.w / 2, f.cy], [f.cx, f.cy + f.h / 2], [f.cx - f.w / 2, f.cy]].map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');
      p.push(`<polygon points="${pts}" class="er-rombo${extra}"/>`);
    }
    p.push(`<text x="${f1(f.cx)}" y="${f1(f.cy)}" text-anchor="middle" dominant-baseline="central" class="er-nome">${esc(f.nome || '(senza nome)')}</text>`);
  }
  for (const pp of d.partecipazioni) {
    p.push(`<text x="${f1(pp.etichetta.x)}" y="${f1(pp.etichetta.y)}" text-anchor="middle" dominant-baseline="central" class="er-card${pp.etichetta.testo.startsWith('(?') ? ' pg-card-mancante' : ''}">${esc(pp.etichetta.testo)}</text>`);
  }
  for (const g of d.generalizzazioni) {
    p.push(`<text x="${f1(g.copertura.x)}" y="${f1(g.copertura.y)}" dominant-baseline="central" class="er-card">${esc(g.copertura.testo)}</text>`);
  }
  return p.join('');
}
