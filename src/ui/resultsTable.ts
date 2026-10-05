// Tabella dei risultati: scorrimento orizzontale, intestazione fissa,
// celle che vanno a capo (nessun testo troncato), NULL evidenziati.
import { h } from './dom';
import type { Valore } from '../sql/compare';

const BLOCCO = 200;

function formatta(v: Valore): { testo: string; classe: string } {
  if (v === null) return { testo: 'NULL', classe: 'cella-null' };
  if (typeof v === 'number') {
    return { testo: Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12))), classe: 'cella-num' };
  }
  if (typeof v === 'string') return { testo: v === '' ? '(stringa vuota)' : v, classe: v === '' ? 'cella-vuota' : '' };
  return { testo: `[BLOB ${v.length} byte]`, classe: 'cella-null' };
}

export function tabellaRisultati(colonne: string[], righe: Valore[][], info: { totale: number; troncato: boolean; ms?: number }): HTMLElement {
  const corpo = h('tbody');
  let mostrate = 0;
  const altre = h('button', { type: 'button', class: 'btn btn-piccolo' });

  const aggiungiBlocco = () => {
    const frammento = document.createDocumentFragment();
    const fine = Math.min(righe.length, mostrate + BLOCCO);
    for (let i = mostrate; i < fine; i++) {
      const tr = document.createElement('tr');
      const n = document.createElement('td');
      n.className = 'cella-indice';
      n.textContent = String(i + 1);
      tr.appendChild(n);
      for (const v of righe[i]) {
        const td = document.createElement('td');
        const { testo, classe } = formatta(v);
        td.textContent = testo;
        if (classe) td.className = classe;
        tr.appendChild(td);
      }
      frammento.appendChild(tr);
    }
    corpo.appendChild(frammento);
    mostrate = fine;
    const restano = righe.length - mostrate;
    altre.textContent = `Mostra altre ${Math.min(BLOCCO, restano)} righe (${restano} rimanenti)`;
    altre.hidden = restano <= 0;
  };
  altre.addEventListener('click', aggiungiBlocco);

  const tabella = h(
    'table',
    { class: 'tabella-risultati' },
    h('thead', {}, h('tr', {}, h('th', { class: 'cella-indice', scope: 'col' }, '#'), colonne.map((c) => h('th', { scope: 'col' }, c)))),
    corpo,
  );
  aggiungiBlocco();

  const righeTesto = info.totale === 1 ? '1 riga' : `${info.totale} righe`;
  const colTesto = colonne.length === 1 ? '1 colonna' : `${colonne.length} colonne`;
  return h(
    'div',
    { class: 'risultati' },
    h(
      'div',
      { class: 'risultati-info' },
      `${righeTesto} · ${colTesto}`,
      info.ms !== undefined ? ` · ${info.ms < 1 ? '<1' : Math.round(info.ms)} ms` : '',
      info.troncato ? ` · visualizzate le prime ${righe.length}` : '',
    ),
    info.totale === 0
      ? h('div', { class: 'risultati-vuoto' }, 'Nessuna riga nel risultato.')
      : h('div', { class: 'tabella-scroll', tabindex: '0', role: 'region', 'aria-label': 'Risultato della query' }, tabella),
    altre,
  );
}
