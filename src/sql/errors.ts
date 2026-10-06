// Traduzione in italiano dei messaggi di errore di PostgreSQL più comuni.
// Si parte dal codice SQLSTATE (stabile) e dal testo inglese del messaggio; si aggiunge la posizione
// (riga e colonna) quando PostgreSQL la indica.
import type { ErrorePostgres } from './motore';
import { tokenize } from './tokenize';

type Regola = [codice: string | null, re: RegExp, f: (m: RegExpExecArray) => string];

const REGOLE: Regola[] = [
  ['42601', /syntax error at end of input/i, () => 'La query è incompleta (manca una parte finale, ad es. una parentesi chiusa o una condizione).'],
  ['42601', /syntax error at or near "(.+)"/i, (m) => `Errore di sintassi vicino a «${m[1]}».`],
  ['42601', /each (UNION|INTERSECT|EXCEPT) query must have the same number of columns/i, (m) => `Le SELECT a sinistra e a destra di ${m[1].toUpperCase()} devono avere lo stesso numero di colonne.`],
  ['42601', /subquery has too many columns/i, () => 'La sottoquery restituisce più colonne, ma qui ne serve una sola (ad es. con IN, ANY, ALL o un confronto).'],
  ['42601', /subquery has too few columns/i, () => 'La sottoquery restituisce meno colonne di quante ne servono per il confronto.'],
  ['42601', /unterminated quoted string/i, () => "Stringa non chiusa: manca un apice ' finale."],
  ['42P01', /missing FROM-clause entry for table "(.+)"/i, (m) => `«${m[1]}» non è una tabella né un alias definito nel FROM di questa SELECT (controlla l'alias o aggiungi la tabella al FROM).`],
  ['42P01', /relation "(.+)" does not exist/i, (m) => `La tabella «${m[1]}» non esiste. Controlla il nome nel modello logico (maiuscole/minuscole non contano, se non usi le virgolette).`],
  ['42703', /column "?(.+?)"? does not exist/i, (m) => `La colonna «${m[1]}» non esiste (o l'alias della tabella è sbagliato o non è visibile in quel punto). Ricorda: le stringhe vanno tra apici '…', non tra virgolette "…".`],
  ['42702', /column reference "(.+)" is ambiguous/i, (m) => `Il nome di colonna «${m[1]}» è ambiguo: compare in più tabelle. Qualificalo, ad es. T.${m[1]}.`],
  ['42803', /column "(.+)" must appear in the GROUP BY clause or be used in an aggregate function/i, (m) => `La colonna «${m[1]}» deve comparire nel GROUP BY oppure dentro una funzione aggregata (COUNT, SUM, AVG, MIN, MAX).`],
  ['42803', /aggregate functions are not allowed in (WHERE|GROUP BY|JOIN conditions)/i, (m) => `Le funzioni aggregate non sono ammesse in ${m[1].toUpperCase()}${/where/i.test(m[1]) ? ': per filtrare sui gruppi usa HAVING' : ''}.`],
  ['42803', /aggregate function calls cannot be nested/i, () => 'Le funzioni aggregate non si possono annidare (es. MAX(AVG(…))): usa una sottoquery.'],
  ['42803', /subquery uses ungrouped column "(.+)" from outer query/i, (m) => `La sottoquery usa la colonna «${m[1]}» della query esterna, che non è nel GROUP BY.`],
  ['42883', /operator does not exist: (.+)/i, (m) => `Tipi incompatibili nel confronto o nell'operazione (${m[1]}): ad es. un testo confrontato con un numero. Controlla i tipi delle colonne o usa CAST.`],
  ['42883', /function (.+?)\(.*\) does not exist/i, (m) => `La funzione «${m[1]}» non esiste in PostgreSQL con questi argomenti.`],
  ['42804', /argument of (WHERE|HAVING|JOIN\/ON|AND|OR|NOT|CASE\/WHEN) must be type boolean/i, (m) => `La condizione di ${m[1]} deve essere vera o falsa (un confronto), non un valore.`],
  ['42804', /(UNION|INTERSECT|EXCEPT|CASE|COALESCE) types (.+) and (.+) cannot be matched/i, (m) => `In ${m[1].toUpperCase()} si mescolano tipi incompatibili (${m[2]} e ${m[3]}).`],
  ['22P02', /invalid input syntax for type (\w+(?: \w+)?): "(.*)"/i, (m) => `Il valore «${m[2]}» non è un ${nomeTipo(m[1])} valido.`],
  ['22007', /invalid input syntax for type (date|timestamp.*): "(.*)"/i, (m) => `«${m[2]}» non è una data valida: usa il formato 'AAAA-MM-GG'.`],
  ['22008', /date\/time field value out of range: "(.*)"/i, (m) => `«${m[1]}» non è una data valida: usa il formato 'AAAA-MM-GG'.`],
  ['22012', /division by zero/i, () => 'Divisione per zero.'],
  ['22003', /out of range/i, () => 'Valore numerico fuori dall\'intervallo del tipo (troppo grande).'],
  ['21000', /more than one row returned by a subquery used as an expression/i, () => 'La sottoquery restituisce più di una riga, ma qui ne serve una sola: usa IN, ANY o ALL, oppure fai in modo che restituisca un solo valore.'],
  ['42P10', /ORDER BY position (\d+) is not in select list/i, (m) => `ORDER BY ${m[1]}: la posizione non corrisponde a una colonna del risultato.`],
  ['42P10', /for SELECT DISTINCT, ORDER BY expressions must appear in select list/i, () => 'Con SELECT DISTINCT si può ordinare solo per colonne che compaiono nel risultato.'],
  ['42P10', /invalid UNION\/INTERSECT\/EXCEPT ORDER BY clause/i, () => "Con UNION/INTERSECT/EXCEPT l'ORDER BY può usare solo colonne del risultato."],
  ['42712', /table name "(.+)" specified more than once/i, (m) => `La tabella «${m[1]}» compare due volte nel FROM: dai un alias diverso a ciascuna (es. Esame e1, Esame e2).`],
  ['42P19', /recursive/i, () => 'CTE ricorsiva non valida.'],
  ['42P20', /window functions are not allowed in (\w+)/i, (m) => `Le funzioni finestra non sono ammesse in ${m[1].toUpperCase()}.`],
  ['25006', /read-only transaction/i, () => 'Il database è in sola lettura: puoi solo interrogarlo.'],
  ['54001', /stack depth limit exceeded/i, () => 'Query troppo annidata o ricorsione senza fine.'],
  ['57014', /canceling statement/i, () => 'Esecuzione interrotta.'],
  [null, /column "(.+)" is of type (\w+) but expression is of type (\w+)/i, (m) => `La colonna «${m[1]}» è di tipo ${m[2]}, ma il valore è di tipo ${m[3]}.`],
];

