import { tokenize, type Token } from './tokenize';

export type EsitoGuardia = { ok: true; sql: string } | { ok: false; messaggio: string };

// Istruzioni che modificano il database o la connessione.
const VIETATE = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'CREATE', 'DROP', 'ALTER', 'ATTACH', 'DETACH',
  'PRAGMA', 'VACUUM', 'REINDEX', 'ANALYZE', 'BEGIN', 'END', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE',
]);

const SPIEGAZIONE =
  'Sono consentite solo interrogazioni che iniziano con SELECT o WITH: i dati dello scenario non si possono modificare.';

/**
 * Controlla che il testo sia UNA sola interrogazione SELECT/WITH.
 * Restituisce il testo pulito (senza ';' finali). Il database ha comunque
 * PRAGMA query_only attivo come seconda difesa.
 */
export function controllaQuery(testo: string): EsitoGuardia {
  const sql = testo.trim();
  if (!sql) return { ok: false, messaggio: 'Scrivi una query prima di eseguirla.' };
  const { token, errore } = tokenize(sql);
  if (errore) return { ok: false, messaggio: errore };
  if (token.length === 0) return { ok: false, messaggio: 'La query contiene solo commenti: scrivi una SELECT.' };

  // più istruzioni?
  const idxPuntoVirgola = token.findIndex((t) => t.tipo === 'simbolo' && t.testo === ';');
  let utili: Token[] = token;
  if (idxPuntoVirgola >= 0) {
    const dopo = token.slice(idxPuntoVirgola).filter((t) => !(t.tipo === 'simbolo' && t.testo === ';'));
    if (dopo.length > 0) {
      return { ok: false, messaggio: 'Puoi eseguire una sola query alla volta: togli il «;» in mezzo o la seconda istruzione.' };
    }
    utili = token.slice(0, idxPuntoVirgola);
  }
  if (utili.length === 0) return { ok: false, messaggio: 'Scrivi una query prima di eseguirla.' };

  const prima = utili[0];
  if (prima.tipo !== 'parola' || (prima.upper !== 'SELECT' && prima.upper !== 'WITH')) {
    const parola = prima.tipo === 'parola' ? prima.upper : prima.testo;
    if (prima.tipo === 'parola' && VIETATE.has(parola)) {
      return { ok: false, messaggio: `Istruzione ${parola} non consentita. ${SPIEGAZIONE}` };
    }
    if (prima.tipo === 'simbolo' && prima.testo === '(') {
      return { ok: false, messaggio: 'La query non può iniziare con «(»: comincia con SELECT o WITH.' };
    }
    return { ok: false, messaggio: `La query inizia con «${parola}». ${SPIEGAZIONE}` };
  }

  if (prima.upper === 'WITH') {
    // Dopo le CTE (… AS (…)) deve arrivare una SELECT: SQLite ammette anche WITH … DELETE/INSERT/UPDATE.
    for (let i = 1; i < utili.length; i++) {
      const t = utili[i];
      if (!(t.tipo === 'simbolo' && t.testo === ')' && t.profondita === 0)) continue;
      const succ = utili[i + 1];
      if (!succ) break;
      if (succ.tipo === 'simbolo' && succ.testo === ',') continue;
      if (succ.tipo === 'parola' && (succ.upper === 'AS' || succ.upper === 'NOT' || succ.upper === 'MATERIALIZED')) continue;
      if (succ.tipo === 'parola' && (succ.upper === 'SELECT' || succ.upper === 'VALUES')) break;
      const parola = succ.tipo === 'parola' ? succ.upper : succ.testo;
      if (VIETATE.has(parola)) return { ok: false, messaggio: `WITH … ${parola} non è consentito. ${SPIEGAZIONE}` };
      break;
    }
  }

  const fine = utili[utili.length - 1].fine;
  return { ok: true, sql: sql.slice(0, fine) };
}

/** Converte virgolette e trattini "intelligenti" (iOS/macOS) nei caratteri ASCII. */
export function normalizzaVirgolette(testo: string): string {
  return testo
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/—/g, '--')
    .replace(/–/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ');
}
