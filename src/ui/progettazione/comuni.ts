// Componenti comuni agli editor della Progettazione.
import { h, sostituisci, apriDialogo, toast } from '../dom';
import { pngDaSvg, nomeFileSicuro } from '../../progettazione/esporta';
import type { Segnalazione } from '../../progettazione/controlli';

export interface VoceMenu {
  etichetta: string;
  azione: () => void;
  pericolosa?: boolean;
  attiva?: boolean;
}

let menuAperto: HTMLElement | null = null;

export function chiudiMenu() {
  menuAperto?.remove();
  menuAperto = null;
}

/** Menu contestuale (pressione prolungata su iPad, clic destro su PC). */
export function apriMenu(voci: VoceMenu[], x: number, y: number, titolo?: string) {
  chiudiMenu();
  const menu = h(
    'div',
    { class: 'pg-menu', role: 'menu' },
    titolo ? h('div', { class: 'pg-menu-titolo' }, titolo) : null,
    voci.map((v) => {
      const b = h('button', { type: 'button', role: 'menuitem', class: `pg-menu-voce${v.pericolosa ? ' pericolo' : ''}${v.attiva ? ' attiva' : ''}` }, v.etichetta);
      b.addEventListener('click', () => {
        chiudiMenu();
        v.azione();
      });
      return b;
    }),
  );
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  menu.style.left = `${Math.max(8, Math.min(x, vw - r.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, vh - r.height - 8))}px`;
  menuAperto = menu;
  const smetti = () => {
    document.removeEventListener('pointerdown', fuori, true);
    document.removeEventListener('keydown', esc, true);
  };
  const fuori = (e: PointerEvent) => {
    if (!menu.contains(e.target as Node)) {
      chiudiMenu();
      smetti();
    }
  };
  const esc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    chiudiMenu();
    smetti();
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', fuori, true);
    document.addEventListener('keydown', esc, true);
  }, 0);
  (menu.querySelector('button') as HTMLButtonElement | null)?.focus();
}

export function pulsante(testo: string, titolo: string, azione: () => void, classe = 'btn btn-piccolo'): HTMLButtonElement {
  // i pulsanti con testo si chiamano come il testo visibile; quelli a icona usano il titolo
  const soloIcona = !/\p{L}{2,}/u.test(testo);
  // il simbolo iniziale («▭ Entità») sta in uno span che nelle barre strette si nasconde
  const m = /^([^\p{L}\s+]+)\s(.+)$/u.exec(testo);
  const contenuto = m ? [h('span', { class: 'pg-glifo', 'aria-hidden': 'true' }, `${m[1]} `), m[2]] : [testo];
  const b = h('button', { type: 'button', class: classe, title: titolo, 'aria-label': soloIcona ? titolo : null }, ...contenuto) as HTMLButtonElement;
  b.addEventListener('click', azione);
  return b;
}

/** Gruppo di scelte rapide (es. cardinalità): un tocco seleziona. */
export function chips<T extends string | null>(valori: T[], corrente: T, etichetta: (v: T) => string, scegli: (v: T) => void, aria: string): HTMLElement {
  const gruppo = h('div', { class: 'pg-chips', role: 'group', 'aria-label': aria });
  for (const v of valori) {
    const b = h('button', { type: 'button', class: 'pg-chip', 'aria-pressed': String(v === corrente) }, etichetta(v));
    b.addEventListener('click', () => scegli(v));
    gruppo.appendChild(b);
  }
  return gruppo;
}

/** Campo di testo senza autocorrezione né maiuscole automatiche (font ≥ 16px nel CSS). */
export function campoTesto(valore: string, aria: string, alCambio: (v: string) => void, opz: { segnaposto?: string; classe?: string } = {}): HTMLInputElement {
  const i = h('input', {
    type: 'text',
    class: `campo pg-campo ${opz.classe ?? ''}`,
    value: valore,
    'aria-label': aria,
    placeholder: opz.segnaposto ?? '',
    autocorrect: 'off',
    autocapitalize: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
  }) as HTMLInputElement;
  i.value = valore;
  i.addEventListener('input', () => alCambio(i.value));
  i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') i.blur();
    e.stopPropagation();
  });
  return i;
}

