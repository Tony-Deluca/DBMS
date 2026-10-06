// Diagnosi della modifica 3: query semanticamente corrette scritte in modo diverso dalla soluzione ufficiale.
// Questi test descrivono il comportamento voluto; prima della correzione i casi di colonne permutate
// e di ORDER BY su colonne non selezionate fallivano.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/sql/motore';
import { verifica } from '../../src/sql/engine';
import { creaDb } from './helpers';

let db: Db;
beforeAll(async () => {
  db = (await creaDb([
    'CREATE TABLE Reparto (Id INTEGER PRIMARY KEY, Nome TEXT NOT NULL)',
    'CREATE TABLE Dip (Id INTEGER PRIMARY KEY, Nome TEXT NOT NULL, Cognome TEXT NOT NULL, Stipendio REAL, Reparto INTEGER REFERENCES Reparto(Id))',
    "INSERT INTO Reparto VALUES (1,'Ricerca'),(2,'Vendite'),(3,'Vuoto')",
    `INSERT INTO Dip VALUES (1,'Anna','Rossi',2000,1),(2,'Bruno','Rossi',2000.0,1),(3,'Carla','Bianchi',3100.5,2),
      (4,'Dario','Verdi',NULL,2),(5,'Elena','Neri',1500,NULL),(6,'Anna','Rossi',2500,2)`,
  ])).db;
});

const ver = async (utente: string, soluzioni: string[]) => (await verifica(db, utente, soluzioni, 1000)).esito;

describe('query equivalenti accettate', () => {
  const uff = 'SELECT d.Cognome, d.Nome, r.Nome FROM Dip d JOIN Reparto r ON r.Id = d.Reparto';

  it('JOIN / IN / EXISTS', async () => {
    const uffR = 'SELECT r.Nome FROM Reparto r WHERE EXISTS (SELECT * FROM Dip d WHERE d.Reparto = r.Id)';
    expect((await ver('SELECT DISTINCT r.Nome FROM Reparto r JOIN Dip d ON d.Reparto = r.Id', [uffR])).corretta).toBe(true);
    expect((await ver('SELECT Nome FROM Reparto WHERE Id IN (SELECT Reparto FROM Dip)', [uffR])).corretta).toBe(true);
    expect((await ver('SELECT Nome FROM Reparto WHERE Id = ANY (SELECT Reparto FROM Dip)', [uffR])).corretta).toBe(true);
  });

  it('alias diversi e nomi di colonna ignorati', async () => {
    expect((await ver('SELECT x.Cognome AS c, x.Nome AS n, y.Nome AS rep FROM Dip x JOIN Reparto y ON y.Id = x.Reparto', [uff])).corretta).toBe(true);
  });

  it('1 contro 1.0, stipendi interi e reali', async () => {
    const e = (await ver('SELECT Id, CAST(Stipendio AS INTEGER) FROM Dip WHERE Stipendio = 2000', ['SELECT Id, Stipendio * 1.0 FROM Dip WHERE Stipendio = 2000']));
    expect(e.corretta).toBe(true);
    expect((await ver('SELECT 1', ['SELECT 1.0'])).corretta).toBe(true);
    expect((await ver('SELECT 2.0 / 2', ['SELECT 1'])).corretta).toBe(true);
  });

  it('colonne in ordine diverso dalla traccia: corretta con nota', async () => {
    const e = (await ver('SELECT r.Nome, d.Nome, d.Cognome FROM Reparto r JOIN Dip d ON d.Reparto = r.Id', [uff]));
    expect(e.corretta).toBe(true);
    expect(e.colonnePermutate).toBe(true);
    // ordine identico: nessuna nota
    expect((await ver(uff, [uff])).colonnePermutate).toBeFalsy();
  });

  it('colonne permutate con valori ripetuti in più colonne', async () => {
    const uffX = 'SELECT Stipendio, Stipendio + 0, Reparto, Id FROM Dip';
    const e = (await ver('SELECT Id, Reparto, Stipendio + 0, Stipendio FROM Dip', [uffX]));
    expect(e.corretta).toBe(true);
    expect(e.colonnePermutate).toBe(true);
  });

  it('colonne permutate ma righe diverse: errore', async () => {
    const e = (await ver('SELECT r.Nome, d.Nome, d.Cognome FROM Reparto r LEFT JOIN Dip d ON d.Reparto = r.Id', [uff]));
    expect(e.corretta).toBe(false);
    expect(e.differenza).toMatchObject({ tipo: 'righe' });
    expect(e.differenza).toHaveProperty('inPiu');
  });

  it('numero di colonne diverso e righe mancanti restano errori', async () => {
    expect((await ver('SELECT d.Cognome FROM Dip d', [uff])).differenza).toEqual({ tipo: 'colonne', attese: 3, ottenute: 1 });
    expect((await ver(`${uff} WHERE d.Id < 3`, [uff])).differenza).toMatchObject({ tipo: 'righe', mancanti: 3 });
  });
});

