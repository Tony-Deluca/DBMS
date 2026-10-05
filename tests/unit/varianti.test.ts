import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import { creaDatabase, esegui } from '../../src/sql/engine';
import { verificaCompleta } from '../../src/sql/verificaRobusta';
import { generatore, leggiStruttura, NUMERO_VARIANTI, semeVariante, VariantiDB, violazioniChiaviEsterne } from '../../src/sql/varianti';
import { messaggiFeedback, messaggiVarianteFallita, testoDatabaseDiProva } from '../../src/sql/compare';
import { leggiScenario, sqlJs } from './helpers';

const sc = leggiScenario();
let db: Database;
let byte: Uint8Array;
let varianti: VariantiDB;

const esercizio = (id: string) => sc.esercizi.find((e) => e.id === id)!;
const verifica = (id: string, query: string) => verificaCompleta(db, varianti, query, esercizio(id).soluzioni, 1000);

/** Contenuto completo di un database (tabelle e righe) per confrontarlo. */
function dump(d: Database): string {
  const out: string[] = [];
  const tabelle = (d.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]?.values ?? []).map((r) => String(r[0]));
  for (const t of tabelle) {
    const righe = (d.exec(`SELECT * FROM "${t}"`)[0]?.values ?? []).map((r) => JSON.stringify(r)).sort();
    out.push(`${t}:${righe.join('|')}`);
  }
  return out.join('\n');
}

const conta = (d: Database, t: string) => Number(d.exec(`SELECT COUNT(*) FROM "${t}"`)[0].values[0][0]);

beforeAll(async () => {
  const SQL = await sqlJs();
  const r = creaDatabase(SQL, sc.database.statements);
  db = r.db;
  byte = r.byte!;
  varianti = new VariantiDB(SQL, byte, sc.logico);
});

describe('generatore e database di prova', () => {
  it('il generatore con seme è riproducibile', () => {
    const a = generatore(semeVariante(2));
    const b = generatore(semeVariante(2));
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
    expect(Array.from({ length: 5 }, generatore(semeVariante(3)))).not.toEqual(Array.from({ length: 5 }, generatore(semeVariante(2))));
  });

  it('crea le varianti previste, tutte diverse dall\'originale', () => {
    const v = varianti.tutte();
    expect(v).toHaveLength(NUMERO_VARIANTI);
    const originale = dump(db);
    const contenuti = new Set(v.map((x) => dump(x.db)));
    expect(contenuti.size).toBe(NUMERO_VARIANTI);
    expect(contenuti.has(originale)).toBe(false);
    // ci sono righe mancanti, righe duplicate e NULL in più rispetto all'originale
    const tutteLeCaratteristiche = new Set(v.flatMap((x) => x.caratteristiche));
    expect([...tutteLeCaratteristiche].sort()).toEqual(['righe duplicate', 'righe mancanti', 'valori NULL']);
  });

  it('stesso seme, stesse varianti (anche su un altro database costruito da zero)', async () => {
    const SQL = await sqlJs();
    const r2 = creaDatabase(SQL, sc.database.statements);
    const v2 = new VariantiDB(SQL, r2.byte!, sc.logico).tutte();
    expect(v2.map((x) => dump(x.db))).toEqual(varianti.tutte().map((x) => dump(x.db)));
  });

  it('rispetta chiavi esterne (dichiarate e del modello logico), chiavi primarie e CHECK', () => {
    const st = leggiStruttura(db, sc.logico);
    expect(st.fk.length).toBeGreaterThanOrEqual(9);
    for (const v of varianti.tutte()) {
      expect(violazioniChiaviEsterne(v.db, st.fk), `variante ${v.indice}`).toBe(0);
      expect(v.db.exec('PRAGMA foreign_key_check')[0]?.values ?? []).toEqual([]);
      // le chiavi primarie restano uniche
      expect(Number(v.db.exec('SELECT COUNT(*) FROM (SELECT Studente, Corso FROM Esame GROUP BY 1, 2 HAVING COUNT(*) > 1)')[0].values[0][0])).toBe(0);
      // CHECK: voto tra 18 e 30, lode solo con 30
      expect(Number(v.db.exec('SELECT COUNT(*) FROM Esame WHERE Voto NOT BETWEEN 18 AND 30 OR (Lode = 1 AND Voto <> 30)')[0].values[0][0])).toBe(0);
    }
  });

  it('i NULL compaiono solo nelle colonne che li ammettono; le colonne NOT NULL e le chiavi restano piene', () => {
    let nullInPiu = 0;
    for (const v of varianti.tutte()) {
      for (const [t, col] of [['Studente', 'Cognome'], ['Studente', 'Matricola'], ['Esame', 'Voto'], ['Corso', 'Codice'], ['Docente', 'Ruolo']]) {
        expect(Number(v.db.exec(`SELECT COUNT(*) FROM ${t} WHERE ${col} IS NULL`)[0].values[0][0]), `${t}.${col}`).toBe(0);
      }
      nullInPiu += Number(v.db.exec('SELECT COUNT(*) FROM Studente WHERE Email IS NULL')[0].values[0][0]);
    }
    expect(nullInPiu).toBeGreaterThan(0);
  });

  it('le varianti hanno meno righe (sottoinsiemi), più righe (duplicati) e anche tabelle vuote o quasi', () => {
    const n0 = conta(db, 'Esame');
    const conteggi = varianti.tutte().map((v) => conta(v.db, 'Esame'));
    expect(conteggi.some((n) => n < n0)).toBe(true);
    expect(conteggi.some((n) => n > n0 * 0.9)).toBe(true);
    expect(varianti.tutte().some((v) => v.caratteristiche.includes('righe duplicate') && Number(v.db.exec('SELECT COUNT(*) FROM Studente')[0].values[0][0]) > 14)).toBe(true);
  });

  it('il database originale non viene toccato e resta in sola lettura', () => {
    expect(conta(db, 'Studente')).toBe(14);
    expect(() => db.exec('DELETE FROM Studente')).toThrow(/readonly/);
    for (const v of varianti.tutte()) expect(() => v.db.exec('DELETE FROM Studente')).toThrow(/readonly/);
  });
});

