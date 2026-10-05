// Helper minimi per costruire il DOM senza framework.

type Figlio = Node | string | number | null | undefined | false;
type Attributi = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attr: Attributi = {}, ...figli: (Figlio | Figlio[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attr)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'html') {
      el.innerHTML = String(v);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (k in el && typeof v !== 'string') {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  aggiungi(el, figli);
  return el;
}

function aggiungi(el: Node, figli: (Figlio | Figlio[])[]) {
  for (const f of figli) {
    if (Array.isArray(f)) aggiungi(el, f);
    else if (f === null || f === undefined || f === false) continue;
    else if (f instanceof Node) el.appendChild(f);
    else el.appendChild(document.createTextNode(String(f)));
  }
}

export function svuota(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function sostituisci(el: Element, ...figli: (Figlio | Figlio[])[]) {
  svuota(el);
  aggiungi(el, figli);
}

/** Notifica temporanea in basso. */
export function toast(messaggio: string, tipo: 'info' | 'ok' | 'errore' = 'info', durata = 3500) {
  let cont = document.querySelector('.toasts');
  if (!cont) {
    cont = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(cont);
  }
  const t = h('div', { class: `toast toast-${tipo}` }, messaggio);
  cont.appendChild(t);
  setTimeout(() => {
    t.classList.add('esce');
    setTimeout(() => t.remove(), 300);
  }, durata);
}

/** Finestra modale basata su <dialog>. Restituisce la funzione per chiuderla. */
export function apriDialogo(titolo: string, contenuto: Node, opzioni: { classe?: string; onChiudi?: () => void } = {}): () => void {
  const chiudiBtn = h('button', { class: 'btn-icona', type: 'button', 'aria-label': 'Chiudi', title: 'Chiudi' }, '✕');
  const d = h(
    'dialog',
    { class: `dialogo ${opzioni.classe ?? ''}` },
    h('div', { class: 'dialogo-testa' }, h('h2', {}, titolo), chiudiBtn),
    h('div', { class: 'dialogo-corpo' }, contenuto),
  );
  const chiudi = () => {
    if (d.open) d.close();
  };
  chiudiBtn.addEventListener('click', chiudi);
  d.addEventListener('close', () => {
    d.remove();
    opzioni.onChiudi?.();
  });
  d.addEventListener('click', (e) => {
    if (e.target === d) chiudi(); // clic sullo sfondo
  });
  document.body.appendChild(d);
  d.showModal();
  return chiudi;
}

export function conferma(titolo: string, messaggio: string, etichettaOk = 'Conferma', pericolosa = false): Promise<boolean> {
  return new Promise((risolvi) => {
    let esito = false;
    const ok = h('button', { class: `btn ${pericolosa ? 'btn-pericolo' : 'btn-primario'}`, type: 'button' }, etichettaOk);
    const annulla = h('button', { class: 'btn', type: 'button' }, 'Annulla');
    const chiudi = apriDialogo(
      titolo,
      h('div', {}, h('p', {}, messaggio), h('div', { class: 'riga-pulsanti destra' }, annulla, ok)),
      { classe: 'dialogo-piccolo', onChiudi: () => risolvi(esito) },
    );
    ok.addEventListener('click', () => {
      esito = true;
      chiudi();
    });
    annulla.addEventListener('click', chiudi);
    setTimeout(() => ok.focus(), 50);
  });
}
