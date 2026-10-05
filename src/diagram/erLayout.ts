// Layout automatico del diagramma ER (notazione Atzeni–Ceri):
// dagre posiziona entità, rombi e giunzioni delle generalizzazioni;
// gli attributi sono "lecca-lecca" a scala sopra e sotto ogni figura.
import dagre from '@dagrejs/dagre';
import type { AttributoER, ModelloER } from '../scenario/types';
import type { Punto, Rettangolo } from './geometry';
import { larghezzaTesto } from './textMeasure';

export const STILE = {
  fontNome: 14,
  fontAttr: 12,
  fontCard: 12,
  altezzaEntita: 40,
  altezzaRombo: 52,
  passoRiga: 18,
  passoX: 13,
  raggio: 4.5,
};

export interface AttributoLayout {
  nome: string;
  etichetta: string;
  chiave: boolean;
  /** linea dal bordo della figura al cerchio */
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  /** testo */
  tx: number;
  ty: number;
  ancora: 'start' | 'end';
}

export interface NodoER {
  id: string;
  tipo: 'entita' | 'relazione' | 'giunzione';
  nome: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  attributi: AttributoLayout[];
  /** ingombro totale (figura + attributi) */
  box: Rettangolo;
  /** etichetta della copertura per le giunzioni */
  copertura?: string;
}

export interface ArcoER {
  tipo: 'partecipazione' | 'figlia' | 'padre';
  punti: Punto[];
  etichetta?: { testo: string; x: number; y: number; ancora: 'start' | 'middle' | 'end' };
  /** identificatore esterno: pallino pieno vicino all'entità */
  identificatoreEsterno?: Punto;
}

export interface LayoutER {
  nodi: NodoER[];
  archi: ArcoER[];
  larghezza: number;
  altezza: number;
}

const k = (s: string) => s.trim().toLowerCase();

interface Pettine {
  sopra: AttributoER[];
  sotto: AttributoER[];
  altezzaSopra: number;
  altezzaSotto: number;
  /** estensione orizzontale rispetto al centro della figura */
  sinistra: number;
  destra: number;
}

function etichettaAttributo(a: AttributoER): string {
  const c = a.cardinalita?.replace(/\s+/g, '');
  return c && c !== '(1,1)' ? `${a.nome} ${c.replace(/n\)$/, 'N)')}` : a.nome;
}

function passoX(w: number, n: number): number {
  if (n <= 1) return STILE.passoX;
  return Math.min(STILE.passoX, (w - 16) / (n - 1));
}

/** Calcola l'ingombro del pettine di attributi di una figura larga w. */
function pettine(attr: AttributoER[], w: number): Pettine {
  // identificatori prima: finiscono in alto (più vicini al nome)
  const ordinati = [...attr.filter((a) => a.chiave), ...attr.filter((a) => !a.chiave)];
  const nSopra = Math.ceil(ordinati.length / 2);
  const sopra = ordinati.slice(0, nSopra);
  const sotto = ordinati.slice(nSopra);
  let destra = w / 2;
  let sinistra = w / 2;
  const ps = passoX(w, sopra.length);
  sopra.forEach((a, i) => {
    const x = -w / 2 + 8 + i * ps;
    destra = Math.max(destra, x + STILE.raggio + 4 + larghezzaTesto(etichettaAttributo(a), STILE.fontAttr, !!a.chiave) + 4);
  });
  const pt = passoX(w, sotto.length);
  sotto.forEach((a, i) => {
    const x = w / 2 - 8 - i * pt;
    sinistra = Math.max(sinistra, -(x - STILE.raggio - 4 - larghezzaTesto(etichettaAttributo(a), STILE.fontAttr, !!a.chiave) - 4));
  });
  return {
    sopra,
    sotto,
    altezzaSopra: sopra.length * STILE.passoRiga + (sopra.length ? 10 : 0),
    altezzaSotto: sotto.length * STILE.passoRiga + (sotto.length ? 10 : 0),
    sinistra,
    destra,
  };
}

/** y del bordo superiore (segno -1) o inferiore (+1) della figura alla coordinata x relativa. */
function bordoVerticale(tipo: NodoER['tipo'], w: number, h: number, xRel: number, segno: 1 | -1): number {
  if (tipo === 'relazione') return segno * (h / 2) * Math.max(0, 1 - Math.abs(xRel) / (w / 2));
  return segno * (h / 2);
}

