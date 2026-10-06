// Elenco unico delle parole SQL usate dall'app: lo condividono l'evidenziazione e l'autocompletamento
// dell'editor (dialetto.ts) e l'evidenziazione delle soluzioni mostrate (vistaEsercizi.ts).
// Contiene solo parole che PostgreSQL (il motore dell'app) riconosce davvero, in minuscolo: l'editor le
// riconosce in maiuscolo e in minuscolo e le propone in maiuscolo.

/** Parole chiave delle interrogazioni (comprese quelle dei confronti quantificati ALL / ANY / SOME). */
export const PAROLE_CHIAVE = [
  'select', 'from', 'where', 'group', 'by', 'having', 'order', 'asc', 'desc', 'nulls', 'first', 'last',
  'limit', 'offset', 'fetch', 'next', 'rows', 'row', 'only', 'distinct', 'all', 'any', 'some', 'exists',
  'in', 'not', 'and', 'or', 'is', 'null', 'true', 'false', 'unknown', 'between', 'symmetric', 'like', 'ilike', 'similar', 'to', 'escape',
  'case', 'when', 'then', 'else', 'end', 'as', 'on', 'using', 'join', 'inner', 'left', 'right', 'full', 'outer',
  'cross', 'natural', 'lateral', 'union', 'intersect', 'except', 'with', 'recursive', 'values', 'cast',
  'over', 'partition', 'window', 'range', 'preceding', 'following', 'unbounded', 'current', 'filter', 'within',
  'distinct', 'for', 'at', 'time', 'zone', 'interval', 'year', 'month', 'day', 'hour', 'minute', 'second',
] as const;

/** Funzioni (aggregate, di testo, numeriche, di data e finestra) supportate da PostgreSQL. */
export const FUNZIONI = [
  // aggregate
  'count', 'sum', 'avg', 'min', 'max', 'string_agg', 'array_agg', 'bool_and', 'bool_or', 'every', 'stddev', 'variance',
  // condizionali
  'coalesce', 'nullif', 'greatest', 'least',
  // testo
  'upper', 'lower', 'length', 'char_length', 'character_length', 'substring', 'substr', 'trim', 'ltrim', 'rtrim', 'btrim',
  'position', 'strpos', 'replace', 'concat', 'concat_ws', 'lpad', 'rpad', 'repeat', 'reverse', 'initcap', 'split_part', 'format',
  'starts_with', 'regexp_replace', 'to_char',
  // numeri
  'abs', 'ceil', 'ceiling', 'floor', 'round', 'trunc', 'mod', 'power', 'sqrt', 'exp', 'ln', 'log', 'sign', 'random',
  // date
  'extract', 'date_part', 'date_trunc', 'age', 'now', 'current_date', 'current_time', 'current_timestamp',
  'localtime', 'localtimestamp', 'make_date', 'to_date', 'to_number',
  // finestra
  'row_number', 'rank', 'dense_rank', 'ntile', 'lag', 'lead', 'first_value', 'last_value',
] as const;

/** Tipi di dato (per CAST e per leggere gli statement degli scenari). */
export const TIPI = [
  'integer', 'int', 'smallint', 'bigint', 'numeric', 'decimal', 'real', 'double', 'precision', 'float',
  'varchar', 'char', 'character', 'varying', 'text', 'boolean', 'bool', 'date', 'timestamp', 'serial',
] as const;

const unici = (a: readonly string[]) => [...new Set(a)];

/**
 * Parole chiave per il dialetto dell'editor: senza quelle che sono anche tipi («time», «interval» restano tipi)
 * e senza i valori TRUE/FALSE/NULL/UNKNOWN, che l'editor colora già come costanti (e propone comunque).
 */
export const PAROLE_CHIAVE_UNICHE = unici(PAROLE_CHIAVE).filter(
  (p) => !(TIPI as readonly string[]).includes(p) && !['true', 'false', 'null', 'unknown'].includes(p),
);
export const FUNZIONI_UNICHE = unici(FUNZIONI);

const insieme = (a: readonly string[]) => new Set(a.map((x) => x.toLowerCase()));
const SET_CHIAVE = insieme(PAROLE_CHIAVE);
const SET_FUNZIONI = insieme(FUNZIONI);
const SET_TIPI = insieme(TIPI);

/** Categoria di una parola (senza distinguere maiuscole e minuscole). */
export function categoriaParola(parola: string): 'chiave' | 'funzione' | 'tipo' | null {
  const k = parola.toLowerCase();
  if (SET_FUNZIONI.has(k)) return 'funzione';
  if (SET_CHIAVE.has(k)) return 'chiave';
  if (SET_TIPI.has(k)) return 'tipo';
  return null;
}
