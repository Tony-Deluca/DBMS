// Comportamenti legati al motore PostgreSQL: tipi restituiti e confronto dei risultati, blocco delle
// istruzioni di modifica, messaggi d'errore in italiano, parole SQL di editor e soluzioni.
import { beforeAll, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight';
import type { Db } from '../../src/sql/motore';
import { esegui, verifica } from '../../src/sql/engine';
import { controllaQuery } from '../../src/sql/guard';
import { estensioneSql } from '../../src/editor/dialetto';
import { categoriaParola, FUNZIONI } from '../../src/editor/paroleSql';
import { creaDb } from './helpers';

let db: Db;
beforeAll(async () => {
  ({ db } = await creaDb([
    'CREATE TABLE T (Id INTEGER PRIMARY KEY, Prezzo NUMERIC(8,2), Grande BIGINT, Reale DOUBLE PRECISION, Giorno DATE, Ok BOOLEAN, Nome VARCHAR(20))',
    "INSERT INTO T VALUES (1, 10.50, 10000000000, 0.1, '2024-03-01', TRUE, 'Anna'), (2, 3, 2, 2.5, NULL, FALSE, ''), (3, NULL, NULL, NULL, '2024-12-31', NULL, NULL)",
  ]));
});

describe('tipi restituiti e confronto dei risultati', () => {
  it('NUMERIC e BIGINT come numeri, date come testo, booleani come true/false', async () => {
    const r = await esegui(db, 'SELECT Prezzo, Grande, Reale, Giorno, Ok, Nome, COUNT(*) OVER (), AVG(Prezzo) OVER () FROM T ORDER BY Id');
    expect(r.righe[0]).toEqual([10.5, 10000000000, 0.1, '2024-03-01', 'true', 'Anna', 3, 6.75]);
    expect(r.righe[1]).toEqual([3, 2, 2.5, null, 'false', '', 3, 6.75]);
    expect(r.righe[2]).toEqual([null, null, null, '2024-12-31', null, null, 3, 6.75]);
  });

  it('1 contro 1.0, numeric contro intero, decimali con tolleranza, NULL uguale a NULL', async () => {
    const ok = async (u: string, s: string) => (await verifica(db, u, [s], 100)).esito.corretta;
    expect(await ok('SELECT 1', 'SELECT 1.0')).toBe(true);
    expect(await ok('SELECT CAST(3 AS NUMERIC(5,2))', 'SELECT 3')).toBe(true);
    expect(await ok('SELECT Grande FROM T', 'SELECT Grande * 1.0 FROM T')).toBe(true);
    expect(await ok('SELECT AVG(Prezzo) FROM T', 'SELECT SUM(Prezzo) / COUNT(Prezzo) FROM T')).toBe(true);
    expect(await ok('SELECT 10.0 / 3', 'SELECT 3.3333333')).toBe(true);
    expect(await ok('SELECT 10.0 / 3', 'SELECT 3.34')).toBe(false);
    expect(await ok('SELECT Giorno FROM T', "SELECT Giorno FROM T WHERE Giorno IS NULL UNION ALL SELECT Giorno FROM T WHERE Giorno IS NOT NULL")).toBe(true);
    // la divisione tra interi resta intera, come in SQLite
    expect((await esegui(db, 'SELECT 7 / 2, 7.0 / 2')).righe).toEqual([[3, 3.5]]);
  });

  it('nomi delle colonne come scritti nella query (PostgreSQL li scriverebbe in minuscolo)', async () => {
    const r = await esegui(db, 'SELECT Id, Nome AS NomeCompleto, AVG(Prezzo) AS PrezzoMedio, COUNT(*) FROM T GROUP BY Id, Nome');
    expect(r.colonne).toEqual(['Id', 'NomeCompleto', 'PrezzoMedio', 'COUNT']);
  });
});

describe('solo lettura', () => {
  const vietata = (s: string) => {
    const g = controllaQuery(s);
    return !g.ok;
  };
  it('la guardia blocca modifiche, comandi di sessione e SELECT … INTO', () => {
    for (const s of [
      'INSERT INTO T VALUES (9)', 'UPDATE T SET Nome = 1', 'DELETE FROM T', 'TRUNCATE T', 'DROP TABLE T', 'CREATE TABLE X (a INT)',
      'ALTER TABLE T ADD c INT', 'COPY T TO STDOUT', 'SET search_path TO public', 'RESET ALL', 'BEGIN', 'COMMIT', 'DO $$ BEGIN END $$',
      'GRANT SELECT ON T TO PUBLIC', 'MERGE INTO T USING T u ON true WHEN MATCHED THEN DELETE', 'EXPLAIN SELECT 1', 'SHOW search_path',
      'WITH d AS (DELETE FROM T RETURNING *) SELECT * FROM d', 'WITH x AS (SELECT 1) DELETE FROM T', 'WITH d AS (UPDATE T SET Nome = NULL RETURNING Id) SELECT 1',
      'SELECT * INTO Copia FROM T', 'SELECT 1; DELETE FROM T',
    ]) {
      expect(vietata(s), s).toBe(true);
    }
  });

  it('la guardia ammette interrogazioni con stringhe e cast di PostgreSQL', () => {
    for (const s of ["SELECT 'DELETE FROM T'", "SELECT $$ ; DROP TABLE T $$", "SELECT E'it\\'s'", 'SELECT Prezzo::INTEGER FROM T', 'SELECT CAST(Prezzo AS INTEGER) FROM T', 'WITH x AS (SELECT 1 AS a) SELECT a FROM x']) {
      expect(controllaQuery(s).ok, s).toBe(true);
    }
  });

  it('anche aggirando la guardia, la transazione READ ONLY blocca le modifiche e il database resta intatto', async () => {
    for (const s of ['DELETE FROM T', 'UPDATE T SET Nome = NULL', 'CREATE TABLE X (a INT)', 'SELECT * INTO Copia FROM T']) {
      await expect(db.m.interroga(db.schema, s), s).rejects.toThrow(/read-only/);
    }
    expect((await esegui(db, 'SELECT COUNT(*) FROM T')).righe).toEqual([[3]]);
  });
});

describe('messaggi di errore in italiano, con posizione', () => {
  const errore = async (s: string) => {
    try {
      await esegui(db, s);
    } catch (e) {
      return (e as Error).message;
    }
    return '';
  };
  it('errori comuni', async () => {
    expect(await errore('SELECT Nme FROM T')).toMatch(/^La colonna «Nme» non esiste.*\[riga 1, colonna 8\]/);
    expect(await errore('SELECT * FROM Tabella')).toMatch(/La tabella «Tabella» non esiste/);
    expect(await errore('SELECT Nome FROM T WHERE Nome = = 1')).toMatch(/Errore di sintassi vicino a «=»/);
    expect(await errore('SELECT Nome FROM T WHERE')).toMatch(/incompleta/);
    expect(await errore('SELECT Nome, COUNT(*) FROM T')).toMatch(/La colonna «T\.Nome» deve comparire nel GROUP BY/i);
    expect(await errore('SELECT Nome FROM T WHERE COUNT(*) > 1')).toMatch(/non sono ammesse in WHERE: per filtrare sui gruppi usa HAVING/);
    expect(await errore("SELECT * FROM T WHERE Nome = 1")).toMatch(/Tipi incompatibili/);
    expect(await errore('SELECT 1 / 0')).toMatch(/Divisione per zero/);
    expect(await errore('SELECT (SELECT Id FROM T)')).toMatch(/più di una riga/);
    expect(await errore('SELECT Id FROM T WHERE Id = ANY (SELECT Id, Nome FROM T)')).toMatch(/più colonne/);
    expect(await errore('SELECT x.Id FROM T')).toMatch(/«x» non è una tabella né un alias/);
    expect(await errore('SELECT * FROM T, T')).toMatch(/compare due volte nel FROM/);
    expect(await errore('SELECT "Nome" FROM T')).toMatch(/non esiste.*apici/);
  });
});

describe('parole SQL dell\'editor: evidenziazione e autocompletamento', () => {
  const classi = (doc: string) => {
    const state = EditorState.create({ doc, extensions: [estensioneSql(null)] });
    const albero = ensureSyntaxTree(state, doc.length, 5000) ?? syntaxTree(state);
    const out = new Map<string, string>();
    const evid = tagHighlighter([
      { tag: t.keyword, class: 'kw' },
      { tag: t.standard(t.name), class: 'fn' },
      { tag: t.typeName, class: 'tipo' },
    ]);
    highlightTree(albero, evid, (da, a, cls) => out.set(doc.slice(da, a), cls));
    return out;
  };

  it('AVG e le altre funzioni sono colorate come funzioni, in maiuscolo e in minuscolo', () => {
    const c = classi('SELECT COUNT(*), avg(Voto), Sum(x), MIN(y), max(z), coalesce(a, 0), upper(n), extract(year FROM d) FROM t');
    for (const f of ['COUNT', 'avg', 'Sum', 'MIN', 'max', 'coalesce', 'upper', 'extract']) expect(c.get(f), f).toBe('fn');
  });

  it('parole chiave dell\'elenco, compresi ALL / ANY / SOME, in maiuscolo e minuscolo', () => {
    const c = classi('select distinct a from t where a >= all (select b from u) and b = ANY (select c from v) or c < some (select d from w) and exists (select 1) and a in (1) and a between 1 and 2 and a like \'x\' and a is null union select 1 intersect select 1 except select case when 1 then 2 end');
    for (const k of ['select', 'distinct', 'all', 'ANY', 'some', 'exists', 'in', 'between', 'like', 'is', 'union', 'intersect', 'except', 'case', 'when', 'then', 'end']) expect(c.get(k), k).toBe('kw');
  });

  it('l\'autocompletamento propone AVG e le altre parole anche scrivendo in minuscolo', async () => {
    const proposte = async (doc: string) => {
      const state = EditorState.create({ doc, extensions: [estensioneSql({ Esame: ['Voto'] })] });
      const fonti = state.languageDataAt<(c: CompletionContext) => CompletionResult | null | Promise<CompletionResult | null>>('autocomplete', doc.length);
      const out: string[] = [];
      for (const f of fonti) {
        const r = await f(new CompletionContext(state, doc.length, true));
        if (r) out.push(...r.options.map((o) => o.label));
      }
      return out;
    };
    for (const [scritto, atteso] of [['SELECT av', 'AVG'], ['SELECT AV', 'AVG'], ['select su', 'SUM'], ['SELECT * FROM Esame WHERE Voto >= al', 'ALL'], ['WHERE x = an', 'ANY'], ['WHERE x = so', 'SOME'], ['WHERE ex', 'EXISTS'], ['SELECT coal', 'COALESCE'], ['SELECT 1 inters', 'INTERSECT'], ['SELECT 1 exc', 'EXCEPT'], ['WHERE a betw', 'BETWEEN'], ['WHERE a IS nu', 'NULL']] as const) {
      expect(await proposte(scritto), scritto).toContain(atteso);
    }
    const tutte = await proposte('SELECT ');
    // niente comandi del terminale di SQLite tra le proposte
    for (const x of ['BACKUP', 'DUMP', 'QUIT', 'PRAGMA']) expect(tutte).not.toContain(x);
  });

  it('le soluzioni mostrate usano lo stesso elenco', () => {
    expect(categoriaParola('avg')).toBe('funzione');
    expect(categoriaParola('ALL')).toBe('chiave');
    expect(categoriaParola('Some')).toBe('chiave');
    expect(categoriaParola('integer')).toBe('tipo');
    expect(categoriaParola('Studente')).toBeNull();
    for (const f of ['count', 'sum', 'avg', 'min', 'max']) expect(FUNZIONI).toContain(f);
  });

  it('ogni funzione dell\'elenco esiste davvero in PostgreSQL', async () => {
    const r = await db.m.interna('pg_catalog', 'SELECT DISTINCT lower(proname) FROM pg_proc');
    const esistenti = new Set(r.righe.map((x) => String(x[0])));
    // funzioni che PostgreSQL tratta come sintassi speciale e non come voci di pg_proc
    const speciali = new Set(['extract', 'current_date', 'current_time', 'current_timestamp', 'localtime', 'localtimestamp', 'coalesce', 'nullif', 'greatest', 'least', 'substring', 'trim', 'position']);
    const mancanti = FUNZIONI.filter((f) => !esistenti.has(f) && !speciali.has(f));
    expect(mancanti).toEqual([]);
  });
});
