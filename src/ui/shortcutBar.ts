// Barra di scorciatoie SQL. Su touch, mentre si scrive, si aggancia sopra la
// tastiera virtuale (API visualViewport). I tasti non tolgono il focus all'editor.
import { h } from './dom';
import type { EditorSQL } from '../editor/sqlEditor';

interface Tasto {
  etichetta: string;
  testo: string;
  /** posizione del cursore dopo l'inserimento (default: alla fine) */
  cursore?: number;
  titolo?: string;
  classe?: string;
}

const kw = (p: string): Tasto => ({ etichetta: p, testo: p + ' ', classe: 'kw' });

const TASTI: Tasto[] = [
  kw('SELECT'),
  kw('FROM'),
  kw('WHERE'),
  kw('JOIN'),
  kw('ON'),
  kw('GROUP BY'),
  kw('HAVING'),
  kw('ORDER BY'),
  kw('AS'),
  kw('AND'),
  kw('OR'),
  kw('NOT'),
  kw('IN'),
  kw('EXISTS'),
  kw('DISTINCT'),
  kw('LEFT JOIN'),
  kw('IS NULL'),
  { etichetta: 'COUNT( )', testo: 'COUNT()', cursore: 6, classe: 'kw' },
  { etichetta: '( )', testo: '()', cursore: 1, titolo: 'Parentesi' },
  { etichetta: "' '", testo: "''", cursore: 1, titolo: 'Stringa' },
  { etichetta: '*', testo: '*' },
  { etichetta: '=', testo: ' = ' },
  { etichetta: '<>', testo: ' <> ' },
  { etichetta: '<', testo: ' < ' },
  { etichetta: '>', testo: ' > ' },
  { etichetta: '>=', testo: ' >= ' },
  { etichetta: '%', testo: '%' },
  { etichetta: ',', testo: ', ', titolo: 'Virgola' },
  { etichetta: '.', testo: '.', titolo: 'Punto' },
  { etichetta: ';', testo: ';', titolo: 'Punto e virgola' },
  { etichetta: '⏎', testo: '\n', titolo: 'A capo' },
];

export function creaBarraScorciatoie(editor: () => EditorSQL | null, contenitoreEditor: HTMLElement): HTMLElement {
  const barra = h('div', { class: 'barra-scorciatoie', role: 'toolbar', 'aria-label': 'Scorciatoie SQL' });
  for (const t of TASTI) {
    const b = h('button', { type: 'button', class: `tasto ${t.classe ?? ''}`, title: t.titolo ?? t.etichetta, 'aria-label': t.titolo ?? t.etichetta }, t.etichetta);
    // impedisce che il tocco tolga il focus all'editor (e chiuda la tastiera)
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => editor()?.inserisci(t.testo, t.cursore));
    barra.appendChild(b);
  }
  const posto = h('div', { class: 'posto-barra' }, barra);

  // aggancio sopra la tastiera virtuale
  const vv = window.visualViewport;
  const touch = window.matchMedia('(pointer: coarse)');
  let focus = false;
  const aggiorna = () => {
    const tastiera = vv ? window.innerHeight - vv.height > 120 : false;
    if (focus && touch.matches && tastiera && vv) {
      posto.style.minHeight = `${barra.offsetHeight}px`;
      barra.classList.add('flottante');
      barra.style.top = `${vv.offsetTop + vv.height - barra.offsetHeight}px`;
      barra.style.left = `${vv.offsetLeft}px`;
      barra.style.width = `${vv.width}px`;
    } else {
      barra.classList.remove('flottante');
      barra.style.top = barra.style.left = barra.style.width = '';
      posto.style.minHeight = '';
    }
  };
  contenitoreEditor.addEventListener('focusin', () => {
    focus = true;
    setTimeout(aggiorna, 300);
  });
  contenitoreEditor.addEventListener('focusout', () => {
    focus = false;
    setTimeout(aggiorna, 50);
  });
  vv?.addEventListener('resize', aggiorna);
  vv?.addEventListener('scroll', aggiorna);
  return posto;
}
