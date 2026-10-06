import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/sql/motore';
import { verifica } from '../../src/sql/engine';
import { confrontaRisultati, differenzaMultiinsiemi, messaggiFeedback, riferimentoDaRisultato, valoriUguali } from '../../src/sql/compare';
import { colonneOrdinamento, orderByEsterno } from '../../src/sql/orderBy';
import { creaDb } from './helpers';

let db: Db;

beforeAll(async () => {
  db = (await creaDb([
    'CREATE TABLE Autore (Id INTEGER PRIMARY KEY, Nome TEXT NOT NULL, Nazione TEXT)',
    'CREATE TABLE Libro (Isbn TEXT PRIMARY KEY, Titolo TEXT NOT NULL, Anno INTEGER, Prezzo NUMERIC(6,2), Autore INTEGER REFERENCES Autore(Id))',
    'CREATE TABLE Prestito (Id INTEGER PRIMARY KEY, Libro TEXT REFERENCES Libro(Isbn), Utente TEXT)',
    "INSERT INTO Autore VALUES (1,'Calvino','IT'),(2,'Eco','IT'),(3,'Orwell','UK'),(4,'Anonimo',NULL)",
    `INSERT INTO Libro VALUES
      ('A','Il barone rampante',1957,12.5,1),('B','Le città invisibili',1972,10.0,1),
      ('C','Il nome della rosa',1980,15.9,2),('D','1984',1949,9.9,3),('E','Senza autore',2000,NULL,NULL),
      ('F','La fattoria degli animali',1945,9.9,3)`,
    "INSERT INTO Prestito VALUES (1,'A','anna'),(2,'A','bruno'),(3,'C','anna'),(4,'D','carla'),(5,'D','anna')",
  ])).db;
});

const ver = async (utente: string, soluzioni: string[]) => (await verifica(db, utente, soluzioni, 1000)).esito;

