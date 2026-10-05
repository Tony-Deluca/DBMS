import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import { creaDatabase } from '../../src/sql/engine';
import { infoTabelle, paginaTabella } from '../../src/sql/dati';
import { leggiStruttura, type Struttura } from '../../src/sql/varianti';
import { leggiScenario, sqlJs } from './helpers';

const sc = leggiScenario();
let db: Database;
let st: Struttura;
beforeAll(async () => {
  db = creaDatabase(await sqlJs(), sc.database.statements).db;
  st = leggiStruttura(db, sc.logico);
});

describe('vista Dati: elenco tabelle', () => {
  it('numero di righe, PK e FK per ogni tabella', () => {
    const t = infoTabelle(db, st);
    expect(t.map((x) => [x.nome, x.righe])).toEqual([
      ['Corso', 13], ['CorsoDiLaurea', 4], ['Dipartimento', 4], ['Docente', 9], ['Esame', 33], ['Propedeuticita', 6], ['Studente', 14],
    ]);
    const esame = t.find((x) => x.nome === 'Esame')!;
    expect(esame.colonne.filter((c) => c.pk).map((c) => c.nome)).toEqual(['Studente', 'Corso']);
    const fk = esame.colonne.find((c) => c.nome === 'Studente')!.fk;
    expect(fk).toEqual([{ tabella: 'Studente', colonne: ['Studente'], rifColonne: ['Matricola'] }]);
    // chiave primaria che è anche chiave esterna, e due FK verso la stessa tabella
    const prop = t.find((x) => x.nome === 'Propedeuticita')!;
    expect(prop.colonne.map((c) => [c.nome, c.pk, c.fk.map((f) => f.tabella)])).toEqual([['Corso', true, ['Corso']], ['Propedeutico', true, ['Corso']]]);
    expect(t.find((x) => x.nome === 'Docente')!.colonne.find((c) => c.nome === 'Email')!.nullable).toBe(true);
  });
});

describe('vista Dati: pagine, filtro, salto', () => {
  it('paginazione: pagine consecutive, ultima pagina parziale, ordine stabile', () => {
    const p1 = paginaTabella(db, st, { tabella: 'Esame', offset: 0, limite: 10 });
    const p2 = paginaTabella(db, st, { tabella: 'Esame', offset: 10, limite: 10 });
    const p4 = paginaTabella(db, st, { tabella: 'Esame', offset: 30, limite: 10 });
    expect(p1.totale).toBe(33);
    expect(p1.righe).toHaveLength(10);
    expect(p4.righe).toHaveLength(3);
    expect(p1.righe[9]).not.toEqual(p2.righe[0]);
    expect(p1.colonne).toEqual(['Studente', 'Corso', 'Data', 'Voto', 'Lode']);
    expect(p1.righe[0]).toEqual([100001, 'INF01', '2024-01-20', 28, 0]);
  });

  it('ricerca in tutte le colonne, senza distinguere maiuscole/minuscole', () => {
    expect(paginaTabella(db, st, { tabella: 'Studente', offset: 0, limite: 50, testo: 'rossi' }).totale).toBe(2);
    expect(paginaTabella(db, st, { tabella: 'Studente', offset: 0, limite: 50, testo: 'lecce' }).righe.map((r) => r[0])).toEqual([100002, 100011]);
    expect(paginaTabella(db, st, { tabella: 'Esame', offset: 0, limite: 50, testo: '2025' }).totale).toBe(2);
    // i caratteri speciali di LIKE sono letterali
    expect(paginaTabella(db, st, { tabella: 'Studente', offset: 0, limite: 50, testo: '%' }).totale).toBe(0);
    expect(paginaTabella(db, st, { tabella: 'Studente', offset: 0, limite: 50, testo: "'; DROP TABLE Studente; --" }).totale).toBe(0);
    expect(Number(db.exec('SELECT COUNT(*) FROM Studente')[0].values[0][0])).toBe(14);
  });

  it('la ricerca «null» trova i valori NULL; NULL e stringa vuota restano distinti', () => {
    const nulli = paginaTabella(db, st, { tabella: 'Studente', offset: 0, limite: 50, testo: 'null' });
    expect(nulli.totale).toBe(4);
    expect(nulli.righe.every((r) => r.includes(null))).toBe(true);
  });

  it('salto alla riga referenziata (uguaglianza esatta, anche su più colonne) e NULL', () => {
    const p = paginaTabella(db, st, { tabella: 'Studente', offset: 0, limite: 50, uguali: [{ colonna: 'Matricola', valore: 100003 }] });
    expect(p.righe).toHaveLength(1);
    expect(p.righe[0][2]).toBe('Conti');
    const doc = paginaTabella(db, st, { tabella: 'Docente', offset: 0, limite: 50, uguali: [{ colonna: 'Dipartimento', valore: null }] });
    expect(doc.righe.map((r) => r[0])).toEqual(['D09']);
    const comp = paginaTabella(db, st, { tabella: 'Esame', offset: 0, limite: 50, uguali: [{ colonna: 'Studente', valore: 100001 }, { colonna: 'Corso', valore: 'INF02' }] });
    expect(comp.righe).toHaveLength(1);
    // filtro combinato con la ricerca
    expect(paginaTabella(db, st, { tabella: 'Esame', offset: 0, limite: 50, uguali: [{ colonna: 'Studente', valore: 100001 }], testo: '2025' }).totale).toBe(1);
  });

  it('nomi non validi vengono rifiutati (nessuna iniezione dall\'interfaccia)', () => {
    expect(() => paginaTabella(db, st, { tabella: 'Studente; DROP TABLE Studente', offset: 0, limite: 5 })).toThrow(/non esiste/);
    expect(() => paginaTabella(db, st, { tabella: 'Studente', offset: 0, limite: 5, uguali: [{ colonna: 'x" OR 1=1 --', valore: 1 }] })).toThrow(/non esiste/);
  });

  it('con migliaia di righe: pagina e filtro restano rapidi', async () => {
    const SQL = await sqlJs();
    const righe = Array.from({ length: 6000 }, (_, i) => `(${i}, 'nome ${i}', ${i % 7 === 0 ? 'NULL' : `'v${i % 50}'`})`);
    const { db: grande } = creaDatabase(SQL, ['CREATE TABLE G (Id INTEGER PRIMARY KEY, Nome TEXT, Altro TEXT)', `INSERT INTO G VALUES ${righe.join(',')}`]);
    const stg = leggiStruttura(grande, null);
    const t0 = performance.now();
    const p = paginaTabella(grande, stg, { tabella: 'G', offset: 5900, limite: 100 });
    const f = paginaTabella(grande, stg, { tabella: 'G', offset: 0, limite: 100, testo: 'v49' });
    const ms = performance.now() - t0;
    expect(p.righe).toHaveLength(100);
    expect(p.totale).toBe(6000);
    expect(f.totale).toBeGreaterThan(0);
    expect(ms).toBeLessThan(300);
  });
});
