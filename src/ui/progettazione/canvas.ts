// Area di disegno degli editor della Progettazione: gestisce pan, zoom (pinch e rotellina), trascinamento
// degli elementi, rettangolo di selezione, tocco, doppio tocco, pressione prolungata e clic destro.
// Cosa fare con ogni gesto lo decide l'editor (ER o logico) tramite le callback.
import { h } from '../dom';
import type { Punto, Rettangolo } from '../../diagram/geometry';

export type ModoGesto = 'sposta' | 'pan' | 'rettangolo' | 'collega' | 'nessuno';

export interface InfoPuntatore {
  punto: Punto; // coordinate del diagramma
  client: Punto;
  tocco: boolean;
  maiusc: boolean;
  meta: boolean;
}

export interface CallbackCanvas {
  /** markup SVG del contenuto e riquadro occupato (per «adatta») */
  disegna(): { markup: string; box: Rettangolo };
  /** inizio di un trascinamento: l'editor sceglie cosa fare */
  inizio(info: InfoPuntatore): ModoGesto;
  /** spostamento durante «sposta» (delta in coordinate del diagramma) o «collega» (punto corrente) */
  muovi(modo: ModoGesto, info: InfoPuntatore, dx: number, dy: number): void;
  fine(modo: ModoGesto, info: InfoPuntatore, rettangolo: Rettangolo | null): void;
  tocco(info: InfoPuntatore): void;
  doppioTocco(info: InfoPuntatore): void;
  menu(info: InfoPuntatore): void;
}

const MIN = 0.2;
const MAX = 3;
const SOGLIA_TOUCH = 10;
const SOGLIA_MOUSE = 4;
const PRESSIONE_PROLUNGATA = 520;

export interface Canvas {
  elemento: HTMLElement;
  svg: SVGSVGElement;
  /** ridisegna (al prossimo fotogramma) */
  aggiorna(): void;
  adatta(): void;
  zoom(fattore: number): void;
  /** markup aggiuntivo (linea di collegamento, rettangolo di selezione) */
  sovrapposizione(markup: string): void;
  vistaCentrale(): Punto;
}