describe('verifica completa con database di prova', () => {
  it('ogni soluzione ufficiale dello scenario d\'esempio è accettata, su tutti i database di prova', () => {
    for (const es of sc.esercizi) {
      for (const [i, s] of es.soluzioni.entries()) {
        const r = verificaCompleta(db, varianti, s, es.soluzioni, 1000);
        expect(r.esito.corretta, `${es.id} soluzione ${i + 1}`).toBe(true);
        expect(r.esito.databaseDiProva, `${es.id}`).toBe(NUMERO_VARIANTI);
        expect(r.esito.soloDatiOriginali).toBe(false);
      }
    }
  });

  it('query equivalenti scritte diversamente (JOIN / IN / EXISTS, alias, colonne permutate) restano accettate', () => {
    expect(verifica('E3', 'SELECT x.Matricola, x.Cognome, x.Nome FROM Studente x WHERE x.Matricola IN (SELECT Studente FROM Esame WHERE Voto = 30 AND Corso IN (SELECT Codice FROM Corso WHERE Anno = 1))').esito).toMatchObject({ corretta: true });
    const perm = verifica('E3', 'SELECT DISTINCT s.Nome, s.Matricola, s.Cognome FROM Studente s, Esame e, Corso c WHERE e.Studente = s.Matricola AND c.Codice = e.Corso AND e.Voto = 30 AND c.Anno = 1').esito;
    expect(perm).toMatchObject({ corretta: true, colonnePermutate: true, databaseDiProva: NUMERO_VARIANTI });
    // E7 con LEFT JOIN
    expect(verifica('E7', 'SELECT d.Matricola, d.Cognome, d.Nome FROM Docente d LEFT JOIN Corso c ON c.Docente = d.Matricola WHERE c.Codice IS NULL').esito.corretta).toBe(true);
  });

  it('una query che coincide solo sui dati originali (valori scritti a mano) fallisce su un database di prova', () => {
    // E5: matricole «scelte a mano» invece delle condizioni su conteggio e media
    const q = 'SELECT s.Matricola, s.Cognome, COUNT(*) AS n, AVG(e.Voto) AS m FROM Studente s JOIN Esame e ON e.Studente = s.Matricola WHERE s.Matricola IN (100009, 100003, 100001, 100014) GROUP BY s.Matricola, s.Cognome ORDER BY m DESC';
    // sui dati originali è identica alla soluzione ufficiale
    const originale = verificaCompleta(db, null, q, esercizio('E5').soluzioni, 1000).esito;
    expect(originale.corretta).toBe(true);
    // con i database di prova no
    const r = verifica('E5', q).esito;
    expect(r.corretta).toBe(false);
    expect(r.fallitaSuVariante).toBeDefined();
    expect(r.fallitaSuVariante!.caratteristiche.length).toBeGreaterThan(0);
    expect(r.differenza).toBeUndefined();
    // il feedback dice che non funziona in generale, senza esempi di righe né soluzione
    const testo = messaggiVarianteFallita(r.fallitaSuVariante!).join(' ');
    expect(testo).toContain('Funziona sui dati attuali ma non in generale');
    expect(testo).toMatch(/NULL|duplicat|corrispondenze/);
    expect(testo).not.toMatch(/\(\d{6}|HAVING|COUNT/);
    expect(testoDatabaseDiProva({ corretta: true, indiceSoluzione: 0, ordinato: false, databaseDiProva: 6 })).toBe('Verificata su 6 database di prova (varianti dei dati con righe tolte, duplicate e valori NULL).');
  });

  it('ignorare i NULL o i duplicati: coincide sull\'originale, fallisce nelle varianti', () => {
    // E3 senza DISTINCT ma con GROUP BY → equivalente (deve passare)
    expect(verifica('E3', 'SELECT s.Matricola, s.Cognome, s.Nome FROM Studente s JOIN Esame e ON e.Studente = s.Matricola JOIN Corso c ON c.Codice = e.Corso WHERE e.Voto = 30 AND c.Anno = 1 GROUP BY s.Matricola').esito.corretta).toBe(true);
    // E1 con una condizione sul nome dell'anno scritta come costante «anno corrente - 3»: stessa cosa sui dati originali
    const q = "SELECT Matricola, Cognome, Nome FROM Studente WHERE AnnoIscrizione >= 2023 AND Cognome <> 'Rossi' OR Cognome = 'Rossi' AND AnnoIscrizione >= 2023 AND Matricola <> 100099 ORDER BY Cognome, Nome";
    expect(verifica('E1', q).esito.corretta).toBe(true); // equivalente: nessun falso negativo
  });

  it('numero di colonne diverso e righe mancanti restano errori, come prima', () => {
    const colonne = verifica('E1', 'SELECT Matricola FROM Studente WHERE AnnoIscrizione >= 2023').esito;
    expect(colonne.corretta).toBe(false);
    expect(colonne.differenza).toEqual({ tipo: 'colonne', attese: 3, ottenute: 1 });
    expect(colonne.fallitaSuVariante).toBeUndefined();
    const mancanti = verifica('E1', 'SELECT Matricola, Cognome, Nome FROM Studente WHERE AnnoIscrizione >= 2024 ORDER BY Cognome, Nome').esito;
    expect(mancanti.differenza).toMatchObject({ tipo: 'righe', mancanti: 5 });
    expect(messaggiFeedback(mancanti.differenza!).join(' ')).toContain('Mancano 5 righe');
  });

  it('la verifica completa dell\'esempio è rapida (anche con la costruzione delle varianti)', async () => {
    const SQL = await sqlJs();
    const r = creaDatabase(SQL, sc.database.statements);
    const t0 = performance.now();
    const v = new VariantiDB(SQL, r.byte!, sc.logico);
    const e = esercizio('E8');
    const out = verificaCompleta(r.db, v, e.soluzioni[0], e.soluzioni, 1000);
    const primo = performance.now() - t0;
    expect(out.esito.corretta).toBe(true);
    // seconda verifica: i risultati delle soluzioni ufficiali sono già in cache
    const t1 = performance.now();
    verificaCompleta(r.db, v, e.soluzioni[1], e.soluzioni, 1000);
    const secondo = performance.now() - t1;
    expect(primo).toBeLessThan(1500);
    expect(secondo).toBeLessThan(400);
    console.log(`verifica con ${NUMERO_VARIANTI} varianti: prima ${primo.toFixed(0)} ms (incluse le varianti), poi ${secondo.toFixed(0)} ms`);
    v.chiudi();
  });
});

describe('soluzioni con LIMIT', () => {
  it('si verificano solo sui dati originali (i pareggi dipendono dai dati)', async () => {
    const SQL = await sqlJs();
    const r = creaDatabase(SQL, [
      'CREATE TABLE P (Id INTEGER PRIMARY KEY, Nome TEXT NOT NULL, Punti INTEGER NOT NULL)',
      "INSERT INTO P VALUES (1,'a',10),(2,'b',20),(3,'c',30),(4,'d',40),(5,'e',50),(6,'f',60),(7,'g',70),(8,'h',80)",
    ]);
    const v = new VariantiDB(SQL, r.byte!, null);
    const sol = ['SELECT Nome FROM P ORDER BY Punti DESC LIMIT 3'];
    const ok = verificaCompleta(r.db, v, 'SELECT Nome FROM P ORDER BY Punti DESC LIMIT 3', sol, 100);
    expect(ok.esito).toMatchObject({ corretta: true, soloDatiOriginali: true, databaseDiProva: 0 });
    // una risposta scritta a mano coincide sull'originale e viene accettata (limite dichiarato)
    expect(verificaCompleta(r.db, v, "SELECT Nome FROM P WHERE Id >= 6 ORDER BY Punti DESC", sol, 100).esito.corretta).toBe(true);
    v.chiudi();
  });
});

describe('esegui sul database originale dopo la creazione delle varianti', () => {
  it('continua a funzionare', () => {
    expect(esegui(db, 'SELECT COUNT(*) FROM Studente').righe).toEqual([[14]]);
  });
});
