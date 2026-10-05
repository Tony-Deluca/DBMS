// Sezione «Progettazione»: progetti, pannelli affiancati (traccia, ER, ER ristrutturato, note, logico),
// Presentazione, Copia per l'IA, esportazione e importazione.
import { h, sostituisci, apriDialogo, conferma, toast } from '../dom';
import { progettazione } from '../../progettazione/stato';
import { creaEditorER, type EditorSchema } from './editorER';
import { creaEditorLogico, htmlNotazione } from './editorLogico';
import { apriMenu, pulsante } from './comuni';
import { testoPerIA } from '../../progettazione/testoIA';
import { progettoEsempio } from '../../progettazione/esempio';
import { nuovoId } from '../../storage/idb';
import { nomeFileSicuro } from '../../progettazione/esporta';
import type { Pannello, Progetto } from '../../progettazione/modello';

const NOMI_PANNELLI: Record<Pannello, string> = {
  traccia: 'Traccia',
  er: 'Schema ER',
  erR: 'ER ristrutturato',
  note: 'Note',
  logico: 'Schema logico',
};
const ORDINE: Pannello[] = ['traccia', 'er', 'erR', 'note', 'logico'];
const LARGO = '(min-width: 1024px)';

async function copia(testo: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch {
    return false;
  }
}

