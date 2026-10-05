import { describe, expect, it } from 'vitest';
import { controllaQuery, normalizzaVirgolette } from '../../src/sql/guard';
import { creaDatabase, esegui } from '../../src/sql/engine';
import { sqlJs } from './helpers';

const ok = (s: string) => controllaQuery(s).ok;

describe('guardia SELECT/WITH', () => {
  it('ammette SELECT e WITH, anche con commenti e ; finale', () => {
    expect(ok('SELECT * FROM t')).toBe(true);
    expect(ok('  select 1;  ')).toBe(true);
    expect(ok('-- commento\nSELECT 1;;')).toBe(true);
    expect(ok('/* x */ WITH a AS (SELECT 1) SELECT * FROM a')).toBe(true);
    expect(ok('WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x < 5) SELECT x FROM n')).toBe(true);
    expect(ok("SELECT replace(Nome, 'a', 'b') FROM t")).toBe(true);
    expect(ok("SELECT 'DELETE FROM t; DROP TABLE t' AS testo")).toBe(true);
  });

  it('blocca DML, DDL, PRAGMA, ATTACH e transazioni', () => {
    for (const q of ['DELETE FROM t', 'UPDATE t SET a=1', 'INSERT INTO t VALUES (1)', 'DROP TABLE t', 'CREATE TABLE x(a)',
      'PRAGMA query_only = OFF', "ATTACH 'x' AS y", 'BEGIN', 'ALTER TABLE t ADD c', 'VACUUM', 'REPLACE INTO t VALUES (1)']) {
      const r = controllaQuery(q);
      expect(r.ok, q).toBe(false);
      if (!r.ok) expect(r.messaggio).toMatch(/SELECT o WITH/);
    }
  });

  it('blocca WITH … DELETE/INSERT/UPDATE', () => {
    expect(ok('WITH a AS (SELECT 1) DELETE FROM t')).toBe(false);
    expect(ok('WITH a(x) AS (SELECT 1), b AS (SELECT 2) UPDATE t SET c = 1')).toBe(false);
    expect(ok('WITH a(x) AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a, b')).toBe(true);
  });

  it('blocca più istruzioni', () => {
    const r = controllaQuery('SELECT 1; DELETE FROM t');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.messaggio).toMatch(/una sola query/);
    expect(ok('SELECT 1; SELECT 2')).toBe(false);
  });

  it('messaggi per query vuota, stringa non chiusa', () => {
    expect(controllaQuery('   ')).toMatchObject({ ok: false, messaggio: expect.stringMatching(/Scrivi una query/) });
    expect(controllaQuery("SELECT 'abc")).toMatchObject({ ok: false, messaggio: expect.stringMatching(/Stringa non chiusa/) });
  });

  it('il database resta in sola lettura anche aggirando la guardia', async () => {
    const SQL = await sqlJs();
    const { db } = creaDatabase(SQL, ['CREATE TABLE t(a)', 'INSERT INTO t VALUES (1)']);
    expect(() => db.exec('DELETE FROM t')).toThrow(/readonly/);
    expect(esegui(db, 'SELECT COUNT(*) FROM t').righe).toEqual([[1]]);
  });

  it('normalizza virgolette e trattini tipografici', () => {
    expect(normalizzaVirgolette('SELECT * FROM t WHERE a = ‘x’ AND b = “y” —— c')).toBe('SELECT * FROM t WHERE a = \'x\' AND b = "y" ---- c');
  });
});