function posizionaAttributi(nodo: NodoER, p: Pettine): AttributoLayout[] {
  const out: AttributoLayout[] = [];
  const { cx, cy, w, h, tipo } = nodo;
  const ps = passoX(w, p.sopra.length);
  p.sopra.forEach((a, i) => {
    const xRel = -w / 2 + 8 + i * ps;
    const altezza = (p.sopra.length - i) * STILE.passoRiga + 2;
    const yCerchio = cy - h / 2 - altezza;
    out.push({
      nome: a.nome,
      etichetta: etichettaAttributo(a),
      chiave: !!a.chiave,
      x1: cx + xRel,
      y1: cy + bordoVerticale(tipo, w, h, xRel, -1),
      cx: cx + xRel,
      cy: yCerchio,
      tx: cx + xRel + STILE.raggio + 4,
      ty: yCerchio,
      ancora: 'start',
    });
  });
  const pt = passoX(w, p.sotto.length);
  p.sotto.forEach((a, i) => {
    const xRel = w / 2 - 8 - i * pt;
    const prof = (p.sotto.length - i) * STILE.passoRiga + 2;
    const yCerchio = cy + h / 2 + prof;
    out.push({
      nome: a.nome,
      etichetta: etichettaAttributo(a),
      chiave: !!a.chiave,
      x1: cx + xRel,
      y1: cy + bordoVerticale(tipo, w, h, xRel, 1),
      cx: cx + xRel,
      cy: yCerchio,
      tx: cx + xRel - STILE.raggio - 4,
      ty: yCerchio,
      ancora: 'end',
    });
  });
  return out;
}

function dimensioniFigura(tipo: NodoER['tipo'], nome: string): { w: number; h: number } {
  if (tipo === 'giunzione') return { w: 10, h: 10 };
  const tw = larghezzaTesto(nome, STILE.fontNome, true);
  if (tipo === 'entita') return { w: Math.max(96, tw + 28), h: STILE.altezzaEntita };
  return { w: Math.max(100, tw * 1.5 + 22), h: STILE.altezzaRombo };
}

interface ArcoLogico {
  tipo: ArcoER['tipo'];
  da: string; // rombo o giunzione
  a: string; // entità
  testo?: string;
  idEsterno?: boolean;
}

const PASSO_PORTE = 18;

/** Altezza del rettangolo dell'entità in funzione del numero di archi su un lato. */
function altezzaPerPorte(n: number): number {
  return Math.max(STILE.altezzaEntita, PASSO_PORTE * (n - 1) + 24);
}

export function calcolaLayoutER(er: ModelloER, mostraAttributi = true): LayoutER {
  // primo passaggio: posizioni; secondo: entità più alte dove arrivano molti archi sullo stesso lato
  let altezze = new Map<string, number>();
  let risultato = passaggio(er, mostraAttributi, altezze);
  if (risultato.portePerLato.size > 0) {
    const nuove = new Map<string, number>();
    for (const [chiave, n] of risultato.portePerLato) {
      const id = chiave.split('|')[0];
      if (!id.startsWith('e')) continue;
      nuove.set(id, Math.max(nuove.get(id) ?? 0, altezzaPerPorte(n)));
    }
    if ([...nuove.values()].some((h) => h > STILE.altezzaEntita)) {
      altezze = nuove;
      risultato = passaggio(er, mostraAttributi, altezze);
    }
  }
  return risultato.layout;
}