describe('verifica per risultato (non per testo)', () => {
  const ufficiale = 'SELECT l.Titolo FROM Libro l JOIN Autore a ON a.Id = l.Autore WHERE a.Nazione = \'IT\'';

  it('query corretta identica', async () => {
    expect((await ver(ufficiale, [ufficiale])).corretta).toBe(true);
  });

  it('query corretta in forma alternativa: sottoquery IN, EXISTS, alias diversi', async () => {
    expect((await ver("SELECT Titolo AS t FROM Libro WHERE Autore IN (SELECT Id FROM Autore WHERE Nazione = 'IT')", [ufficiale])).corretta).toBe(true);
    expect((await ver("select titolo from libro l where exists (select * from autore a where a.id = l.autore and a.nazione = 'IT');", [ufficiale])).corretta).toBe(true);
  });

  it('i nomi delle colonne vengono ignorati, l\'ordine delle righe no se manca ORDER BY', async () => {
    expect((await ver("SELECT Titolo AS Qualcosa FROM Libro WHERE Autore IN (1,2) ORDER BY Titolo DESC", [ufficiale])).corretta).toBe(true);
  });

  it('numero di colonne diverso', async () => {
    const e = (await ver("SELECT Titolo, Anno FROM Libro WHERE Autore IN (1,2)", [ufficiale]));
    expect(e.corretta).toBe(false);
    expect(e.differenza).toEqual({ tipo: 'colonne', attese: 1, ottenute: 2 });
    expect(messaggiFeedback(e.differenza!)[0]).toContain('1 colonna');
  });

  it('righe mancanti, con esempio', async () => {
    const e = (await ver('SELECT Titolo FROM Libro WHERE Autore = 1', [ufficiale]));
    expect(e.corretta).toBe(false);
    expect(e.differenza).toMatchObject({ tipo: 'righe', mancanti: 1, inPiu: 0, esempioMancante: ['Il nome della rosa'] });
    expect(messaggiFeedback(e.differenza!).join(' ')).toContain("Mancano 1 riga, ad esempio ('Il nome della rosa')");
  });

  it('righe in più (anche per i NULL: una condizione su NULL non è mai vera)', async () => {
    const e = (await ver("SELECT Titolo FROM Libro l LEFT JOIN Autore a ON a.Id = l.Autore WHERE a.Nazione = 'IT' OR a.Nazione IS NULL", [ufficiale]));
    expect(e.differenza).toMatchObject({ tipo: 'righe', mancanti: 0, inPiu: 1, esempioInPiu: ['Senza autore'], inPiuDuplicati: false });
    expect(messaggiFeedback(e.differenza!).join(' ')).toContain('troppo permissive');
  });

  it('i duplicati contano (multiinsieme)', async () => {
    const uff = 'SELECT DISTINCT l.Titolo FROM Libro l JOIN Prestito p ON p.Libro = l.Isbn';
    const e = (await ver('SELECT l.Titolo FROM Libro l JOIN Prestito p ON p.Libro = l.Isbn', [uff]));
    expect(e.corretta).toBe(false);
    expect(e.differenza).toMatchObject({ tipo: 'righe', mancanti: 0, inPiu: 2, inPiuDuplicati: true });
    expect(messaggiFeedback(e.differenza!).join(' ')).toContain('DISTINCT');
  });

  it('ordine: conta solo se la soluzione ufficiale ha ORDER BY', async () => {
    const uff = 'SELECT Titolo, Anno FROM Libro ORDER BY Anno';
    expect((await ver('SELECT Titolo, Anno FROM Libro ORDER BY 2', [uff])).corretta).toBe(true);
    const e = (await ver('SELECT Titolo, Anno FROM Libro ORDER BY Anno DESC', [uff]));
    expect(e.corretta).toBe(false);
    expect(e.differenza).toEqual({ tipo: 'ordine', posizione: 1 });
    expect((await ver('SELECT Titolo, Anno FROM Libro', [uff])).differenza?.tipo).toBe('ordine');
  });

  it('ordine con pareggi: le righe a pari merito possono stare in qualunque ordine', async () => {
    const uff = 'SELECT Titolo, Prezzo FROM Libro WHERE Prezzo IS NOT NULL ORDER BY Prezzo';
    expect((await ver('SELECT Titolo, Prezzo FROM Libro WHERE Prezzo IS NOT NULL ORDER BY Prezzo, Titolo DESC', [uff])).corretta).toBe(true);
    expect((await ver('SELECT Titolo, Prezzo FROM Libro WHERE Prezzo IS NOT NULL ORDER BY Prezzo, Titolo ASC', [uff])).corretta).toBe(true);
  });

  it('un ORDER BY dentro una sottoquery non rende l\'ordine rilevante', async () => {
    const uff = 'SELECT Titolo FROM (SELECT Titolo FROM Libro ORDER BY Anno LIMIT 3)';
    expect(orderByEsterno(uff)).toBeNull();
    expect((await ver('SELECT Titolo FROM Libro WHERE Anno < 1960 ORDER BY Titolo', [uff])).corretta).toBe(true);
  });

  it('decimali confrontati con tolleranza', async () => {
    const uff = 'SELECT AVG(Prezzo) FROM Libro';
    expect((await ver('SELECT SUM(Prezzo) / COUNT(Prezzo) FROM Libro', [uff])).corretta).toBe(true);
    expect((await ver('SELECT ROUND(AVG(Prezzo), 0) FROM Libro', [uff])).corretta).toBe(false);
    expect(valoriUguali(0.1 + 0.2, 0.3)).toBe(true);
    expect(valoriUguali(3, 3.0000001)).toBe(true);
    expect(valoriUguali(3, 3.01)).toBe(false);
    expect(valoriUguali(null, 0)).toBe(false);
    expect(valoriUguali('3', 3)).toBe(false);
  });

  it('NULL è uguale a NULL nel confronto dei risultati', async () => {
    const uff = 'SELECT Nazione FROM Autore';
    expect((await ver('SELECT Nazione FROM Autore ORDER BY Id DESC', [uff])).corretta).toBe(true);
  });

  it('basta coincidere con una delle soluzioni (alternative non equivalenti tra loro)', async () => {
    const e = (await ver('SELECT Nome FROM Autore WHERE Nazione IS NOT NULL', ["SELECT Nome FROM Autore WHERE Nazione = 'IT'", 'SELECT Nome FROM Autore WHERE Nazione IS NOT NULL']));
    expect(e).toMatchObject({ corretta: true, indiceSoluzione: 1 });
  });

  it('se è sbagliata il feedback usa la soluzione più vicina', async () => {
    const e = (await ver('SELECT Nome FROM Autore', ['SELECT Nome, Nazione FROM Autore', "SELECT Nome FROM Autore WHERE Nazione = 'IT'"]));
    expect(e.corretta).toBe(false);
    expect(e.indiceSoluzione).toBe(1);
    expect(e.differenza?.tipo).toBe('righe');
  });

  it('errore SQL tradotto in italiano', async () => {
    await expect(ver('SELECT Titlo FROM Libro', ['SELECT Titolo FROM Libro'])).rejects.toThrow(/colonna «Titlo» non esiste/);
    await expect(ver('SELECT * FROM Libri', ['SELECT Titolo FROM Libro'])).rejects.toThrow(/tabella «Libri» non esiste/);
  });

  it('istruzioni di modifica bloccate', async () => {
    await expect(ver('DELETE FROM Libro', ['SELECT 1'])).rejects.toThrow(/non consentita/);
  });
});

