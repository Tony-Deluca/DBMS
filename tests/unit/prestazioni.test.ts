import { describe, expect, it } from 'vitest';
import { esegui, verifica } from '../../src/sql/engine';
import { calcolaLayoutLogico } from '../../src/diagram/logicalLayout';
import { creaDb, motoreTest } from './helpers';

describe('prestazioni con 10 tabelle e migliaia di righe (PostgreSQL)', () => {
  it('carica, interroga e verifica in tempi brevi', async () => {
    await motoreTest();
    const statements: string[] = [];
    for (let t = 0; t < 10; t++) {
      statements.push(`CREATE TABLE T${t} (Id INTEGER PRIMARY KEY, Nome TEXT, Valore NUMERIC(8,3), Rif INTEGER${t > 0 ? ` REFERENCES T${t - 1}(Id)` : ''})`);
    }
    for (let t = 0; t < 10; t++) {
      const righe = Array.from({ length: 500 }, (_, i) => `(${i}, 'nome ${t}-${i}', ${(i * 1.37) % 97}, ${i % 400})`);
      statements.push(`INSERT INTO T${t} VALUES ${righe.join(',')}`);
    }
    const t0 = performance.now();
    const { db } = await creaDb(statements);
    const caricamento = performance.now() - t0;

    const q = 'SELECT a.Rif, COUNT(*), AVG(b.Valore) FROM T3 a JOIN T4 b ON b.Rif = a.Id GROUP BY a.Rif ORDER BY a.Rif';
    const t1 = performance.now();
    const r = await esegui(db, q);
    const v = await verifica(db, 'SELECT a.Rif, COUNT(b.Id), SUM(b.Valore) / COUNT(*) FROM T4 b JOIN T3 a ON a.Id = b.Rif GROUP BY 1 ORDER BY 1', [q], 2000);
    const interrogazione = performance.now() - t1;
    expect(r.righe.length).toBeGreaterThan(100);
    expect(v.esito.corretta).toBe(true);
    expect(caricamento).toBeLessThan(1500);
    expect(interrogazione).toBeLessThan(1500);

    const t2 = performance.now();
    calcolaLayoutLogico({
      tabelle: Array.from({ length: 10 }, (_, t) => ({
        nome: `T${t}`,
        colonne: [{ nome: 'Id', tipo: 'INTEGER' }, { nome: 'Nome', tipo: 'TEXT' }, { nome: 'Valore', tipo: 'REAL' }, { nome: 'Rif', tipo: 'INTEGER' }],
        chiavePrimaria: ['Id'],
        chiaviEsterne: t > 0 ? [{ colonne: ['Rif'], tabella: `T${t - 1}`, riferimenti: ['Id'] }] : [],
      })),
    });
    expect(performance.now() - t2).toBeLessThan(500);
  });
});