function scaricaTesto(nome: string, testo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([testo], { type: tipo }));
  const a = h('a', { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function areaTesto(aria: string, segnaposto: string, leggi: (p: Progetto) => string, scrivi: (p: Progetto, v: string) => void): { elemento: HTMLTextAreaElement; aggiorna(): void } {
  const t = h('textarea', {
    class: 'pg-area-testo',
    'aria-label': aria,
    placeholder: segnaposto,
    autocorrect: 'off',
    autocapitalize: 'sentences',
    spellcheck: 'false',
  }) as HTMLTextAreaElement;
  t.addEventListener('input', () => progettazione.modificaTesto((p) => scrivi(p, t.value)));
  t.addEventListener('keydown', (e) => e.stopPropagation());
  return {
    elemento: t,
    aggiorna() {
      const p = progettazione.corrente;
      if (p && document.activeElement !== t) t.value = leggi(p);
    },
  };
}

export function creaVistaProgettazione(): { elemento: HTMLElement; aggiorna(): void } {
  let ultimoEditor: EditorSchema | null = null;
  const alUso = (e: EditorSchema) => (ultimoEditor = e);
  const edER = creaEditorER('er', alUso);
  const edERR = creaEditorER('erRistrutturato', alUso);
  const edLog = creaEditorLogico(alUso);

  const traccia = areaTesto('Traccia dell\'esercizio', 'Incolla qui il testo dell\'esercizio (le specifiche).', (p) => p.traccia, (p, v) => (p.traccia = v));
  const note = areaTesto('Note sulla ristrutturazione', 'Scrivi le scelte fatte, es. «generalizzazione accorpata nel padre», «Telefono multivalore → entità TELEFONO».', (p) => p.noteRistrutturazione, (p, v) => (p.noteRistrutturazione = v));

  // contenuti dei pannelli (un solo elemento DOM per tipo, spostato tra i pannelli)
  const vuotoRistr = h(
    'div',
    { class: 'pg-vuoto' },
    h('h3', {}, 'Ristrutturazione dello schema ER'),
    h('p', {}, 'Crea una copia dello schema ER da modificare: elimina generalizzazioni, attributi multivalore e composti, scegli gli identificatori principali. L\'originale resta intatto, così si vedono entrambi i passaggi.'),
    pulsante('Crea copia per la ristrutturazione', 'Crea copia per la ristrutturazione', () => progettazione.creaCopiaRistrutturazione(), 'btn btn-primario'),
  );
  const pannelloRistr = h('div', { class: 'pg-contenuto-ristr' });
  const contenuti: Record<Pannello, HTMLElement> = {
    traccia: h('div', { class: 'pg-contenuto-testo' }, h('div', { class: 'pg-barra pg-testa-testo' }, h('h3', { class: 'pg-titolo-testo' }, 'Traccia')), traccia.elemento),
    er: edER.elemento,
    erR: pannelloRistr,
    note: h('div', { class: 'pg-contenuto-testo' }, h('div', { class: 'pg-barra pg-testa-testo' }, h('h3', { class: 'pg-titolo-testo' }, 'Note sulla ristrutturazione')), note.elemento),
    logico: edLog.elemento,
  };
  const aggiornaRistr = () => {
    const p = progettazione.corrente;
    if (p?.erRistrutturato) {
      if (!pannelloRistr.contains(edERR.elemento)) sostituisci(pannelloRistr, edERR.elemento);
    } else if (!pannelloRistr.contains(vuotoRistr)) sostituisci(pannelloRistr, vuotoRistr);
  };

  // ---------- barra dei progetti ----------
  const selProgetto = h('select', { class: 'pg-sel-progetto', 'aria-label': 'Progetto aperto' }) as HTMLSelectElement;
  selProgetto.addEventListener('change', () => progettazione.apri(selProgetto.value));
  const btnNuovo = pulsante('+ Nuovo', 'Nuovo progetto', async () => {
    await progettazione.nuovo();
    toast('Nuovo progetto creato', 'ok');
  }, 'btn');
  const btnProgetto = pulsante('Progetto ▾', 'Gestione del progetto', () => {
    const r = btnProgetto.getBoundingClientRect();
    const p = progettazione.corrente;
    if (!p) return;
    const artifact = !!import.meta.env.VITE_ARTIFACT;
    apriMenu(
      [
        { etichetta: 'Rinomina', azione: () => rinomina(p) },
        { etichetta: 'Duplica', azione: () => void progettazione.duplica(p.id).then(() => toast('Progetto duplicato', 'ok')) },
        ...(artifact ? [] : [{ etichetta: 'Esporta come file JSON', azione: () => scaricaTesto(nomeFileSicuro(p.nome, 'json'), progettazione.esportaJson(p), 'application/json') }]),
        { etichetta: 'Copia JSON negli appunti', azione: async () => toast((await copia(progettazione.esportaJson(p))) ? 'JSON del progetto copiato' : 'Copia non riuscita', 'ok') },
        { etichetta: 'Importa progetto (file o testo)…', azione: importa },
        { etichetta: 'Aggiungi il progetto d\'esempio', azione: () => void progettazione.aggiungi(progettoEsempio(nuovoId())) },
        ...(p.erRistrutturato ? [{ etichetta: 'Rifai la copia per la ristrutturazione', azione: rifaiCopia }] : []),
        { etichetta: 'Elimina progetto', pericolosa: true, azione: () => eliminaProgetto(p) },
      ],
      r.left,
      r.bottom + 4,
      p.nome,
    );
  }, 'btn');
  const btnIA = pulsante('Copia per l\'IA', 'Copia una descrizione testuale completa del progetto', copiaPerIA, 'btn btn-primario');
  const btnPresentazione = pulsante('Presentazione', 'Mostra solo gli schemi, puliti per lo screenshot', apriPresentazione, 'btn');
  const barra = h('div', { class: 'pg-testata' }, selProgetto, btnNuovo, btnProgetto, h('span', { class: 'pg-spazio' }), btnIA, btnPresentazione);

  async function rinomina(p: Progetto) {
    const campo = h('input', { type: 'text', class: 'campo', value: p.nome, 'aria-label': 'Nuovo nome', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' }) as HTMLInputElement;
    campo.value = p.nome;
    const ok = h('button', { type: 'button', class: 'btn btn-primario' }, 'Salva');
    const chiudi = apriDialogo('Rinomina progetto', h('form', { class: 'rinomina' }, campo, ok), { classe: 'dialogo-piccolo' });
    const salva = async () => {
      await progettazione.rinomina(p.id, campo.value);
      chiudi();
    };
    ok.addEventListener('click', () => void salva());
    campo.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), void salva()));
    setTimeout(() => campo.select(), 50);
  }

  async function eliminaProgetto(p: Progetto) {
    if (await conferma('Eliminare il progetto?', `«${p.nome}» verrà eliminato da questo browser. Esportalo prima se vuoi conservarlo.`, 'Elimina', true)) {
      await progettazione.elimina(p.id);
      toast('Progetto eliminato', 'info');
    }
  }

  async function rifaiCopia() {
    if (await conferma('Rifare la copia?', 'Lo schema ristrutturato attuale verrà sostituito da una nuova copia dello schema ER (puoi annullare con ↶).', 'Rifai la copia', true)) {
      progettazione.creaCopiaRistrutturazione();
    }
  }

  function importa() {
    const area = h('textarea', { class: 'area-json', rows: '6', placeholder: 'Incolla qui il JSON di un progetto esportato…', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'JSON del progetto' }) as HTMLTextAreaElement;
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'nascosto' }) as HTMLInputElement;
    const esito = h('div', { 'aria-live': 'polite' });
    let chiudi = () => undefined as void;
    const esegui = async (testo: string) => {
      const errore = await progettazione.importaJson(testo);
      if (errore) sostituisci(esito, h('p', { class: 'messaggio messaggio-errore' }, errore));
      else {
        toast('Progetto importato', 'ok');
        chiudi();
      }
    };
    file.addEventListener('change', async () => file.files?.[0] && (await esegui(await file.files[0].text())));
    chiudi = apriDialogo(
      'Importa progetto',
      h('div', {}, area, h('div', { class: 'riga-pulsanti' }, pulsante('Importa testo', 'Importa il testo incollato', () => void esegui(area.value), 'btn btn-primario'), pulsante('Scegli file .json', 'Scegli file', () => file.click(), 'btn'), file), esito),
      { classe: 'dialogo-grande' },
    );
  }

  async function copiaPerIA() {
    const p = progettazione.corrente;
    if (!p) return;
    const testo = testoPerIA(p);
    const ok = await copia(testo);
    const area = h('textarea', { class: 'pg-testo-ia', readonly: true, rows: '18', 'aria-label': 'Descrizione del progetto per l\'IA' }) as HTMLTextAreaElement;
    area.value = testo;
    const ricopia = pulsante('Copia di nuovo', 'Copia negli appunti', async () => {
      const r = await copia(testo);
      if (!r) {
        area.focus();
        area.select();
      }
      toast(r ? 'Testo copiato' : 'Seleziona il testo e copialo a mano', r ? 'ok' : 'errore');
    }, 'btn btn-primario');
    apriDialogo(
      'Copia per l\'IA',
      h(
        'div',
        {},
        h('p', { class: ok ? 'messaggio messaggio-ok' : 'messaggio' }, ok ? '✓ Copiato negli appunti. Incollalo nella chat con l\'IA insieme alla richiesta di correzione.' : 'Copia automatica non consentita: usa il pulsante qui sotto oppure seleziona il testo.'),
        area,
        h('div', { class: 'riga-pulsanti' }, ricopia),
      ),
      { classe: 'dialogo-grande' },
    );
  }

  // ---------- presentazione ----------
  function apriPresentazione() {
    const p = progettazione.corrente;
    if (!p) return;
    const radice = document.documentElement;
    const temaPrima = radice.getAttribute('data-theme');
    radice.setAttribute('data-theme', 'light');
    const figura = (titolo: string, svg: string) => h('figure', { class: 'pres-figura' }, h('figcaption', {}, titolo), h('div', { class: 'pres-svg', html: svg }));
    const testo = (titolo: string, contenuto: string) => h('section', { class: 'pres-sezione' }, h('h2', {}, titolo), h('div', { class: 'pres-testo' }, contenuto));
    const esci = h('button', { type: 'button', class: 'pres-esci', 'aria-label': 'Esci dalla presentazione', title: 'Esci (Esc)' }, '✕');
    const pagina = h(
      'div',
      { class: 'presentazione', role: 'dialog', 'aria-label': 'Presentazione del progetto' },
      esci,
      h(
        'article',
        { class: 'pres-pagina' },
        h('h1', {}, p.nome),
        p.traccia.trim() ? testo('Traccia', p.traccia) : null,
        h('section', { class: 'pres-sezione' }, h('h2', {}, '1. Schema concettuale (ER)'), figura('', edER.svgEsportazione())),
        p.erRistrutturato ? h('section', { class: 'pres-sezione' }, h('h2', {}, '2. Schema ER ristrutturato'), figura('', edERR.svgEsportazione())) : null,
        p.noteRistrutturazione.trim() ? testo('Note sulla ristrutturazione', p.noteRistrutturazione) : null,
        h(
          'section',
          { class: 'pres-sezione' },
          h('h2', {}, `${p.erRistrutturato ? '3' : '2'}. Schema logico relazionale`),
          figura('', edLog.svgEsportazione()),
          h('div', { class: 'pres-notazione', html: htmlNotazione(p.logico) }),
          h('p', { class: 'pres-legenda' }, 'Chiave primaria sottolineata; * = attributo facoltativo (ammette NULL).'),
        ),
      ),
    );
    const chiudi = () => {
      pagina.remove();
      if (temaPrima === null) radice.removeAttribute('data-theme');
      else radice.setAttribute('data-theme', temaPrima);
      document.removeEventListener('keydown', tasti, true);
    };
    const tasti = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        chiudi();
      }
    };
    esci.addEventListener('click', chiudi);
    document.addEventListener('keydown', tasti, true);
    document.body.appendChild(pagina);
  }

  // ---------- pannelli ----------
  const pannelli = [h('section', { class: 'pg-pannello' }), h('section', { class: 'pg-pannello' })];
  const selettori = [0, 1].map((i) => {
    const s = h('select', { class: 'pg-sel-pannello', 'aria-label': i === 0 ? 'Pannello di sinistra' : 'Pannello di destra' }, ORDINE.map((x) => h('option', { value: x }, NOMI_PANNELLI[x]))) as HTMLSelectElement;
    s.addEventListener('change', () => scegliPannello(i as 0 | 1, s.value as Pannello));
    return s;
  });
  const schede = h('div', { class: 'pg-schede', role: 'tablist', 'aria-label': 'Parti del progetto' });
  for (const x of ORDINE) {
    const b = h('button', { type: 'button', role: 'tab', class: 'scheda-pannello', 'data-id': x }, NOMI_PANNELLI[x]);
    b.addEventListener('click', () => scegliPannello(0, x));
    schede.appendChild(b);
  }
  const divisore = h('div', { class: 'divisore pg-divisore', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Ridimensiona i pannelli' });
  const teste = [0, 1].map(() => h('div', { class: 'pg-testa-pannello' }));
  const area = h('div', { class: 'pg-area-pannelli' }, h('div', { class: 'pg-colonna' }, teste[0], pannelli[0]), divisore, h('div', { class: 'pg-colonna pg-colonna-2' }, teste[1], pannelli[1]));

  /** Il selettore del pannello va all'inizio della barra degli strumenti (se c'è), così non occupa una riga in più. */
  function collocaSelettori() {
    for (const i of [0, 1]) {
      const barra = pannelli[i].querySelector<HTMLElement>('.pg-barra');
      if (barra) {
        if (barra.firstElementChild !== selettori[i]) barra.prepend(selettori[i]);
        teste[i].hidden = true;
      } else {
        teste[i].append(selettori[i]);
        teste[i].hidden = false;
      }
    }
  }
  const mq = window.matchMedia(LARGO);

  let quota = 0.5;
  divisore.addEventListener('pointerdown', (e) => divisore.setPointerCapture(e.pointerId));
  divisore.addEventListener('pointermove', (e) => {
    if (!divisore.hasPointerCapture(e.pointerId)) return;
    const r = area.getBoundingClientRect();
    quota = Math.min(0.8, Math.max(0.2, (e.clientX - r.left) / r.width));
    area.style.setProperty('--pg-quota', `${quota * 100}%`);
  });

  function scegliPannello(i: 0 | 1, x: Pannello) {
    const p = progettazione.corrente;
    if (!p) return;
    const altro = (1 - i) as 0 | 1;
    const nuovi: [Pannello, Pannello] = [...p.pannelli] as [Pannello, Pannello];
    if (nuovi[altro] === x) nuovi[altro] = nuovi[i]; // stesso contenuto nei due pannelli: si scambiano
    nuovi[i] = x;
    progettazione.modificaTesto((q) => (q.pannelli = nuovi));
    disponi();
  }

  function disponi() {
    const p = progettazione.corrente;
    if (!p) return;
    const [a, b] = p.pannelli;
    const largo = mq.matches;
    elemento.classList.toggle('stretto', !largo);
    selettori[0].value = a;
    selettori[1].value = b;
    for (const s of schede.querySelectorAll<HTMLButtonElement>('button')) s.setAttribute('aria-selected', String(s.dataset.id === a));
    if (!pannelli[0].contains(contenuti[a])) sostituisci(pannelli[0], contenuti[a]);
    if (largo) {
      if (!pannelli[1].contains(contenuti[b])) sostituisci(pannelli[1], contenuti[b]);
    } else sostituisci(pannelli[1]);
    aggiornaRistr();
    collocaSelettori();
    for (const ed of [edER, edERR, edLog]) if (ed.elemento.isConnected) ed.aggiorna();
  }
  mq.addEventListener('change', disponi);

  const aggiornaElenco = () => {
    sostituisci(selProgetto, progettazione.progetti.map((p) => h('option', { value: p.id, selected: p.id === progettazione.corrente?.id }, p.nome)));
    if (progettazione.corrente) selProgetto.value = progettazione.corrente.id;
  };
  progettazione.on('elenco', aggiornaElenco);
  progettazione.on('progetto', () => {
    aggiornaElenco();
    traccia.aggiorna();
    note.aggiorna();
    disponi();
  });
  progettazione.on('schema', () => {
    if (!elemento.isConnected) return;
    const prima = pannelloRistr.contains(edERR.elemento);
    aggiornaRistr();
    collocaSelettori();
    if (!prima && pannelloRistr.contains(edERR.elemento)) edERR.aggiorna();
  });

  // scorciatoie da tastiera (solo quando la sezione è visibile e non si sta scrivendo)
  document.addEventListener('keydown', (e) => {
    if (!elemento.isConnected || elemento.closest('[hidden]') || document.querySelector('dialog[open], .presentazione')) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) progettazione.ripeti();
      else progettazione.annulla();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      progettazione.ripeti();
      return;
    }
    if (ultimoEditor?.elemento.isConnected && ultimoEditor.tasto(e)) e.preventDefault();
  });

  const elemento = h('div', { class: 'progettazione' }, barra, schede, area);

  return {
    elemento,
    aggiorna() {
      if (!progettazione.caricato) {
        void progettazione.carica();
        return;
      }
      disponi();
    },
  };
}