export function creaCanvas(etichetta: string, cb: CallbackCanvas): Canvas {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'diagramma-svg pg-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', etichetta);
  const g = document.createElementNS(ns, 'g');
  const contenuto = document.createElementNS(ns, 'g');
  const sopra = document.createElementNS(ns, 'g');
  g.append(contenuto, sopra);
  svg.appendChild(g);
  const area = h('div', { class: 'diagramma-area pg-area', tabindex: '0' }, svg as unknown as Node);
  const tastoZoom = (testo: string, titolo: string, azione: () => void) => {
    const b = h('button', { type: 'button', class: 'btn-icona', title: titolo, 'aria-label': titolo }, testo);
    b.addEventListener('click', azione);
    return b;
  };
  const comandi = h(
    'div',
    { class: 'diagramma-comandi' },
    tastoZoom('+', 'Ingrandisci', () => zoomCentro(1.25)),
    tastoZoom('−', 'Riduci', () => zoomCentro(0.8)),
    tastoZoom('⤢', 'Adatta allo schermo', () => {
      ridisegna();
      adatta();
    }),
  );
  const elemento = h('div', { class: 'diagramma pg-diagramma' }, area, comandi);

  let t = { x: 40, y: 40, k: 1 };
  let ultimoBox: Rettangolo = { x: 0, y: 0, w: 400, h: 300 };
  let primoDisegno = true;
  let richiesto = false;

  const applica = () => g.setAttribute('transform', `translate(${t.x.toFixed(1)},${t.y.toFixed(1)}) scale(${t.k.toFixed(4)})`);
  applica();

  const ridisegna = () => {
    richiesto = false;
    const { markup, box } = cb.disegna();
    contenuto.innerHTML = markup;
    ultimoBox = box;
    if (primoDisegno && area.getBoundingClientRect().width > 10) {
      primoDisegno = false;
      adatta();
    }
  };
  const aggiorna = () => {
    if (richiesto) return;
    richiesto = true;
    requestAnimationFrame(ridisegna);
  };

  const rect = () => area.getBoundingClientRect();
  const aDiagramma = (cx: number, cy: number): Punto => {
    const r = rect();
    return { x: (cx - r.left - t.x) / t.k, y: (cy - r.top - t.y) / t.k };
  };
  const zoomIn = (fattore: number, cx: number, cy: number) => {
    const k = Math.min(MAX, Math.max(MIN, t.k * fattore));
    const f = k / t.k;
    t = { k, x: cx - (cx - t.x) * f, y: cy - (cy - t.y) * f };
    applica();
  };
  const zoomCentro = (fattore: number) => {
    const r = rect();
    zoomIn(fattore, r.width / 2, r.height / 2);
  };
  const adatta = () => {
    const r = rect();
    if (r.width < 10 || r.height < 10) {
      primoDisegno = true; // area nascosta: si adatta al primo disegno visibile
      return;
    }
    const m = 24;
    const b = ultimoBox;
    const k = Math.max(MIN, Math.min(1.4, (r.width - 2 * m) / Math.max(b.w, 1), (r.height - 2 * m) / Math.max(b.h, 1)));
    t = { k, x: (r.width - b.w * k) / 2 - b.x * k, y: (r.height - b.h * k) / 2 - b.y * k };
    applica();
  };

  // ---------- gesti ----------
  const puntatori = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; mx: number; my: number } | null = null;
  let modo: ModoGesto = 'nessuno';
  let inizio: { client: Punto; punto: Punto; tempo: number; id: number } | null = null;
  let ultimo: Punto | null = null;
  let mosso = false;
  let timerPressione: ReturnType<typeof setTimeout> | null = null;
  let ultimoTocco: { tempo: number; client: Punto } | null = null;
  let info0: InfoPuntatore | null = null;

  const info = (e: PointerEvent | MouseEvent, tocco: boolean): InfoPuntatore => ({
    punto: aDiagramma(e.clientX, e.clientY),
    client: { x: e.clientX, y: e.clientY },
    tocco,
    maiusc: e.shiftKey,
    meta: e.metaKey || e.ctrlKey,
  });
  const fermaPressione = () => {
    if (timerPressione) clearTimeout(timerPressione);
    timerPressione = null;
  };
  const rettangoloSelezione = (a: Punto, b: Punto): Rettangolo => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  area.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    area.setPointerCapture(e.pointerId);
    const r = rect();
    puntatori.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (puntatori.size === 2) {
      // secondo dito: si interrompe il gesto in corso e si passa a pan/pinch
      fermaPressione();
      if (modo !== 'nessuno' && modo !== 'pan' && info0) cb.fine(modo, info0, null);
      modo = 'nessuno';
      sopra.innerHTML = '';
      inizio = null;
      const [a, b] = [...puntatori.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (puntatori.size > 2) return;
    const tocco = e.pointerType !== 'mouse';
    info0 = info(e, tocco);
    inizio = { client: info0.client, punto: info0.punto, tempo: Date.now(), id: e.pointerId };
    ultimo = info0.punto;
    mosso = false;
    modo = 'nessuno';
    if (tocco) {
      timerPressione = setTimeout(() => {
        timerPressione = null;
        if (!mosso && inizio && info0) {
          inizio = null;
          modo = 'nessuno';
          cb.menu(info0);
        }
      }, PRESSIONE_PROLUNGATA);
    }
  });

  area.addEventListener('pointermove', (e) => {
    const prec = puntatori.get(e.pointerId);
    if (!prec) return;
    const r = rect();
    const p = { x: e.clientX - r.left, y: e.clientY - r.top };
    puntatori.set(e.pointerId, p);
    if (puntatori.size >= 2 && pinch) {
      const [a, b] = [...puntatori.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      t.x += mx - pinch.mx;
      t.y += my - pinch.my;
      if (pinch.dist > 0) zoomIn(dist / pinch.dist, mx, my);
      else applica();
      pinch = { dist, mx, my };
      return;
    }
    if (!inizio || e.pointerId !== inizio.id) return;
    const tocco = e.pointerType !== 'mouse';
    const corrente = info(e, tocco);
    if (!mosso) {
      const soglia = tocco ? SOGLIA_TOUCH : SOGLIA_MOUSE;
      if (Math.hypot(corrente.client.x - inizio.client.x, corrente.client.y - inizio.client.y) < soglia) return;
      mosso = true;
      fermaPressione();
      modo = cb.inizio({ ...info0!, maiusc: corrente.maiusc || info0!.maiusc });
    }
    if (modo === 'pan') {
      t.x += p.x - prec.x;
      t.y += p.y - prec.y;
      applica();
    } else if (modo === 'sposta' || modo === 'collega') {
      cb.muovi(modo, corrente, corrente.punto.x - ultimo!.x, corrente.punto.y - ultimo!.y);
    } else if (modo === 'rettangolo') {
      const rr = rettangoloSelezione(inizio.punto, corrente.punto);
      sopra.innerHTML = `<rect x="${rr.x}" y="${rr.y}" width="${rr.w}" height="${rr.h}" class="pg-rettangolo"/>`;
    }
    ultimo = corrente.punto;
  });

  const termina = (e: PointerEvent, annullato: boolean) => {
    puntatori.delete(e.pointerId);
    if (puntatori.size < 2) pinch = null;
    fermaPressione();
    if (!inizio || e.pointerId !== inizio.id) return;
    const tocco = e.pointerType !== 'mouse';
    const corrente = info(e, tocco);
    const iniz = inizio;
    inizio = null;
    if (!mosso) {
      if (annullato) return;
      // tocco semplice o doppio
      const ora = Date.now();
      if (ultimoTocco && ora - ultimoTocco.tempo < 330 && Math.hypot(corrente.client.x - ultimoTocco.client.x, corrente.client.y - ultimoTocco.client.y) < 24) {
        ultimoTocco = null;
        cb.doppioTocco(corrente);
      } else {
        ultimoTocco = { tempo: ora, client: corrente.client };
        cb.tocco(corrente);
      }
      return;
    }
    const rr = modo === 'rettangolo' ? rettangoloSelezione(iniz.punto, corrente.punto) : null;
    sopra.innerHTML = '';
    const m = modo;
    modo = 'nessuno';
    if (m !== 'pan' && m !== 'nessuno') cb.fine(m, corrente, rr);
  };
  area.addEventListener('pointerup', (e) => termina(e, false));
  area.addEventListener('pointercancel', (e) => termina(e, true));

  area.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    fermaPressione();
    cb.menu(info(e, false));
  });
  area.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = rect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomIn(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    area.addEventListener(ev, (e) => e.preventDefault(), { passive: false } as AddEventListenerOptions);
  }
  new ResizeObserver(() => {
    if (primoDisegno) aggiorna();
  }).observe(area);

  return {
    elemento,
    svg,
    aggiorna,
    adatta: () => {
      ridisegna();
      adatta();
    },
    zoom: (fattore) => zoomCentro(fattore),
    sovrapposizione(markup) {
      sopra.innerHTML = markup;
    },
    vistaCentrale() {
      const r = rect();
      return aDiagramma(r.left + r.width / 2, r.top + r.height / 2);
    },
  };
}