describe('ORDER BY', () => {
  it('senza ORDER BY nella soluzione l\'ordine delle righe è libero', async () => {
    expect((await ver('SELECT Id FROM Dip ORDER BY Id DESC', ['SELECT Id FROM Dip'])).corretta).toBe(true);
  });

  it('pareggi: ordine libero tra righe con la stessa chiave (chiave nel risultato)', async () => {
    const uff = 'SELECT Id, Stipendio FROM Dip WHERE Stipendio IS NOT NULL ORDER BY Stipendio';
    expect((await ver('SELECT Id, Stipendio FROM Dip WHERE Stipendio IS NOT NULL ORDER BY Stipendio, Id DESC', [uff])).corretta).toBe(true);
    expect((await ver('SELECT Id, Stipendio FROM Dip WHERE Stipendio IS NOT NULL ORDER BY Stipendio DESC', [uff])).differenza?.tipo).toBe('ordine');
  });

  it('ORDER BY su una colonna NON presente nel risultato: i pareggi restano liberi', async () => {
    // la soluzione ordina per Cognome (non selezionato): Anna Rossi / Bruno Rossi / Anna Rossi sono a pari merito
    const uff = 'SELECT Nome FROM Dip ORDER BY Cognome';
    expect((await ver('SELECT Nome FROM Dip ORDER BY Cognome, Id DESC', [uff])).corretta).toBe(true);
    expect((await ver('SELECT Nome FROM Dip ORDER BY Cognome, Nome', [uff])).corretta).toBe(true);
    const sbagliata = (await ver('SELECT Nome FROM Dip ORDER BY Cognome DESC', [uff]));
    expect(sbagliata.corretta).toBe(false);
    expect(sbagliata.differenza?.tipo).toBe('ordine');
  });

  it('ORDER BY con espressione e qualifica di tabella', async () => {
    const uff = 'SELECT d.Nome, r.Nome FROM Dip d JOIN Reparto r ON r.Id = d.Reparto ORDER BY d.Stipendio DESC';
    expect((await ver('SELECT d.Nome, r.Nome FROM Dip d JOIN Reparto r ON r.Id = d.Reparto ORDER BY d.Stipendio DESC, d.Id', [uff])).corretta).toBe(true);
    expect((await ver('SELECT d.Nome, r.Nome FROM Dip d JOIN Reparto r ON r.Id = d.Reparto ORDER BY d.Stipendio', [uff])).differenza?.tipo).toBe('ordine');
    const uff2 = 'SELECT Nome FROM Dip ORDER BY Stipendio * -1';
    expect((await ver('SELECT Nome FROM Dip ORDER BY -Stipendio, Id', [uff2])).corretta).toBe(true);
  });

  it('colonne permutate E ordinamento: l\'ordine si controlla comunque', async () => {
    const uff = 'SELECT Id, Stipendio FROM Dip WHERE Stipendio IS NOT NULL ORDER BY Stipendio, Id';
    expect((await ver('SELECT Stipendio, Id FROM Dip WHERE Stipendio IS NOT NULL ORDER BY Stipendio, Id', [uff]))).toMatchObject({ corretta: true, colonnePermutate: true });
    expect((await ver('SELECT Stipendio, Id FROM Dip WHERE Stipendio IS NOT NULL ORDER BY Id', [uff])).differenza?.tipo).toBe('ordine');
  });
});
