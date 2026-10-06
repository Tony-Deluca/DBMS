// Confronti quantificati ALL / ANY / SOME (non supportati da SQLite, motivo del passaggio a PostgreSQL).
// I risultati del motore si confrontano con quelli attesi dallo standard SQL, logica a tre valori compresa.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/sql/motore';
import { esegui, verifica } from '../../src/sql/engine';
import { verificaCompleta } from '../../src/sql/verificaRobusta';
import { VariantiDB, type Struttura } from '../../src/sql/varianti';
import { creaDb } from './helpers';

type V = boolean | null; // vero, falso, sconosciuto
const OPERATORI = ['=', '<>', '<', '<=', '>', '>='] as const;
const confronta = (a: number | null, op: (typeof OPERATORI)[number], b: number | null): V => {
  if (a === null || b === null) return null;
  return { '=': a === b, '<>': a !== b, '<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b }[op];
};
/** x op ALL (S): falso se un confronto è falso; altrimenti sconosciuto se uno è sconosciuto; altrimenti vero (anche con S vuoto). */
const tutti = (x: number | null, op: (typeof OPERATORI)[number], s: (number | null)[]): V => {
  const r = s.map((v) => confronta(x, op, v));
  return r.includes(false) ? false : r.includes(null) ? null : true;
};
/** x op ANY (S): vero se un confronto è vero; altrimenti sconosciuto se uno è sconosciuto; altrimenti falso (anche con S vuoto). */
const qualcuno = (x: number | null, op: (typeof OPERATORI)[number], s: (number | null)[]): V => {
  const r = s.map((v) => confronta(x, op, v));
  return r.includes(true) ? true : r.includes(null) ? null : false;
};

const INSIEMI: (number | null)[][] = [[], [3], [5], [7], [3, 7], [3, 5, 7], [3, null], [5, null], [7, null], [null], [5, 5]];
const SINISTRA: (number | null)[] = [5, null];

let db: Db;
let st: Struttura;
beforeAll(async () => {
  const valori = INSIEMI.flatMap((s, g) => s.map((v) => `(${g}, ${v === null ? 'NULL' : v})`));
  ({ db, struttura: st } = await creaDb([
    'CREATE TABLE S (Gruppo INTEGER NOT NULL, V INTEGER)',
    `INSERT INTO S VALUES ${valori.join(', ')}`,
    'CREATE TABLE Studente (Matricola INTEGER PRIMARY KEY, Nome TEXT NOT NULL)',
    'CREATE TABLE Esame (Matricola INTEGER NOT NULL REFERENCES Studente(Matricola), Corso TEXT NOT NULL, Voto INTEGER, PRIMARY KEY (Matricola, Corso))',
    "INSERT INTO Studente VALUES (1, 'Anna'), (2, 'Bruno'), (3, 'Carla'), (4, 'Dario'), (5, 'Elena')",
    "INSERT INTO Esame VALUES (1, 'A', 30), (1, 'B', 28), (2, 'A', 25), (2, 'B', 30), (3, 'A', 30), (3, 'B', 30), (4, 'A', 18), (5, 'A', NULL)",
  ]));
});

const valore = (x: unknown): V => (x === null ? null : x === 'true');

describe('ALL / ANY / SOME secondo lo standard (tutti gli operatori, insiemi vuoti, NULL)', () => {
  for (const quant of ['ALL', 'ANY', 'SOME'] as const) {
    it(`x op ${quant} (sottoquery) nella lista del SELECT: vero, falso o NULL come da standard`, async () => {
      for (const x of SINISTRA) {
        for (const op of OPERATORI) {
          const colonne = INSIEMI.map((_, g) => `(${x === null ? 'CAST(NULL AS INTEGER)' : x} ${op} ${quant} (SELECT V FROM S WHERE Gruppo = ${g}))`);
          const r = await esegui(db, `SELECT ${colonne.join(', ')}`);
          const ottenuti = r.righe[0].map(valore);
          const attesi = INSIEMI.map((s) => (quant === 'ALL' ? tutti(x, op, s) : qualcuno(x, op, s)));
          expect(ottenuti, `${x} ${op} ${quant}`).toEqual(attesi);
        }
      }
    });
  }

  it('casi notevoli: > ALL (vuoto) è vero, = ANY (vuoto) è falso, <> ALL con un NULL non è mai vero', async () => {
    const r = await esegui(db, `SELECT 5 > ALL (SELECT V FROM S WHERE Gruppo = 0), 5 = ANY (SELECT V FROM S WHERE Gruppo = 0),
      1 <> ALL (SELECT V FROM S WHERE Gruppo = 6), 5 = ANY (SELECT V FROM S WHERE Gruppo = 7), 1 = ANY (SELECT V FROM S WHERE Gruppo = 7)`);
    expect(r.righe[0]).toEqual(['true', 'false', null, 'true', null]);
  });

  it('in WHERE: solo le righe con condizione VERA (né falsa né sconosciuta)', async () => {
    const r = await esegui(db, 'SELECT Matricola FROM Studente WHERE Matricola = ANY (SELECT Matricola FROM Esame WHERE Voto = 30) ORDER BY 1');
    expect(r.righe).toEqual([[1], [2], [3]]);
    const s = await esegui(db, 'SELECT Matricola FROM Studente WHERE Matricola = SOME (SELECT Matricola FROM Esame WHERE Voto = 30) ORDER BY 1');
    expect(s.righe).toEqual(r.righe);
    // il voto NULL di Elena rende sconosciuto «>= ALL»: nessuno lo soddisfa
    expect((await esegui(db, 'SELECT Matricola FROM Esame WHERE Voto >= ALL (SELECT Voto FROM Esame)')).righe).toEqual([]);
    expect((await esegui(db, 'SELECT DISTINCT Matricola FROM Esame WHERE Voto >= ALL (SELECT Voto FROM Esame WHERE Voto IS NOT NULL) ORDER BY 1')).righe).toEqual([[1], [2], [3]]);
  });

  it('in HAVING, con la query della traccia (media più alta)', async () => {
    const q = 'SELECT Matricola FROM Esame GROUP BY Matricola HAVING AVG(Voto) >= ALL (SELECT AVG(Voto) FROM Esame GROUP BY Matricola)';
    // la media di Elena è NULL: la sottoquery contiene un NULL e nessuna media è «>= ALL»
    expect((await esegui(db, q)).righe).toEqual([]);
    const q2 = 'SELECT Matricola FROM Esame GROUP BY Matricola HAVING AVG(Voto) >= ALL (SELECT AVG(Voto) FROM Esame WHERE Voto IS NOT NULL GROUP BY Matricola)';
    expect((await esegui(db, q2)).righe).toEqual([[3]]);
  });

  it('sottoquery correlate', async () => {
    // studenti con un voto maggiore di tutti gli altri loro voti (correlata) e < ANY dei voti di un altro studente
    const r = await esegui(db, `SELECT e.Matricola, e.Corso FROM Esame e
      WHERE e.Voto > ALL (SELECT e2.Voto FROM Esame e2 WHERE e2.Matricola = e.Matricola AND e2.Corso <> e.Corso) ORDER BY 1, 2`);
    // Anna (30 > 28), Bruno (30 > 25); Carla ha 30 e 30 (non strettamente maggiore); Dario ed Elena hanno un solo esame (insieme vuoto → vero)
    expect(r.righe).toEqual([[1, 'A'], [2, 'B'], [4, 'A'], [5, 'A']]);
    const s = await esegui(db, `SELECT s.Nome FROM Studente s WHERE 30 = ANY (SELECT e.Voto FROM Esame e WHERE e.Matricola = s.Matricola) ORDER BY 1`);
    expect(s.righe).toEqual([['Anna'], ['Bruno'], ['Carla']]);
  });

  it('verifica: una soluzione con >= ALL e una equivalente con MAX sono entrambe corrette, anche sui database di prova', async () => {
    const tutte = 'SELECT Matricola FROM Esame WHERE Voto IS NOT NULL GROUP BY Matricola HAVING AVG(Voto) >= ALL (SELECT AVG(Voto) FROM Esame WHERE Voto IS NOT NULL GROUP BY Matricola)';
    const massimo = 'SELECT Matricola FROM Esame WHERE Voto IS NOT NULL GROUP BY Matricola HAVING AVG(Voto) = (SELECT MAX(m) FROM (SELECT AVG(Voto) AS m FROM Esame WHERE Voto IS NOT NULL GROUP BY Matricola) t)';
    expect((await verifica(db, massimo, [tutte], 100)).esito.corretta).toBe(true);
    expect((await verifica(db, tutte, [massimo], 100)).esito.corretta).toBe(true);
    const varianti = new VariantiDB(db, st, `${db.schema}_v`);
    const e1 = (await verificaCompleta(db, varianti, massimo, [tutte], 100)).esito;
    expect(e1).toMatchObject({ corretta: true, soloDatiOriginali: false });
    expect(e1.databaseDiProva).toBeGreaterThan(0);
    expect((await verificaCompleta(db, varianti, tutte, [massimo], 100)).esito.corretta).toBe(true);
    await varianti.chiudi();
  });
});
