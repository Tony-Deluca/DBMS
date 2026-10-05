import './styles/main.css';
import { h, sostituisci, toast } from './ui/dom';
import { stato, on, type Vista as NomeVista } from './app/stato';
import { apriScenario, assicuraEsempio, caricaScenari, cambiaVista, richiediPersistenza } from './app/azioni';
import { leggiImpostazione } from './storage/idb';
import { creaVistaER, creaVistaLogico } from './ui/vistaModelli';
import { creaVistaEsercizi } from './ui/vistaEsercizi';
import { apriGestioneScenari } from './ui/gestioneScenari';
import { apriGuida } from './ui/guida';
import iconaUrl from './ui/icona.svg?url';

// --- tema ---
type Tema = 'auto' | 'chiaro' | 'scuro';
function leggiTema(): Tema {
  try {
    return (localStorage.getItem('tema') as Tema) || 'auto';
  } catch {
    return 'auto';
  }
}
function applicaTema(t: Tema) {
  const r = document.documentElement;
  if (t === 'auto') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', t === 'scuro' ? 'dark' : 'light');
  const scuro = t === 'scuro' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', scuro ? '#0f172a' : '#1e3a8a');
}
let tema = leggiTema();
applicaTema(tema);

// --- struttura ---
const selettore = h('select', { class: 'selettore-scenario', 'aria-label': 'Scenario in uso' }) as HTMLSelectElement;
selettore.addEventListener('change', () => void apriScenario(selettore.value));

const btnScenari = h('button', { type: 'button', class: 'btn' }, 'Scenari');
btnScenari.addEventListener('click', apriGestioneScenari);
const btnGuida = h('button', { type: 'button', class: 'btn-icona', 'aria-label': 'Guida', title: 'Guida' }, '?');
btnGuida.addEventListener('click', apriGuida);
const ETICHETTE_TEMA: Record<Tema, string> = { auto: '◐', chiaro: '☀', scuro: '☾' };
const btnTema = h('button', { type: 'button', class: 'btn-icona' }, ETICHETTE_TEMA[tema]);
const aggiornaBtnTema = () => {
  const testo = { auto: 'Tema: automatico', chiaro: 'Tema: chiaro', scuro: 'Tema: scuro' }[tema];
  btnTema.textContent = ETICHETTE_TEMA[tema];
  btnTema.title = testo;
  btnTema.setAttribute('aria-label', `${testo} (tocca per cambiare)`);
};
aggiornaBtnTema();
btnTema.addEventListener('click', () => {
  tema = tema === 'auto' ? 'chiaro' : tema === 'chiaro' ? 'scuro' : 'auto';
  try {
    localStorage.setItem('tema', tema);
  } catch {
    /* ignora */
  }
  applicaTema(tema);
  aggiornaBtnTema();
});

const VISTE: { id: NomeVista; nome: string }[] = [
  { id: 'er', nome: 'Modello ER' },
  { id: 'logico', nome: 'Modello logico' },
  { id: 'esercizi', nome: 'Esercizi' },
];
const schede = h('nav', { class: 'schede', role: 'tablist', 'aria-label': 'Viste' });
for (const v of VISTE) {
  const b = h('button', { type: 'button', role: 'tab', class: 'scheda', 'data-id': v.id }, v.nome);
  b.addEventListener('click', () => cambiaVista(v.id));
  schede.appendChild(b);
}

const testata = h(
  'header',
  { class: 'testata' },
  h('div', { class: 'marchio' }, h('img', { src: iconaUrl, alt: '', width: '28', height: '28' }), h('span', { class: 'marchio-nome' }, 'Palestra SQL')),
  schede,
  h('div', { class: 'testata-destra' }, selettore, btnScenari, btnGuida, btnTema),
);

const vistaER = creaVistaER();
const vistaLogico = creaVistaLogico();
const vistaEsercizi = creaVistaEsercizi();
const sezioni: Record<NomeVista, HTMLElement> = {
  er: h('section', { class: 'vista', 'aria-label': 'Modello ER' }, vistaER.elemento),
  logico: h('section', { class: 'vista', 'aria-label': 'Modello logico' }, vistaLogico.elemento),
  esercizi: h('section', { class: 'vista', 'aria-label': 'Esercizi' }, vistaEsercizi.elemento),
};
const intestazioneScenario = h('div', { class: 'intestazione-scenario' });
const principale = h('main', { class: 'principale' }, intestazioneScenario, Object.values(sezioni));
const app = document.getElementById('app')!;
sostituisci(app, testata, principale);

const disegnaVista = () => {
  for (const b of schede.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-selected', String(b.dataset.id === stato.vista));
  for (const [id, el] of Object.entries(sezioni)) el.hidden = id !== stato.vista;
  intestazioneScenario.hidden = stato.vista === 'esercizi';
  if (stato.vista === 'er') vistaER.aggiorna();
  if (stato.vista === 'logico') vistaLogico.aggiorna();
  if (stato.vista === 'esercizi') vistaEsercizi.aggiorna();
};

const disegnaSelettore = () => {
  sostituisci(
    selettore,
    stato.scenari.map((s) => h('option', { value: s.id, selected: s.id === stato.corrente?.id }, s.nome)),
  );
  if (stato.corrente) selettore.value = stato.corrente.id;
};

const disegnaIntestazione = () => {
  const sc = stato.corrente;
  sostituisci(
    intestazioneScenario,
    sc ? h('div', {}, h('h1', {}, sc.nome), sc.dati.metadati.descrizione ? h('p', {}, sc.dati.metadati.descrizione) : null) : h('p', {}, 'Nessuno scenario caricato.'),
  );
};

on('vista', disegnaVista);
on('scenari', disegnaSelettore);
on('scenario', () => {
  disegnaSelettore();
  disegnaIntestazione();
  disegnaVista();
});
on('db', () => {
  if (stato.erroreDb) toast(`Errore nel database dello scenario: ${stato.erroreDb}`, 'errore', 8000);
});

// --- avvio ---
async function avvia() {
  stato.vista = 'esercizi';
  disegnaVista();
  try {
    await caricaScenari();
    if (stato.scenari.length === 0) await assicuraEsempio();
    const ultimo = await leggiImpostazione<string>('ultimoScenario');
    await apriScenario(ultimo ?? null);
  } catch (e) {
    toast(`Impossibile accedere all'archivio del browser: ${(e as Error).message}`, 'errore', 10000);
  }
  void richiediPersistenza();
}
void avvia();

// --- service worker (offline) ---
if ('serviceWorker' in navigator && import.meta.env.PROD && !import.meta.env.VITE_ARTIFACT) {
  import('virtual:pwa-register')
    .then(({ registerSW }) =>
      registerSW({
        immediate: true,
        onOfflineReady() {
          toast('Pronta anche offline', 'ok');
        },
      }),
    )
    .catch(() => undefined);
}

// test E2E / debug
declare global {
  interface Window {
    __palestra?: { stato: typeof stato };
  }
}
window.__palestra = { stato };
