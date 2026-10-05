// Pan e zoom per i diagrammi SVG: trascinamento con un dito o col mouse,
// pinch con due dita, rotellina (o pinch del trackpad) e pulsanti.
import { h } from './dom';

export interface Diagramma {
  elemento: HTMLElement;
  /** Imposta il contenuto SVG (markup interno) e le dimensioni naturali. */
  imposta(markup: string, larghezza: number, altezza: number): void;
  adatta(): void;
}

const MIN = 0.15;
const MAX = 4;

export function creaDiagramma(etichetta: string, classeSvg: string): Diagramma {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', `diagramma-svg ${classeSvg}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', etichetta);
  const g = document.createElementNS(ns, 'g');
  svg.appendChild(g);

  const area = h('div', { class: 'diagramma-area' }, svg as unknown as Node);
  let t = { x: 0, y: 0, k: 1 };
  let naturale = { w: 1, h: 1 };
  let toccato = false;

  const applica = () => {
    g.setAttribute('transform', `translate(${t.x.toFixed(1)},${t.y.toFixed(1)}) scale(${t.k.toFixed(4)})`);
  };

  const zoomIn = (fattore: number, cx: number, cy: number) => {
    const k = Math.min(MAX, Math.max(MIN, t.k * fattore));
    const f = k / t.k;
    t = { k, x: cx - (cx - t.x) * f, y: cy - (cy - t.y) * f };
    applica();
  };

  const adatta = () => {
    const r = area.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const m = 12;
    const comandi = 58; // spazio per i pulsanti di zoom a destra
    const k = Math.min(1.25, (r.width - 2 * m - comandi) / naturale.w, (r.height - 2 * m) / naturale.h);
    const kk = Math.max(MIN, k);
    t = { k: kk, x: Math.max(m, (r.width - comandi - naturale.w * kk) / 2), y: Math.max(m, (r.height - naturale.h * kk) / 2) };
    applica();
  };

  const centro = () => {
    const r = area.getBoundingClientRect();
    return { x: r.width / 2, y: r.height / 2 };
  };
  const pulsante = (testo: string, titolo: string, azione: () => void) =>
    h('button', { class: 'btn-icona', type: 'button', title: titolo, 'aria-label': titolo, onclick: azione }, testo);

  const comandi = h(
    'div',
    { class: 'diagramma-comandi' },
    pulsante('+', 'Ingrandisci', () => {
      toccato = true;
      const c = centro();
      zoomIn(1.25, c.x, c.y);
    }),
    pulsante('−', 'Riduci', () => {
      toccato = true;
      const c = centro();
      zoomIn(0.8, c.x, c.y);
    }),
    pulsante('⤢', 'Adatta allo schermo', () => {
      toccato = false;
      adatta();
    }),
  );

  const elemento = h('div', { class: 'diagramma' }, area, comandi);

  // --- puntatori ---
  const puntatori = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; mx: number; my: number } | null = null;

  const locale = (e: PointerEvent | WheelEvent) => {
    const r = area.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  area.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    area.setPointerCapture(e.pointerId);
    puntatori.set(e.pointerId, locale(e));
    toccato = true;
    area.classList.add('trascina');
    if (puntatori.size === 2) {
      const [a, b] = [...puntatori.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  });

  area.addEventListener('pointermove', (e) => {
    const prec = puntatori.get(e.pointerId);
    if (!prec) return;
    const p = locale(e);
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
    } else if (puntatori.size === 1) {
      t.x += p.x - prec.x;
      t.y += p.y - prec.y;
      applica();
    }
  });

  const fine = (e: PointerEvent) => {
    puntatori.delete(e.pointerId);
    if (puntatori.size < 2) pinch = null;
    if (puntatori.size === 0) area.classList.remove('trascina');
  };
  area.addEventListener('pointerup', fine);
  area.addEventListener('pointercancel', fine);
  area.addEventListener('lostpointercapture', fine);

  area.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      toccato = true;
      const p = locale(e);
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // ctrlKey = pinch del trackpad: più sensibile
      const fattore = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015));
      zoomIn(fattore, p.x, p.y);
    },
    { passive: false },
  );

  // Safari (iPad e trackpad Mac): evita che il pinch zoomi l'intera pagina
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    area.addEventListener(ev, (e) => e.preventDefault(), { passive: false } as AddEventListenerOptions);
  }

  // doppio tocco/clic: adatta
  area.addEventListener('dblclick', () => {
    toccato = false;
    adatta();
  });

  new ResizeObserver(() => {
    if (!toccato) adatta();
  }).observe(area);

  return {
    elemento,
    imposta(markup, larghezza, altezza) {
      g.innerHTML = markup;
      naturale = { w: Math.max(1, larghezza), h: Math.max(1, altezza) };
      toccato = false;
      adatta();
    },
    adatta: () => {
      toccato = false;
      adatta();
    },
  };
}
