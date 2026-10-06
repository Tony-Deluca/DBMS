import { tokenize, type Token } from './tokenize';

export interface VoceOrdinamento {
  /** Testo dell'espressione così com'è scritto. */
  espressione: string;
  discendente: boolean;
}

/**
 * Restituisce le voci dell'ORDER BY più esterno (non quello di sottoquery o CTE),
 * oppure null se la query non ordina il risultato finale.
 */
export function orderByEsterno(sql: string): VoceOrdinamento[] | null {
  const { token } = tokenize(sql);
  // Ultimo ORDER BY a profondità 0: quello che ordina il risultato finale.
  let idx = -1;
  for (let i = 0; i < token.length - 1; i++) {
    const t = token[i];
    if (t.profondita === 0 && t.upper === 'ORDER' && token[i + 1].upper === 'BY' && t.tipo === 'parola') idx = i;
  }
  if (idx < 0) return null;
  // Un ORDER BY prima di UNION/EXCEPT/INTERSECT non è finale (PostgreSQL lo vieta comunque).
  for (let i = idx; i < token.length; i++) {
    const t = token[i];
    if (t.profondita === 0 && t.tipo === 'parola' && ['UNION', 'EXCEPT', 'INTERSECT'].includes(t.upper)) return null;
  }

  const voci: VoceOrdinamento[] = [];
  let corrente: Token[] = [];
  const chiudi = () => {
    if (corrente.length === 0) return;
    let discendente = false;
    // togli ASC/DESC, NULLS FIRST/LAST, COLLATE x
    const parti = [...corrente];
    for (let k = 0; k < parti.length; k++) {
      if (parti[k].profondita !== 0 || parti[k].tipo !== 'parola') continue;
      const u = parti[k].upper;
      if (u === 'COLLATE' || u === 'NULLS' || u === 'ASC' || u === 'DESC') {
        discendente = parti.slice(k).some((p) => p.upper === 'DESC' && p.profondita === 0);
        parti.length = k;
        break;
      }
    }
    if (parti.length > 0) {
      voci.push({ espressione: sql.slice(parti[0].inizio, parti[parti.length - 1].fine), discendente });
    }
    corrente = [];
  };
  for (let i = idx + 2; i < token.length; i++) {
    const t = token[i];
    if (t.profondita === 0 && t.tipo === 'parola' && (t.upper === 'LIMIT' || t.upper === 'OFFSET')) break;
    if (t.profondita === 0 && t.tipo === 'simbolo' && t.testo === ';') break;
    if (t.profondita === 0 && t.tipo === 'simbolo' && t.testo === ',') {
      chiudi();
      continue;
    }
    corrente.push(t);
  }
  chiudi();
  return voci;
}

/** Toglie apici/virgolette/parentesi quadre da un identificatore. */
function pulisciIdent(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('`') && t.endsWith('`'))) return t.slice(1, -1);
  if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1);
  return t;
}

/**
 * Associa le voci dell'ORDER BY alle colonne del risultato (per nome, alias o posizione).
 * Restituisce null se almeno una voce è un'espressione non riconducibile a una colonna.
 */
export function colonneOrdinamento(voci: VoceOrdinamento[], colonne: string[]): number[] | null {
  const indici: number[] = [];
  const nomi = colonne.map((c) => c.toLowerCase());
  for (const v of voci) {
    const e = v.espressione.trim();
    if (/^\d+$/.test(e)) {
      const pos = Number(e) - 1;
      if (pos < 0 || pos >= colonne.length) return null;
      indici.push(pos);
      continue;
    }
    // identificatore semplice o qualificato (t.col)
    const m = /^((?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)\.)?("[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_À-ɏ][\w$À-ɏ]*)$/.exec(e);
    if (m) {
      const nome = pulisciIdent(m[2]).toLowerCase();
      const pos = nomi.indexOf(nome);
      // nome ambiguo (es. due colonne «Nome»): non si può sapere quale ordina
      if (pos >= 0 && nomi.lastIndexOf(nome) !== pos) return null;
      if (pos >= 0) {
        indici.push(pos);
        continue;
      }
    }
    // espressione identica al nome della colonna (es. COUNT(*) senza alias)
    const pos = nomi.indexOf(e.toLowerCase());
    if (pos >= 0) {
      indici.push(pos);
      continue;
    }
    return null;
  }
  return indici;
}

/** true se la query ha un LIMIT/OFFSET al livello più esterno (il risultato dipende dai pareggi). */
export function haLimitEsterno(sql: string): boolean {
  return tokenize(sql).token.some((t) => t.profondita === 0 && t.tipo === 'parola' && (t.upper === 'LIMIT' || t.upper === 'OFFSET'));
}

export interface QueryConChiavi {
  sql: string;
  /** numero di colonne aggiunte in fondo: i valori delle chiavi d'ordinamento */
  chiavi: number;
}

/**
 * Riscrive una SELECT aggiungendo in fondo all'elenco delle colonne le espressioni dell'ORDER BY più esterno
 * (`SELECT a, b FROM t ORDER BY c` → `SELECT a, b, (c) AS __k1 FROM t ORDER BY c`), così si conoscono i
 * valori delle chiavi anche quando non sono colonne del risultato.
 * Restituisce null se la riscrittura non è sicura (DISTINCT, UNION/EXCEPT/INTERSECT, voci posizionali…):
 * aggiungerebbe o cambierebbe righe.
 */
export function riscriviConChiavi(sql: string, voci: VoceOrdinamento[]): QueryConChiavi | null {
  if (voci.length === 0 || voci.some((v) => /^\d+$/.test(v.espressione.trim()))) return null;
  const { token } = tokenize(sql);
  const sulPrimoLivello = token.filter((t) => t.profondita === 0 && t.tipo === 'parola');
  if (sulPrimoLivello.some((t) => ['UNION', 'EXCEPT', 'INTERSECT'].includes(t.upper))) return null;
  const select = sulPrimoLivello.filter((t) => t.upper === 'SELECT');
  if (select.length !== 1) return null;
  const idxSelect = token.indexOf(select[0]);
  const dopo = token[idxSelect + 1];
  if (dopo && dopo.tipo === 'parola' && (dopo.upper === 'DISTINCT' || dopo.upper === 'ALL')) {
    if (dopo.upper === 'DISTINCT') return null;
  }
  const from = token.slice(idxSelect).find((t) => t.profondita === 0 && t.tipo === 'parola' && t.upper === 'FROM');
  if (!from) return null;
  const chiavi = voci.map((v, i) => `(${v.espressione}) AS __k${i + 1}`).join(', ');
  return { sql: `${sql.slice(0, from.inizio).trimEnd()}, ${chiavi} ${sql.slice(from.inizio)}`, chiavi: voci.length };
}