export function selettore<T extends string>(opzioni: { valore: T; etichetta: string }[], corrente: T, aria: string, alCambio: (v: T) => void): HTMLSelectElement {
  const s = h('select', { class: 'pg-select', 'aria-label': aria }, opzioni.map((o) => h('option', { value: o.valore, selected: o.valore === corrente }, o.etichetta))) as HTMLSelectElement;
  s.value = corrente;
  s.addEventListener('change', () => alCambio(s.value as T));
  return s;
}

function scarica(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Immagine in un riquadro: su iPad si tiene premuta per salvarla o copiarla. */
function mostraImmagine(titolo: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const img = h('img', { src: url, alt: titolo, class: 'pg-anteprima' });
  const copia = h('button', { type: 'button', class: 'btn btn-piccolo' }, 'Copia immagine');
  copia.hidden = !('ClipboardItem' in window);
  copia.addEventListener('click', async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Immagine copiata', 'ok');
    } catch {
      toast('Copia non consentita: tieni premuta l\'immagine e scegli «Copia» o «Salva immagine».', 'errore', 6000);
    }
  });
  apriDialogo(titolo, h('div', { class: 'pg-immagine' }, h('p', { class: 'nota' }, 'Tieni premuta l\'immagine (iPad) o fai clic destro (PC) per salvarla o copiarla.'), copia, img), {
    classe: 'dialogo-grande',
    onChiudi: () => URL.revokeObjectURL(url),
  });
}

/** Voci di esportazione: PNG, immagine da tenere premuta, SVG. */
export function vociEsportazione(nomeBase: () => string, svg: () => string): VoceMenu[] {
  const artifact = !!import.meta.env.VITE_ARTIFACT;
  const voci: VoceMenu[] = [];
  // nella pagina pubblicata i download sono bloccati: resta l'immagine da tenere premuta
  if (!artifact) {
    voci.push({
      etichetta: 'Scarica immagine PNG (alta risoluzione)',
      azione: async () => {
        try {
          scarica(nomeFileSicuro(nomeBase(), 'png'), await pngDaSvg(svg(), 3));
        } catch (e) {
          toast((e as Error).message, 'errore');
        }
      },
    });
  }
  voci.push(
    {
      etichetta: artifact ? 'Immagine PNG ad alta risoluzione (tieni premuto per salvarla)' : 'Mostra immagine (tieni premuto per salvare o copiare)',
      azione: async () => {
        try {
          mostraImmagine(nomeBase(), await pngDaSvg(svg(), 3));
        } catch (e) {
          toast((e as Error).message, 'errore');
        }
      },
    },
  );
  if (!artifact) voci.push({ etichetta: 'Scarica disegno vettoriale SVG', azione: () => scarica(nomeFileSicuro(nomeBase(), 'svg'), new Blob([svg()], { type: 'image/svg+xml' })) });
  return voci;
}

/** Pulsante «⋯» con le azioni meno frequenti (le voci si calcolano all'apertura). */
export function menuAltro(voci: () => VoceMenu[], titolo = 'Altre azioni'): HTMLButtonElement {
  const b = pulsante('⋯', titolo, () => {
    const r = b.getBoundingClientRect();
    apriMenu(voci(), r.left, r.bottom + 4, titolo);
  }, 'btn-icona pg-altro');
  return b;
}

/** Elenco delle segnalazioni di coerenza; toccandone una si selezionano gli elementi coinvolti. */
export function elencoSegnalazioni(segnalazioni: Segnalazione[], seleziona: (ids: string[]) => void): HTMLElement {
  if (segnalazioni.length === 0) return h('p', { class: 'pg-ok' }, '✓ Nessuna segnalazione.');
  return h(
    'ul',
    { class: 'pg-segnalazioni' },
    segnalazioni.map((s) => {
      const b = h('button', { type: 'button', class: `pg-segnalazione ${s.livello}` }, h('span', { class: 'pg-icona' }, s.livello === 'errore' ? '⛔' : '⚠️'), ' ', s.messaggio);
      b.addEventListener('click', () => seleziona(s.elementi));
      return h('li', {}, b);
    }),
  );
}

export function aggiorna(el: Element, ...figli: (Node | string | null)[]) {
  sostituisci(el, ...figli);
}

/** Vero se l'utente sta scrivendo in un campo dentro `contenitore` (in quel caso non si ridisegna). */
export function staScrivendo(contenitore: Element): boolean {
  const a = document.activeElement;
  return !!a && contenitore.contains(a) && (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement);
}
