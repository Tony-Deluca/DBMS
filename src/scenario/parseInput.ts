// Lettura del testo JSON incollato o caricato: pulizia e messaggi d'errore con riga/colonna.

export type EsitoParse = { ok: true; valore: unknown } | { ok: false; messaggio: string };

/** Toglie BOM, recinti ```json … ``` e testo prima/dopo l'oggetto JSON. */
export function pulisciTesto(testo: string): string {
  let t = testo.replace(/^﻿/, '').trim();
  const recinto = /```(?:json|JSON)?\s*\n([\s\S]*?)\n?```/.exec(t);
  if (recinto) t = recinto[1].trim();
  const inizio = t.indexOf('{');
  const fine = t.lastIndexOf('}');
  if (inizio > 0 || (fine >= 0 && fine < t.length - 1)) {
    if (inizio >= 0 && fine > inizio) t = t.slice(inizio, fine + 1);
  }
  return t;
}

function rigaColonna(testo: string, pos: number): { riga: number; colonna: number; estratto: string } {
  let riga = 1;
  let inizioRiga = 0;
  for (let i = 0; i < pos && i < testo.length; i++) {
    if (testo[i] === '\n') {
      riga++;
      inizioRiga = i + 1;
    }
  }
  const fineRiga = testo.indexOf('\n', inizioRiga);
  const linea = testo.slice(inizioRiga, fineRiga < 0 ? undefined : fineRiga);
  const colonna = pos - inizioRiga + 1;
  const da = Math.max(0, colonna - 1 - 30);
  const estratto = (da > 0 ? '…' : '') + linea.slice(da, colonna - 1 + 30).trim();
  return { riga, colonna, estratto };
}

/**
 * Trova la posizione del primo errore di sintassi JSON con un piccolo parser:
 * Safari non indica la posizione nei messaggi di JSON.parse.
 */
export function trovaErroreJson(t: string): { pos: number; motivo: string } | null {
  let i = 0;
  const spazi = () => {
    while (i < t.length && /\s/.test(t[i])) i++;
  };
  const errore = (motivo: string): never => {
    throw { pos: i, motivo };
  };
  const valore = (): void => {
    spazi();
    const c = t[i];
    if (c === '{') return oggetto();
    if (c === '[') return array();
    if (c === '"') return stringa();
    if (c === '-' || /[0-9]/.test(c ?? '')) return numero();
    for (const lett of ['true', 'false', 'null']) {
      if (t.startsWith(lett, i)) {
        i += lett.length;
        return;
      }
    }
    if (c === undefined) errore('il testo finisce prima del previsto (manca una parentesi di chiusura?)');
    if (c === "'") errore("le stringhe JSON vanno tra virgolette doppie \" e non tra apici '");
    if (c === '“' || c === '”') errore('virgolette tipografiche “ ”: in JSON servono le virgolette dritte "');
    if (c === '}' || c === ']') errore(`«${c}» inatteso: forse c'è una virgola di troppo prima`);
    errore(`carattere inatteso «${c}»`);
  };
  const stringa = () => {
    i++;
    while (i < t.length) {
      const c = t[i];
      if (c === '"') {
        i++;
        return;
      }
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '\n') errore('stringa che va a capo: in JSON il ritorno a capo dentro una stringa si scrive \\n');
      i++;
    }
    errore('stringa non chiusa (manca una virgoletta ")');
  };
  const numero = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(t.slice(i));
    if (!m) errore('numero non valido');
    i += m![0].length;
  };
  const array = () => {
    i++;
    spazi();
    if (t[i] === ']') {
      i++;
      return;
    }
    for (;;) {
      valore();
      spazi();
      if (t[i] === ',') {
        i++;
        spazi();
        if (t[i] === ']') errore('virgola di troppo prima di «]»');
        continue;
      }
      if (t[i] === ']') {
        i++;
        return;
      }
      errore(t[i] === undefined ? 'array non chiuso: manca «]»' : `atteso «,» oppure «]» ma trovato «${t[i]}»`);
    }
  };
  const oggetto = () => {
    i++;
    spazi();
    if (t[i] === '}') {
      i++;
      return;
    }
    for (;;) {
      spazi();
      if (t[i] !== '"') errore(t[i] === undefined ? 'oggetto non chiuso: manca «}»' : 'atteso il nome di un campo tra virgolette doppie');
      stringa();
      spazi();
      if (t[i] !== ':') errore(`atteso «:» dopo il nome del campo`);
      i++;
      valore();
      spazi();
      if (t[i] === ',') {
        i++;
        spazi();
        if (t[i] === '}') errore('virgola di troppo prima di «}»');
        continue;
      }
      if (t[i] === '}') {
        i++;
        return;
      }
      errore(t[i] === undefined ? 'oggetto non chiuso: manca «}»' : `atteso «,» oppure «}» ma trovato «${t[i]}»`);
    }
  };
  try {
    valore();
    spazi();
    if (i < t.length) errore('testo in più dopo la fine del JSON');
    return null;
  } catch (e) {
    if (e && typeof e === 'object' && 'pos' in e) return e as { pos: number; motivo: string };
    throw e;
  }
}

export function leggiJson(testoGrezzo: string): EsitoParse {
  if (!testoGrezzo.trim()) return { ok: false, messaggio: 'Il testo è vuoto: incolla il JSON dello scenario.' };
  const testo = pulisciTesto(testoGrezzo);
  if (!testo.startsWith('{')) return { ok: false, messaggio: 'Non trovo un oggetto JSON: il testo deve iniziare con «{».' };
  try {
    return { ok: true, valore: JSON.parse(testo) };
  } catch (e) {
    const err = trovaErroreJson(testo);
    if (err) {
      const { riga, colonna, estratto } = rigaColonna(testo, err.pos);
      return { ok: false, messaggio: `JSON non valido alla riga ${riga}, colonna ${colonna}: ${err.motivo}.\nVicino a: ${estratto}` };
    }
    return { ok: false, messaggio: `JSON non valido: ${(e as Error).message}` };
  }
}
