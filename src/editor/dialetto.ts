// Dialetto PostgreSQL per CodeMirror, con l'elenco di parole dell'app (paroleSql.ts).
//
// Perché non si usa direttamente `PostgreSQL` di @codemirror/lang-sql:
// - le sue liste contengono centinaia di parole che non servono a scrivere interrogazioni (e finirebbero
//   nell'autocompletamento), mentre funzioni come COUNT o AVG non sono distinte dalle parole chiave;
// - la libreria inserisce le virgolette attorno a ogni nome che non è tutto minuscolo (`Studente` →
//   `"Studente"`). In PostgreSQL un nome tra virgolette distingue le maiuscole, quindi `"Studente"` non
//   troverebbe la tabella `studente`: con `caseInsensitiveIdentifiers` le virgolette restano solo per i
//   nomi non semplici (spazi, trattini, accenti…).
import { PostgreSQL, SQLDialect, sql } from '@codemirror/lang-sql';
import { FUNZIONI_UNICHE, PAROLE_CHIAVE_UNICHE, TIPI } from './paroleSql';

export const DIALETTO_POSTGRES = SQLDialect.define({
  ...PostgreSQL.spec,
  keywords: PAROLE_CHIAVE_UNICHE.join(' '),
  types: TIPI.join(' '),
  builtin: FUNZIONI_UNICHE.join(' '),
  caseInsensitiveIdentifiers: true,
  identifierQuotes: '"',
});

export function estensioneSql(schema: Record<string, string[]> | null) {
  return sql({ dialect: DIALETTO_POSTGRES, upperCaseKeywords: true, schema: schema ?? undefined });
}
