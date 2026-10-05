// Viste del modello ER e del modello logico (usate sia a schermo intero sia nel pannello laterale).
import { h, sostituisci } from './dom';
import { creaDiagramma } from './panZoom';
import { stato } from '../app/stato';
import { calcolaLayoutER } from '../diagram/erLayout';
import { svgER } from '../diagram/erRender';
import { calcolaLayoutLogico } from '../diagram/logicalLayout';
import { htmlSchemaTestuale, svgLogico } from '../diagram/logicalRender';

export interface Vista {
  elemento: HTMLElement;
  aggiorna(): void;
}

function legendaER(): HTMLElement {
  return h(
    'div',
    { class: 'legenda' },
    h('div', {}, h('span', { class: 'leg-svg', html: '<svg viewBox="0 0 38 24" aria-hidden="true"><rect x="2" y="4" width="34" height="16" class="er-entita"/></svg>' }), ' Entità'),
    h('div', {}, h('span', { class: 'leg-svg', html: '<svg viewBox="0 0 38 24" aria-hidden="true"><polygon points="19,2 36,12 19,22 2,12" class="er-rombo"/></svg>' }), ' Relazione'),
    h('div', {}, h('span', { class: 'leg-svg', html: '<svg viewBox="0 0 38 24" aria-hidden="true"><line x1="4" y1="12" x2="26" y2="12" class="er-linea-attr"/><circle cx="30" cy="12" r="4.5" class="er-attr"/></svg>' }), ' Attributo'),
    h('div', {}, h('span', { class: 'leg-svg', html: '<svg viewBox="0 0 38 24" aria-hidden="true"><line x1="4" y1="12" x2="26" y2="12" class="er-linea-attr"/><circle cx="30" cy="12" r="4.5" class="er-chiave"/></svg>' }), ' Identificatore'),
    h('div', {}, h('code', {}, '(min,max)'), ' cardinalità: (0,1) opzionale, (1,1) obbligatoria, (0,N)/(1,N) multipla'),
    h('div', {}, h('span', { class: 'leg-svg', html: '<svg viewBox="0 0 38 24" aria-hidden="true"><line x1="2" y1="12" x2="34" y2="12" class="er-linea er-gen" marker-end="url(#leg-freccia)"/><defs><marker id="leg-freccia" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="er-freccia"/></marker></defs></svg>' }), ' Generalizzazione verso il padre: (t/p, e/s) = totale/parziale, esclusiva/sovrapposta'),
  );
}

export function creaVistaER(compatta = false): Vista {
  const diag = creaDiagramma('Diagramma Entità-Relazione', 'svg-er');
  let attributi = true;
  let chiave = '';
  const btnAttr = h('button', { type: 'button', class: 'btn btn-piccolo', 'aria-pressed': 'true' }, 'Attributi');
  const legenda = legendaER();
  legenda.hidden = true;
  const btnLeg = h('button', { type: 'button', class: 'btn btn-piccolo', 'aria-expanded': 'false' }, 'Legenda');
  btnLeg.addEventListener('click', () => {
    legenda.hidden = !legenda.hidden;
    btnLeg.setAttribute('aria-expanded', String(!legenda.hidden));
  });
  const elemento = h('div', { class: `vista-modello ${compatta ? 'compatta' : ''}` }, h('div', { class: 'barra-strumenti' }, btnAttr, btnLeg), legenda, diag.elemento);

  const disegna = () => {
    const sc = stato.corrente;
    const k = `${sc?.id}|${attributi}`;
    if (k === chiave) return;
    chiave = k;
    if (!sc) {
      diag.imposta('', 1, 1);
      return;
    }
    const l = calcolaLayoutER(sc.dati.er, attributi);
    diag.imposta(svgER(l), l.larghezza, l.altezza);
  };
  btnAttr.addEventListener('click', () => {
    attributi = !attributi;
    btnAttr.setAttribute('aria-pressed', String(attributi));
    disegna();
  });
  return {
    elemento,
    aggiorna: disegna,
  };
}

export function creaVistaLogico(compatta = false, modoIniziale: 'diagramma' | 'testo' = 'diagramma'): Vista {
  const diag = creaDiagramma('Diagramma del modello logico', 'svg-logico');
  const testo = h('div', { class: 'schema-testuale' });
  let modo = modoIniziale;
  let chiave = '';
  const btnD = h('button', { type: 'button', class: 'segmento' }, 'Diagramma');
  const btnT = h('button', { type: 'button', class: 'segmento' }, 'Testo');
  const seg = h('div', { class: 'segmentato', role: 'group', 'aria-label': 'Modalità di visualizzazione' }, btnD, btnT);
  const elemento = h('div', { class: `vista-modello ${compatta ? 'compatta' : ''}` }, h('div', { class: 'barra-strumenti' }, seg), diag.elemento, testo);

  const disegna = () => {
    btnD.setAttribute('aria-pressed', String(modo === 'diagramma'));
    btnT.setAttribute('aria-pressed', String(modo === 'testo'));
    diag.elemento.hidden = modo !== 'diagramma';
    testo.hidden = modo !== 'testo';
    const sc = stato.corrente;
    const k = `${sc?.id}|${modo}`;
    if (k === chiave) return;
    chiave = k;
    if (!sc) {
      sostituisci(testo);
      return;
    }
    if (modo === 'diagramma') {
      const l = calcolaLayoutLogico(sc.dati.logico);
      diag.imposta(svgLogico(l), l.larghezza, l.altezza);
    } else {
      testo.innerHTML = htmlSchemaTestuale(sc.dati.logico);
    }
  };
  btnD.addEventListener('click', () => {
    modo = 'diagramma';
    disegna();
  });
  btnT.addEventListener('click', () => {
    modo = 'testo';
    disegna();
  });
  return { elemento, aggiorna: disegna };
}