function nomeTipo(t: string): string {
  const k = t.toLowerCase();
  if (k === 'integer' || k === 'bigint' || k === 'smallint') return 'numero intero';
  if (k === 'numeric' || k === 'double precision' || k === 'real') return 'numero';
  if (k === 'boolean') return 'valore booleano (TRUE/FALSE)';
  if (k === 'date') return "data ('AAAA-MM-GG')";
  return `valore di tipo ${t}`;
}

/** Riga e colonna (da 1) della posizione `pos` (da 1) nel testo. */
export function rigaColonna(sql: string, pos: number): { riga: number; colonna: number } {
  const prima = sql.slice(0, Math.max(0, pos - 1));
  const righe = prima.split('\n');
  return { riga: righe.length, colonna: righe[righe.length - 1].length + 1 };
}

export function traduciErrore(e: ErrorePostgres, sql?: string): string {
  const msg = e.message;
  let testo: string | null = null;
  for (const [codice, re, f] of REGOLE) {
    if (codice && e.codice && codice !== e.codice) continue;
    const m = re.exec(msg);
    if (m) {
      testo = f(m);
      break;
    }
  }
  const dove = sql && e.posizione ? (() => {
    const { riga, colonna } = rigaColonna(sql, e.posizione);
    return ` [riga ${riga}, colonna ${colonna}]`;
  })() : '';
  if (testo && sql) {
    // PostgreSQL riporta i nomi in minuscolo: si mostrano come li ha scritti lo studente
    const scritte = new Map<string, string>();
    for (const t of tokenize(sql).token) if (t.tipo === 'parola' && !scritte.has(t.testo.toLowerCase())) scritte.set(t.testo.toLowerCase(), t.testo);
    testo = testo.replace(/«([^»]+)»/g, (_, nome: string) => `«${nome.split('.').map((p) => scritte.get(p) ?? p).join('.')}»`);
  }
  if (testo) return `${testo}${dove} (PostgreSQL: ${msg})`;
  return `Errore SQL${dove}: ${msg}`;
}