describe('multiinsiemi e ORDER BY', () => {
  it('differenzaMultiinsiemi rispetta le molteplicità', async () => {
    const r = differenzaMultiinsiemi([[1], [1], [2]], [[1], [2], [2]]);
    expect(r).toEqual({ mancanti: [[1]], inPiu: [[2]] });
  });

  it('abbina con tolleranza anche numeri a cavallo dell\'arrotondamento', async () => {
    const r = differenzaMultiinsiemi([[0.1234567885]], [[0.1234567884999]]);
    expect(r).toEqual({ mancanti: [], inPiu: [] });
  });

  it('riconosce le voci dell\'ORDER BY esterno', async () => {
    expect(orderByEsterno('SELECT a, b FROM t ORDER BY a DESC, t.b ASC LIMIT 3')).toEqual([
      { espressione: 'a', discendente: true },
      { espressione: 't.b', discendente: false },
    ]);
    expect(orderByEsterno("SELECT 'order by x' FROM t -- order by y")).toBeNull();
    expect(orderByEsterno('SELECT a FROM t UNION SELECT a FROM u ORDER BY 1')).toEqual([{ espressione: '1', discendente: false }]);
  });

  it('mappa le voci alle colonne del risultato', async () => {
    expect(colonneOrdinamento([{ espressione: 'Media', discendente: true }], ['Matricola', 'Media'])).toEqual([1]);
    expect(colonneOrdinamento([{ espressione: '2', discendente: false }], ['a', 'b'])).toEqual([1]);
    expect(colonneOrdinamento([{ espressione: 'x + 1', discendente: false }], ['a'])).toBeNull();
    expect(colonneOrdinamento([{ espressione: 's.Nome', discendente: false }], ['Nome', 'Nome'])).toBeNull();
  });

  it('confronto ordinato con espressione non riconducibile: confronta le righe intere', async () => {
    const atteso = { colonne: ['a'], righe: [[1], [2]] };
    // senza accesso al database le chiavi di «a * -1» non si conoscono: confronto rigido
    const rif = riferimentoDaRisultato('SELECT a FROM t ORDER BY a * -1', atteso);
    expect(rif.ordine).toEqual({ tipo: 'rigido' });
    expect(confrontaRisultati(rif, { colonne: ['a'], righe: [[2], [1]] }).uguale).toBe(false);
    expect(confrontaRisultati(rif, { colonne: ['a'], righe: [[1], [2]] }).uguale).toBe(true);
  });
});
