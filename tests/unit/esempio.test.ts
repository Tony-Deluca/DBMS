import { describe, expect, it } from 'vitest';
import { creaDatabase, esegui, provaScenario, violazioniFK } from '../../src/sql/engine';
import { validaScenario } from '../../src/scenario/validate';
import { verificaControSoluzioni } from '../../src/sql/compare';
import { leggiScenario, sqlJs } from './helpers';

const scenario = leggiScenario();

describe('scenario di esempio «Università»', () => {
  it('supera la validazione strutturale senza errori né avvisi', () => {
    expect(validaScenario(structuredClone(scenario))).toEqual([]);
  });

  it('ha almeno 5 tabelle e 8 esercizi di difficoltà non decrescente', () => {
    expect(scenario.logico.tabelle.length).toBeGreaterThanOrEqual(5);
    expect(scenario.esercizi.length).toBe(8);
    const d = scenario.esercizi.map((e) => e.difficolta);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it('crea il database senza errori e senza violazioni di chiavi esterne', async () => {
    const SQL = await sqlJs();
    const { db, errore } = creaDatabase(SQL, scenario.database.statements);
    expect(errore).toBeUndefined();
    expect(violazioniFK(db)).toEqual([]);
    db.close();
  });

  it('ogni soluzione è eseguibile, non vuota, e le alternative sono equivalenti', async () => {
    const SQL = await sqlJs();
    const problemi = provaScenario(
      SQL,
      scenario.database.statements,
      scenario.esercizi,
      scenario.logico.tabelle.map((t) => t.nome),
    );
    expect(problemi).toEqual([]);
  });

  it('i risultati attesi corrispondono a quelli progettati', async () => {
    const SQL = await sqlJs();
    const { db } = creaDatabase(SQL, scenario.database.statements);
    const righe = (id: string) => esegui(db, scenario.esercizi.find((e) => e.id === id)!.soluzioni[0]).righe;
    expect(righe('E1').length).toBe(8);
    expect(righe('E2').length).toBe(6);
    expect(righe('E3').map((r) => r[0]).sort()).toEqual([100001, 100003, 100004, 100006, 100009, 100012]);
    expect(righe('E4').length).toBe(13);
    expect(righe('E5').map((r) => r[0])).toEqual([100009, 100003, 100001, 100014]);
    expect(righe('E6').map((r) => r[0]).sort()).toEqual(['D01', 'D02', 'D04', 'D05', 'D09']);
    expect(righe('E7').map((r) => r[0]).sort()).toEqual(['D06', 'D07']);
    expect(righe('E8').map((r) => r[0]).sort()).toEqual([100001, 100002, 100006, 100007, 100009, 100010, 100014]);
    db.close();
  });

  it('le trappole previste danno feedback di errore (NOT IN con NULL, COUNT(*) con LEFT JOIN, join senza DISTINCT)', async () => {
    const SQL = await sqlJs();
    const { db } = creaDatabase(SQL, scenario.database.statements);
    const prova = (id: string, sql: string) => {
      const es = scenario.esercizi.find((e) => e.id === id)!;
      const sol = es.soluzioni.map((s) => ({ sql: s, risultato: esegui(db, s) }));
      return verificaControSoluzioni(sol, esegui(db, sql));
    };
    const e7 = prova('E7', 'SELECT Matricola, Cognome, Nome FROM Docente WHERE Matricola NOT IN (SELECT Docente FROM Corso)');
    expect(e7.corretta).toBe(false);
    expect(e7.differenza).toMatchObject({ tipo: 'righe', mancanti: 2, inPiu: 0 });

    const e4 = prova('E4', 'SELECT c.Codice, c.Nome, COUNT(*), AVG(e.Voto) FROM Corso c LEFT JOIN Esame e ON e.Corso = c.Codice GROUP BY c.Codice, c.Nome');
    expect(e4.corretta).toBe(false);
    expect(e4.differenza).toMatchObject({ tipo: 'righe', mancanti: 2, inPiu: 2 });

    const e6 = prova('E6', 'SELECT d.Matricola, d.Cognome, d.Nome FROM Docente d JOIN Corso c ON c.Docente = d.Matricola WHERE c.CFU > (SELECT AVG(CFU) FROM Corso)');
    expect(e6.corretta).toBe(false);
    expect(e6.differenza).toMatchObject({ tipo: 'righe', mancanti: 0 });

    // E1 ha due «Rossi Marco» a pari merito: entrambi gli ordini sono accettati
    const e1 = prova('E1', 'SELECT Matricola, Cognome, Nome FROM Studente WHERE AnnoIscrizione >= 2023 ORDER BY Cognome, Nome, Matricola DESC');
    expect(e1.corretta).toBe(true);
    db.close();
  });
});
