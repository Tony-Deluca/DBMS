// Dialetto SQLite per CodeMirror.
//
// Perché non si usa direttamente `SQLite` di @codemirror/lang-sql: la libreria inserisce le virgolette
// attorno a ogni nome che non è tutto minuscolo (`Studente` → `"Studente"`), perché per default considera
// gli identificatori sensibili alle maiuscole. In SQLite non lo sono, quindi dichiariamo
// `caseInsensitiveIdentifiers`: le virgolette restano solo per i nomi non semplici
// (spazi, trattini, accenti…), cioè quelli che non rispettano ^[A-Za-z_][A-Za-z0-9_]*$.
// Quando servono si usano le virgolette doppie (standard SQL) e non il backtick.
import { SQLDialect, SQLite, sql } from '@codemirror/lang-sql';

export const DIALETTO_SQLITE = SQLDialect.define({ ...SQLite.spec, caseInsensitiveIdentifiers: true, identifierQuotes: '"`' });

export function estensioneSql(schema: Record<string, string[]> | null) {
  return sql({ dialect: DIALETTO_SQLITE, upperCaseKeywords: true, schema: schema ?? undefined });
}