function passaggio(er: ModelloER, mostraAttributi: boolean, altezze: Map<string, number>): { layout: LayoutER; portePerLato: Map<string, number> } {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  // lo spazio tra i livelli deve contenere l'etichetta più lunga (cardinalità + ruolo)
  let etichettaMax = 0;
  for (const r of er.relazioni) {
    for (const p of r.partecipanti) etichettaMax = Math.max(etichettaMax, larghezzaTesto(`${p.cardinalita} ${p.ruolo ?? ''}`.trim(), STILE.fontCard, true));
  }
  const ranksep = Math.min(220, Math.max(84, etichettaMax + 40));
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep, edgesep: 20, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodi = new Map<string, NodoER & { pettine: Pettine }>();
  const aggiungi = (id: string, tipo: NodoER['tipo'], nome: string, attr: AttributoER[]) => {
    const dim = dimensioniFigura(tipo, nome);
    const w = dim.w;
    const h = tipo === 'entita' ? Math.max(dim.h, altezze.get(id) ?? 0) : dim.h;
    const p = pettine(mostraAttributi ? attr : [], w);
    // box simmetrico attorno al centro della figura (dagre ragiona sui centri)
    const mezzaL = Math.max(p.sinistra, p.destra) + 6;
    const mezzaH = Math.max(h / 2 + p.altezzaSopra, h / 2 + p.altezzaSotto);
    nodi.set(id, { id, tipo, nome, cx: 0, cy: 0, w, h, attributi: [], box: { x: 0, y: 0, w: 0, h: 0 }, pettine: p });
    g.setNode(id, { width: mezzaL * 2, height: mezzaH * 2 });
  };

  const idEntita = new Map<string, string>();
  er.entita.forEach((e, i) => {
    const id = `e${i}`;
    idEntita.set(k(e.nome), id);
    aggiungi(id, 'entita', e.nome, e.attributi ?? []);
  });

  const logici: ArcoLogico[] = [];

  er.relazioni.forEach((r, i) => {
    const id = `r${i}`;
    aggiungi(id, 'relazione', r.nome, r.attributi ?? []);
    const coppie = new Set<string>();
    r.partecipanti.forEach((p, j) => {
      const ent = idEntita.get(k(p.entita));
      if (!ent) return;
      const card = p.cardinalita.replace(/\s+/g, '').replace(/n\)$/, 'N)');
      const ext = er.entita.find((e) => k(e.nome) === k(p.entita))?.identificatoreEsterno?.some((x) => k(x) === k(r.nome));
      logici.push({ tipo: 'partecipazione', da: id, a: ent, testo: p.ruolo ? `${card} ${p.ruolo}` : card, idEsterno: !!ext });
      // per dagre basta un arco per coppia; il primo partecipante sta a sinistra del rombo
      if (!coppie.has(ent)) {
        coppie.add(ent);
        if (j === 0) g.setEdge(ent, id, { minlen: 1 }, `${ent}-${id}`);
        else g.setEdge(id, ent, { minlen: 1 }, `${id}-${ent}`);
      }
    });
  });

  (er.generalizzazioni ?? []).forEach((gen, i) => {
    const padre = idEntita.get(k(gen.padre));
    if (!padre) return;
    const id = `g${i}`;
    aggiungi(id, 'giunzione', '', []);
    nodi.get(id)!.copertura = gen.copertura?.replace(/\s+/g, '');
    g.setEdge(padre, id, { minlen: 1 }, `${padre}-${id}`);
    logici.push({ tipo: 'padre', da: id, a: padre });
    gen.figlie.forEach((f) => {
      const fid = idEntita.get(k(f));
      if (!fid) return;
      g.setEdge(id, fid, { minlen: 1 }, `${id}-${fid}`);
      logici.push({ tipo: 'figlia', da: id, a: fid });
    });
  });

  dagre.layout(g);

  let larghezza = 0;
  let altezza = 0;
  for (const n of nodi.values()) {
    const d = g.node(n.id);
    n.cx = d.x;
    n.cy = d.y;
    n.attributi = posizionaAttributi(n, n.pettine);
    n.box = { x: d.x - d.width / 2, y: d.y - d.height / 2, w: d.width, h: d.height };
    larghezza = Math.max(larghezza, n.box.x + n.box.w);
    altezza = Math.max(altezza, n.box.y + n.box.h);
  }

  // --- porte: ogni arco si aggancia al lato sinistro o destro della figura ---
  interface Porta {
    arco: number;
    altroY: number;
    offset: number;
  }
  const lati = new Map<string, Porta[]>(); // `${nodo}|${lato}`
  const lato = (da: NodoER, verso: NodoER): 1 | -1 => (verso.cx >= da.cx ? 1 : -1);
  const registra = (nodo: NodoER, l: 1 | -1, arco: number, altroY: number) => {
    const key = `${nodo.id}|${l}`;
    const lista = lati.get(key) ?? [];
    lista.push({ arco, altroY, offset: 0 });
    lati.set(key, lista);
  };
  logici.forEach((a, i) => {
    const da = nodi.get(a.da)!;
    const ad = nodi.get(a.a)!;
    registra(da, lato(da, ad), i, ad.cy);
    registra(ad, lato(ad, da), i, da.cy);
  });
  const portePerLato = new Map<string, number>();
  for (const [key, lista] of lati) {
    const nodo = nodi.get(key.split('|')[0])!;
    lista.sort((p, q) => p.altroY - q.altroY || p.arco - q.arco);
    portePerLato.set(key, lista.length);
    const n = lista.length;
    let passo = 0;
    if (nodo.tipo === 'entita') passo = n > 1 ? Math.min(PASSO_PORTE, (nodo.h - 12) / (n - 1)) : 0;
    else if (nodo.tipo === 'relazione') passo = n > 1 ? Math.min(14, (nodo.h - 16) / (n - 1)) : 0;
    lista.forEach((p, i) => (p.offset = (i - (n - 1) / 2) * passo));
  }
  const portaDi = (nodo: NodoER, l: 1 | -1, arco: number) => lati.get(`${nodo.id}|${l}`)!.find((p) => p.arco === arco)!.offset;

  const puntoPorta = (n: NodoER, l: 1 | -1, offset: number): Punto => {
    if (n.tipo === 'giunzione') return { x: n.cx, y: n.cy };
    if (n.tipo === 'entita') return { x: n.cx + (l * n.w) / 2, y: n.cy + offset };
    // rombo: punto sul bordo, rientrando dal vertice
    const rientro = (Math.abs(offset) / (n.h / 2)) * (n.w / 2);
    return { x: n.cx + l * (n.w / 2 - rientro), y: n.cy + offset };
  };
  const uscita = (n: NodoER, l: 1 | -1, p: Punto): Punto => {
    if (n.tipo === 'giunzione') return { x: n.cx + l * 12, y: n.cy };
    const bordoBox = l > 0 ? n.box.x + n.box.w : n.box.x;
    return { x: bordoBox + l * 4, y: p.y };
  };

  const archi: ArcoER[] = logici.map((a, i) => {
    const da = nodi.get(a.da)!;
    const ad = nodi.get(a.a)!;
    const lDa = lato(da, ad);
    const lA = lato(ad, da);
    const oDa = portaDi(da, lDa, i);
    const oA = portaDi(ad, lA, i);
    const pDa = puntoPorta(da, lDa, oDa);
    const pA = puntoPorta(ad, lA, oA);
    const uDa = uscita(da, lDa, pDa);
    const uA = uscita(ad, lA, pA);

    const e = g.edge(a.da, a.a, `${a.da}-${a.a}`);
    const inverso = e ? null : g.edge(a.a, a.da, `${a.a}-${a.da}`);
    let interni: Punto[] = (e ?? inverso)?.points?.slice(1, -1).map((p: Punto) => ({ x: p.x, y: p.y })) ?? [];
    if (inverso) interni = interni.reverse();
    // archi paralleli (relazioni ricorsive): sposta anche i punti intermedi
    const spost = (oDa + oA) / 2;
    const minX = Math.min(uDa.x, uA.x) + 8;
    const maxX = Math.max(uDa.x, uA.x) - 8;
    interni = interni.filter((p) => p.x > minX && p.x < maxX).map((p) => ({ x: p.x, y: p.y + spost }));

    const punti = [pDa, uDa, ...interni, uA, pA];
    const arco: ArcoER = { tipo: a.tipo, punti };
    if (a.testo) {
      // cardinalità sopra il tratto orizzontale vicino all'entità
      arco.etichetta = { testo: a.testo, x: pA.x + lA * 7, y: pA.y - 8, ancora: lA > 0 ? 'start' : 'end' };
    }
    if (a.idEsterno) arco.identificatoreEsterno = { x: pA.x + lA * 10, y: pA.y };
    return arco;
  });

  return {
    layout: {
      nodi: [...nodi.values()].map(({ pettine: _p, ...n }) => n),
      archi,
      larghezza: larghezza + 24,
      altezza: altezza + 24,
    },
    portePerLato,
  };
}
