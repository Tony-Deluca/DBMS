// Tokenizer SQL minimale: quanto basta per riconoscere parole chiave, parentesi
// e separatori ignorando stringhe, identificatori quotati e commenti.

export type TipoToken = 'parola' | 'numero' | 'stringa' | 'ident' | 'simbolo';

export interface Token {
  tipo: TipoToken;
  testo: string;
  /** Parola in maiuscolo (solo per tipo 'parola'). */
  upper: string;
  /** Profondità di annidamento delle parentesi al momento del token. */
  profondita: number;
  inizio: number;
  fine: number;
}

export interface EsitoTokenize {
  token: Token[];
  /** Messaggio se c'è una stringa o un commento non chiuso. */
  errore?: string;
}

export function tokenize(sql: string): EsitoTokenize {
  const token: Token[] = [];
  let i = 0;
  let prof = 0;
  const n = sql.length;
  const push = (tipo: TipoToken, inizio: number, fine: number, p = prof) => {
    const testo = sql.slice(inizio, fine);
    token.push({ tipo, testo, upper: tipo === 'parola' ? testo.toUpperCase() : testo, profondita: p, inizio, fine });
  };

  while (i < n) {
    const c = sql[i];
    // spazi
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // commento di riga
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    // commento di blocco
    if (c === '/' && sql[i + 1] === '*') {
      const fine = sql.indexOf('*/', i + 2);
      if (fine < 0) return { token, errore: 'Commento /* … */ non chiuso.' };
      i = fine + 2;
      continue;
    }
    // stringhe e identificatori quotati
    if (c === "'" || c === '"' || c === '`') {
      const inizio = i;
      i++;
      let chiuso = false;
      while (i < n) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) {
            i += 2;
            continue;
          }
          i++;
          chiuso = true;
          break;
        }
        i++;
      }
      if (!chiuso) {
        return { token, errore: c === "'" ? "Stringa non chiusa: manca un apice ' finale." : `Identificatore non chiuso: manca ${c}.` };
      }
      push(c === "'" ? 'stringa' : 'ident', inizio, i);
      continue;
    }
    if (c === '[') {
      const fine = sql.indexOf(']', i + 1);
      if (fine < 0) return { token, errore: 'Identificatore [ … ] non chiuso.' };
      push('ident', i, fine + 1);
      i = fine + 1;
      continue;
    }
    if (/[A-Za-z_À-ɏ]/.test(c)) {
      const inizio = i;
      while (i < n && /[A-Za-z0-9_$À-ɏ]/.test(sql[i])) i++;
      push('parola', inizio, i);
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      const inizio = i;
      while (i < n && /[0-9.eE]/.test(sql[i])) {
        if ((sql[i] === 'e' || sql[i] === 'E') && /[+-]/.test(sql[i + 1] ?? '')) i++;
        i++;
      }
      push('numero', inizio, i);
      continue;
    }
    if (c === '(') {
      push('simbolo', i, i + 1);
      prof++;
      i++;
      continue;
    }
    if (c === ')') {
      prof = Math.max(0, prof - 1);
      push('simbolo', i, i + 1);
      i++;
      continue;
    }
    // operatori di due caratteri
    const due = sql.slice(i, i + 2);
    if (['<>', '<=', '>=', '!=', '==', '||'].includes(due)) {
      push('simbolo', i, i + 2);
      i += 2;
      continue;
    }
    push('simbolo', i, i + 1);
    i++;
  }
  return { token };
}
