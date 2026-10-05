// Traduzione in italiano dei messaggi di errore SQLite più comuni.

const REGOLE: [RegExp, (m: RegExpExecArray) => string][] = [
  [/no such table: (.+)/i, (m) => `La tabella «${m[1]}» non esiste. Controlla il nome nel modello logico (maiuscole/minuscole non contano).`],
  [/no such column: (.+)/i, (m) => `La colonna «${m[1]}» non esiste (o l'alias della tabella è sbagliato o non è visibile in quel punto).`],
  [/ambiguous column name: (.+)/i, (m) => `Il nome di colonna «${m[1]}» è ambiguo: compare in più tabelle. Qualificalo, ad es. T.${m[1].split('.').pop()}.`],
  [/near "(.+?)": syntax error/i, (m) => `Errore di sintassi vicino a «${m[1]}».`],
  [/incomplete input/i, () => 'La query è incompleta (manca una parte finale, ad es. una parentesi chiusa o una condizione).'],
  [/unrecognized token: "(.+?)"/i, (m) => `Simbolo non riconosciuto: «${m[1]}». Se è una stringa, usa gli apici dritti '…'.`],
  [/misuse of aggregate function (\w+)\(\)/i, (m) => `Uso non valido della funzione aggregata ${m[1]}(): non si può usare in WHERE (usa HAVING) né annidata in un'altra aggregata.`],
  [/misuse of aggregate: (\w+)\(\)/i, (m) => `Uso non valido della funzione aggregata ${m[1]}(): non si può usare in WHERE (usa HAVING).`],
  [/aggregate functions are not allowed in the GROUP BY clause/i, () => 'Le funzioni aggregate non sono ammesse nella clausola GROUP BY.'],
  [/a GROUP BY clause is required before HAVING/i, () => 'HAVING richiede una clausola GROUP BY.'],
  [/HAVING clause on a non-aggregate query/i, () => 'HAVING si usa solo con GROUP BY o funzioni aggregate.'],
  [/no such function: (.+)/i, (m) => `La funzione «${m[1]}» non esiste in SQLite.`],
  [/wrong number of arguments to function (\w+)\(\)/i, (m) => `Numero di argomenti sbagliato per la funzione ${m[1]}().`],
  [/sub-select returns (\d+) columns - expected 1/i, (m) => `La sottoquery restituisce ${m[1]} colonne, ma qui ne serve una sola.`],
  [/SELECTs to the left and right of (\w+) do not have the same number of result columns/i, (m) => `Le SELECT a sinistra e a destra di ${m[1]} devono avere lo stesso numero di colonne.`],
  [/(\d+)(?:st|nd|rd|th) ORDER BY term does not match any column in the result set/i, (m) => `Il termine n. ${m[1]} dell'ORDER BY non corrisponde a nessuna colonna del risultato (con UNION/EXCEPT si ordina solo per colonne del risultato).`],
  [/(\d+)(?:st|nd|rd|th) ORDER BY term out of range/i, (m) => `Il termine n. ${m[1]} dell'ORDER BY è fuori intervallo: la posizione non corrisponde a una colonna.`],
  [/ORDER BY clause should come after (\w+) not before/i, (m) => `Con ${m[1]} l'ORDER BY va messo alla fine, dopo l'ultima SELECT.`],
  [/row value misused/i, () => 'Uso non valido di una tupla di valori (…, …) in questo punto.'],
  [/attempt to write a readonly database/i, () => 'Il database è in sola lettura: puoi solo interrogarlo.'],
  [/circular reference: (.+)/i, (m) => `Riferimento circolare nella CTE «${m[1]}».`],
  [/interrupted/i, () => 'Esecuzione interrotta.'],
];

export function traduciErrore(msg: string): string {
  for (const [re, f] of REGOLE) {
    const m = re.exec(msg);
    if (m) return `${f(m)} (SQLite: ${msg})`;
  }
  return `Errore SQL: ${msg}`;
}
