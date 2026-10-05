// Vista «Dati»: consultazione in sola lettura delle tabelle del database dello scenario.
// Paginata (100 righe per volta), con ricerca e salto da una chiave esterna alla riga referenziata.
import { h, sostituisci } from './dom';
import { stato, on } from '../app/stato';
import { sql } from '../sql/client';
import { formatta } from './resultsTable';
import type { Valore } from '../sql/compare';
import type { ColonnaInfo, Pagina, RiferimentoFK, TabellaInfo } from '../sql/dati';
import type { Vista } from './vistaModelli';

export const RIGHE_PER_PAGINA = 100;

interface Posizione {
  tabella: string;
  pagina: number;
  testo: string;
  filtroFk: FiltroFk | null;
}

interface FiltroFk {
  etichetta: string;
  uguali: { colonna: string; valore: Valore }[];
}

const num = (n: number) => n.toLocaleString('it-IT');

export function creaVistaDati(compatta = false): Vista {
  let elenco: TabellaInfo[] = [];
  let pos: Posizione = { tabella: '', pagina: 0, testo: '', filtroFk: null };
  const storia: Posizione[] = [];
  let sporco = true;
  let sequenza = 0;
  let timerRicerca: ReturnType<typeof setTimeout> | null = null;

  const chips = h('div', { class: 'chips-tabelle', role: 'tablist', 'aria-label': 'Tabelle' });
  const btnIndietro = h('button', { type: 'button', class: 'btn btn-piccolo', hidden: true }, '↩ Indietro');
  const filtroChip = h('div', { class: 'filtro-fk', hidden: true });
  const campo = h('input', {
    type: 'search',
    class: 'campo campo-ricerca',
    placeholder: 'Cerca nelle righe…',
    'aria-label': 'Cerca nelle righe della tabella',
    autocapitalize: 'off',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
  }) as HTMLInputElement;
  const btnPrima = h('button', { type: 'button', class: 'btn-icona', 'aria-label': 'Prima pagina', title: 'Prima pagina' }, '⏮');
  const btnPrec = h('button', { type: 'button', class: 'btn-icona', 'aria-label': 'Pagina precedente', title: 'Pagina precedente' }, '◀');
  const btnSucc = h('button', { type: 'button', class: 'btn-icona', 'aria-label': 'Pagina successiva', title: 'Pagina successiva' }, '▶');
  const btnUltima = h('button', { type: 'button', class: 'btn-icona', 'aria-label': 'Ultima pagina', title: 'Ultima pagina' }, '⏭');
  const info = h('div', { class: 'info-pagina', 'aria-live': 'polite' });
  const paginazione = h('div', { class: 'paginazione' }, btnPrima, btnPrec, info, btnSucc, btnUltima);
  const contenuto = h('div', { class: 'dati-contenuto' });
  const elemento = h(
    'div',
    { class: `vista-modello vista-dati${compatta ? ' compatta' : ''}` },
    chips,
    h('div', { class: 'barra-dati' }, btnIndietro, campo),
    filtroChip,
    paginazione,
    contenuto,
  );

  const tabellaCorrente = () => elenco.find((t) => t.nome === pos.tabella);

  const disegnaChips = () => {
    sostituisci(chips);
    for (const t of elenco) {
      const b = h(
        'button',
        { type: 'button', role: 'tab', class: 'chip-tabella', 'aria-selected': String(t.nome === pos.tabella), title: `${t.nome}: ${t.righe} righe` },
        t.nome,
        h('span', { class: 'conteggio' }, num(t.righe)),
      );
      b.addEventListener('click', () => scegli(t.nome));
      chips.appendChild(b);
    }
  };

  const messaggio = (testo: string, errore = false) =>
    sostituisci(contenuto, h('div', { class: errore ? 'messaggio messaggio-errore' : 'vuoto vuoto-dati' }, testo));

  const intestazione = (c: ColonnaInfo) => {
    const badge: HTMLElement[] = [];
    if (c.pk) badge.push(h('span', { class: 'badge badge-pk', title: 'Chiave primaria' }, 'PK'));
    for (const f of c.fk) badge.push(h('span', { class: 'badge badge-fk', title: `Chiave esterna verso ${f.tabella}(${f.rifColonne.join(', ')})` }, `FK → ${f.tabella}`));
    return h(
      'th',
      { scope: 'col', class: c.pk ? 'th-pk' : '' },
      h('div', { class: `nome-colonna${c.pk ? ' sottolineato' : ''}` }, c.nome),
      h('div', { class: 'tipo-colonna' }, c.tipo || '—', c.nullable ? ' ∅' : ''),
      badge.length ? h('div', { class: 'badge-riga' }, badge) : null,
    );
  };

  const cella = (t: TabellaInfo, c: ColonnaInfo, riga: Valore[]) => {
    const v = riga[t.colonne.indexOf(c)];
    const { testo, classe } = formatta(v);
    const td = document.createElement('td');
    if (classe) td.className = classe;
    if (typeof v === 'number') td.classList.add('cella-num');
    // un valore di chiave esterna è un pulsante che porta alla riga referenziata
    const fk = v !== null ? c.fk[0] : undefined;
    if (fk) {
      const b = h('button', { type: 'button', class: 'valore-fk', title: `Vai a ${fk.tabella}`, 'aria-label': `${testo}: vai alla riga di ${fk.tabella}` }, testo);
      b.addEventListener('click', () => vaiAllaRiga(t, fk, riga));
      td.appendChild(b);
      td.classList.add('cella-fk');
    } else {
      td.textContent = testo;
    }
    return td;
  };

  const disegnaPagina = (t: TabellaInfo, p: Pagina) => {
    const pagine = Math.max(1, Math.ceil(p.totale / RIGHE_PER_PAGINA));
    const da = p.totale === 0 ? 0 : pos.pagina * RIGHE_PER_PAGINA + 1;
    const a = pos.pagina * RIGHE_PER_PAGINA + p.righe.length;
    const filtrata = p.totale !== p.totaleTabella;
    info.textContent = p.totale === 0 ? 'Nessuna riga' : `Righe ${num(da)}–${num(a)} di ${num(p.totale)}${filtrata ? ` (su ${num(p.totaleTabella)})` : ''} · pagina ${pos.pagina + 1}/${pagine}`;
    btnPrima.disabled = btnPrec.disabled = pos.pagina === 0;
    btnSucc.disabled = btnUltima.disabled = pos.pagina >= pagine - 1;

    if (p.totale === 0) {
      messaggio(p.totaleTabella === 0 ? `La tabella «${t.nome}» è vuota.` : 'Nessuna riga corrisponde al filtro.');
      return;
    }
    const corpo = document.createElement('tbody');
    p.righe.forEach((riga, i) => {
      const tr = document.createElement('tr');
      const n = document.createElement('td');
      n.className = 'cella-indice';
      n.textContent = String(pos.pagina * RIGHE_PER_PAGINA + i + 1);
      tr.appendChild(n);
      for (const c of t.colonne) tr.appendChild(cella(t, c, riga));
      corpo.appendChild(tr);
    });
    const tabella = h(
      'table',
      { class: 'tabella-risultati tabella-dati' },
      h('thead', {}, h('tr', {}, h('th', { class: 'cella-indice', scope: 'col' }, '#'), t.colonne.map(intestazione))),
      corpo,
    );
    sostituisci(contenuto, h('div', { class: 'tabella-scroll', tabindex: '0', role: 'region', 'aria-label': `Righe della tabella ${t.nome}` }, tabella));
  };

  const disegnaFiltro = () => {
    btnIndietro.hidden = storia.length === 0;
    if (!pos.filtroFk) {
      filtroChip.hidden = true;
      return;
    }
    filtroChip.hidden = false;
    const x = h('button', { type: 'button', class: 'btn-icona btn-chiudi-filtro', 'aria-label': 'Rimuovi il filtro', title: 'Rimuovi il filtro' }, '✕');
    x.addEventListener('click', () => {
      pos = { ...pos, filtroFk: null, pagina: 0 };
      void carica();
    });
    sostituisci(filtroChip, h('span', { class: 'filtro-testo' }, 'Riga referenziata: ', h('code', {}, pos.filtroFk.etichetta)), x);
  };

  /** Chiede al worker la pagina corrente e la disegna (scarta le risposte superate da richieste più recenti). */
  const carica = async () => {
    const t = tabellaCorrente();
    disegnaChips();
    disegnaFiltro();
    campo.value = pos.testo;
    if (!t) {
      info.textContent = '';
      btnPrima.disabled = btnPrec.disabled = btnSucc.disabled = btnUltima.disabled = true;
      messaggio(stato.corrente ? 'Questo scenario non ha tabelle.' : 'Nessuno scenario caricato.');
      return;
    }
    const mia = ++sequenza;
    try {
      const p = await sql.pagina({ tabella: t.nome, offset: pos.pagina * RIGHE_PER_PAGINA, limite: RIGHE_PER_PAGINA, testo: pos.testo, uguali: pos.filtroFk?.uguali });
      if (mia !== sequenza) return;
      // pagina oltre la fine (es. dopo un filtro): torna all'ultima disponibile
      if (p.righe.length === 0 && p.totale > 0 && pos.pagina > 0) {
        pos = { ...pos, pagina: Math.max(0, Math.ceil(p.totale / RIGHE_PER_PAGINA) - 1) };
        return void carica();
      }
      disegnaPagina(t, p);
    } catch (e) {
      if (mia === sequenza) messaggio((e as Error).message, true);
    }
  };

  const scegli = (nome: string) => {
    storia.length = 0;
    pos = { tabella: nome, pagina: 0, testo: '', filtroFk: null };
    void carica();
  };

  const vaiAllaRiga = (t: TabellaInfo, fk: RiferimentoFK, riga: Valore[]) => {
    const uguali = fk.rifColonne.map((rif, i) => ({ colonna: rif, valore: riga[t.colonne.findIndex((c) => c.nome === fk.colonne[i])] }));
    if (uguali.some((u) => u.valore === null)) return; // chiave composta con un NULL: nessuna riga referenziata
    storia.push({ ...pos });
    pos = {
      tabella: fk.tabella,
      pagina: 0,
      testo: '',
      filtroFk: { etichetta: uguali.map((u) => `${fk.tabella}.${u.colonna} = ${formatta(u.valore).testo}`).join(' AND '), uguali },
    };
    void carica();
    elemento.scrollIntoView?.({ block: 'nearest' });
  };

  btnIndietro.addEventListener('click', () => {
    const prec = storia.pop();
    if (prec) pos = prec;
    void carica();
  });
  const vaiPagina = (n: number) => {
    pos = { ...pos, pagina: Math.max(0, n) };
    void carica();
  };
  btnPrima.addEventListener('click', () => vaiPagina(0));
  btnPrec.addEventListener('click', () => vaiPagina(pos.pagina - 1));
  btnSucc.addEventListener('click', () => vaiPagina(pos.pagina + 1));
  btnUltima.addEventListener('click', () => vaiPagina(Number.MAX_SAFE_INTEGER / RIGHE_PER_PAGINA));
  campo.addEventListener('input', () => {
    if (timerRicerca) clearTimeout(timerRicerca);
    timerRicerca = setTimeout(() => {
      pos = { ...pos, testo: campo.value, pagina: 0 };
      void carica();
    }, 250);
  });

  const ricarica = async () => {
    sporco = false;
    storia.length = 0;
    const mia = ++sequenza;
    if (!stato.corrente || stato.erroreDb) {
      elenco = [];
      pos = { tabella: '', pagina: 0, testo: '', filtroFk: null };
      return void carica();
    }
    try {
      const nuovo = await sql.tabelle();
      if (mia !== sequenza) return;
      elenco = nuovo;
    } catch (e) {
      if (mia === sequenza) messaggio((e as Error).message, true);
      return;
    }
    pos = { tabella: elenco.find((t) => t.nome === pos.tabella)?.nome ?? elenco[0]?.nome ?? '', pagina: 0, testo: '', filtroFk: null };
    void carica();
  };

  // visibile = disegnato e non nascosto (il pannello a scomparsa chiuso ha visibility: hidden)
  const visibile = () => elemento.isConnected && elemento.getClientRects().length > 0 && getComputedStyle(elemento).visibility !== 'hidden';
  on('scenario', () => {
    sporco = true;
    elenco = [];
    sostituisci(chips);
    messaggio('Caricamento dei dati…');
  });
  on('db', () => {
    sporco = true;
    if (visibile()) void ricarica();
  });

  return {
    elemento,
    aggiorna() {
      if (sporco && stato.schemaDb) void ricarica();
      else if (sporco && stato.erroreDb) void ricarica();
    },
  };
}
