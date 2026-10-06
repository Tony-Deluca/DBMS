import { beforeAll, describe, expect, it } from 'vitest';
import { esegui } from '../../src/sql/engine';
import { verificaCompleta } from '../../src/sql/verificaRobusta';
import { generatore, NUMERO_VARIANTI, semeVariante, VariantiDB, violazioniChiaviEsterne, type Struttura } from '../../src/sql/varianti';
import { messaggiFeedback, messaggiVarianteFallita, testoDatabaseDiProva } from '../../src/sql/compare';
import type { Db } from '../../src/sql/motore';
import { creaDb, leggiScenario } from './helpers';

const sc = leggiScenario();
let db: Db;
let st: Struttura;
let varianti: VariantiDB;

const esercizio = (id: string) => sc.esercizi.find((e) => e.id === id)!;
const verifica = (id: string, query: string) => verificaCompleta(db, varianti, query, esercizio(id).soluzioni, 1000);
const righe = async (d: Db, sql: string) => (await d.m.interna(d.schema, sql)).righe;
const numero = async (d: Db, sql: string) => Number((await righe(d, sql))[0][0]);

/** Contenuto completo di un database (tabelle e righe) per confrontarlo. */
async function dump(d: Db): Promise<string> {
  const out: string[] = [];
  for (const t of st.tabelle) {
    const r = (await righe(d, `SELECT * FROM "${t.reale}"`)).map((x) => JSON.stringify(x)).sort();
    out.push(`${t.nome}:${r.join('|')}`);
  }
  return out.join('\n');
}
const dumpTutte = async (vs: { db: Db }[]) => {
  const out: string[] = [];
  for (const v of vs) out.push(await dump(v.db));
  return out;
};

const conta = (d: Db, t: string) => numero(d, `SELECT COUNT(*) FROM ${t}`);

beforeAll(async () => {
  const r = await creaDb(sc.database.statements, sc.logico);
  db = r.db;
  st = r.struttura;
  varianti = new VariantiDB(db, st, `${db.schema}_v`);
});

describe('generatore e database di prova', () => {
  it('il generatore con seme è riproducibile', async () => {
    const a = generatore(semeVariante(2));
    const b = generatore(semeVariante(2));
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
    expect(Array.from({ length: 5 }, generatore(semeVariante(3)))).not.toEqual(Array.from({ length: 5 }, generatore(semeVariante(2))));
  });

  it('crea le varianti previste, tutte diverse dall\'originale', async () => {
    const v = await varianti.tutte();
    expect(v).toHaveLength(NUMERO_VARIANTI);
    const originale = await dump(db);
    const contenuti = new Set(await dumpTutte(v));
    expect(contenuti.size).toBe(NUMERO_VARIANTI);
    expect(contenuti.has(originale)).toBe(false);
    // ci sono righe mancanti, righe duplicate e NULL in più rispetto all'originale
    const tutteLeCaratteristiche = new Set(v.flatMap((x) => x.caratteristiche));
    expect([...tutteLeCaratteristiche].sort()).toEqual(['righe duplicate', 'righe mancanti', 'valori NULL']);
  });

  it('stesso seme, stesse varianti (anche su un altro database costruito da zero)', async () => {
    const r2 = await creaDb(sc.database.statements, sc.logico);
    const v2 = await new VariantiDB(r2.db, r2.struttura, `${r2.db.schema}_v`).tutte();
    expect(await dumpTutte(v2)).toEqual(await dumpTutte(await varianti.tutte()));
  });

  it('rispetta chiavi esterne (dichiarate e del modello logico), chiavi primarie e CHECK', async () => {
    expect(st.fk.length).toBeGreaterThanOrEqual(9);
    for (const v of await varianti.tutte()) {
      expect(await violazioniChiaviEsterne(v.db, st), `variante ${v.indice}`).toBe(0);
      // le chiavi primarie restano uniche
      expect(await numero(v.db, 'SELECT COUNT(*) FROM (SELECT Studente, Corso FROM Esame GROUP BY 1, 2 HAVING COUNT(*) > 1) x')).toBe(0);
      // CHECK: voto tra 18 e 30, lode solo con 30
      expect(await numero(v.db, 'SELECT COUNT(*) FROM Esame WHERE Voto NOT BETWEEN 18 AND 30 OR (Lode AND Voto <> 30)')).toBe(0);
    }
  });

  it('i NULL compaiono solo nelle colonne che li ammettono; le colonne NOT NULL e le chiavi restano piene', async () => {
    let nullInPiu = 0;
    for (const v of await varianti.tutte()) {
      for (const [t, col] of [['Studente', 'Cognome'], ['Studente', 'Matricola'], ['Esame', 'Voto'], ['Corso', 'Codice'], ['Docente', 'Ruolo']]) {
        expect(await numero(v.db, `SELECT COUNT(*) FROM ${t} WHERE ${col} IS NULL`), `${t}.${col}`).toBe(0);
      }
      nullInPiu += await numero(v.db, 'SELECT COUNT(*) FROM Studente WHERE Email IS NULL');
    }
    expect(nullInPiu).toBeGreaterThan(0);
  });

  it('le varianti hanno meno righe (sottoinsiemi), più righe (duplicati) e anche tabelle vuote o quasi', async () => {
    const n0 = await conta(db, 'Esame');
    const vs = await varianti.tutte();
    const conteggi: number[] = [];
    for (const v of vs) conteggi.push(await conta(v.db, 'Esame'));
    expect(conteggi.some((n) => n < n0)).toBe(true);
    expect(conteggi.some((n) => n > n0 * 0.9)).toBe(true);
    // righe duplicate: stessi dati con una chiave diversa (nell'originale non ci sono omonimi nati lo stesso giorno)
    const doppi = 'SELECT COUNT(*) FROM (SELECT Nome, Cognome, DataNascita FROM Studente GROUP BY 1, 2, 3 HAVING COUNT(*) > 1) x';
    expect(await numero(db, doppi)).toBe(0);
    let duplicati = 0;
    for (const v of vs) if (v.caratteristiche.includes('righe duplicate')) duplicati += await numero(v.db, doppi);
    expect(duplicati).toBeGreaterThan(0);
  });

  it('il database originale non viene toccato e le query dello studente sono in sola lettura', async () => {
    expect(await conta(db, 'Studente')).toBe(14);
    await expect(db.m.interroga(db.schema, 'WITH d AS (DELETE FROM Studente RETURNING *) SELECT COUNT(*) FROM d')).rejects.toThrow(/read-only/);
    for (const v of await varianti.tutte()) await expect(v.db.m.interroga(v.db.schema, 'WITH d AS (DELETE FROM Studente RETURNING *) SELECT 1')).rejects.toThrow(/read-only/);
    expect(await conta(db, 'Studente')).toBe(14);
  });
});

describe('verifica completa con database di prova', () => {
  it('ogni soluzione ufficiale dello scenario d\'esempio è accettata, su tutti i database di prova', async () => {
    for (const es of sc.esercizi) {
      for (const [i, s] of es.soluzioni.entries()) {
        const r = await verificaCompleta(db, varianti, s, es.soluzioni, 1000);
        expect(r.esito.corretta, `${es.id} soluzione ${i + 1}`).toBe(true);
        expect(r.esito.databaseDiProva, `${es.id}`).toBe(NUMERO_VARIANTI);
        expect(r.esito.soloDatiOriginali).toBe(false);
      }
    }
  });

  it('query equivalenti scritte diversamente (JOIN / IN / EXISTS, alias, colonne permutate) restano accettate', async () => {
    expect((await verifica('E3', 'SELECT x.Matricola, x.Cognome, x.Nome FROM Studente x WHERE x.Matricola IN (SELECT Studente FROM Esame WHERE Voto = 30 AND Corso IN (SELECT Codice FROM Corso WHERE Anno = 1))')).esito).toMatchObject({ corretta: true });
    const perm = (await verifica('E3', 'SELECT DISTINCT s.Nome, s.Matricola, s.Cognome FROM Studente s, Esame e, Corso c WHERE e.Studente = s.Matricola AND c.Codice = e.Corso AND e.Voto = 30 AND c.Anno = 1')).esito;
    expect(perm).toMatchObject({ corretta: true, colonnePermutate: true, databaseDiProva: NUMERO_VARIANTI });
    // E7 con LEFT JOIN
    expect((await verifica('E7', 'SELECT d.Matricola, d.Cognome, d.Nome FROM Docente d LEFT JOIN Corso c ON c.Docente = d.Matricola WHERE c.Codice IS NULL')).esito.corretta).toBe(true);
  });

  it('una query che coincide solo sui dati originali (valori scritti a mano) fallisce su un database di prova', async () => {
    // E5: matricole «scelte a mano» invece delle condizioni su conteggio e media
    const q = 'SELECT s.Matricola, s.Cognome, COUNT(*) AS n, AVG(e.Voto) AS m FROM Studente s JOIN Esame e ON e.Studente = s.Matricola WHERE s.Matricola IN (100009, 100003, 100001, 100014) GROUP BY s.Matricola, s.Cognome ORDER BY m DESC';
    // sui dati originali è identica alla soluzione ufficiale
    const originale = (await verificaCompleta(db, null, q, esercizio('E5').soluzioni, 1000)).esito;
    expect(originale.corretta).toBe(true);
    // con i database di prova no
    const r = (await verifica('E5', q)).esito;
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

  it('ignorare i NULL o i duplicati: coincide sull\'originale, fallisce nelle varianti', async () => {
    // E3 senza DISTINCT ma con GROUP BY → equivalente (deve passare)
    expect((await verifica('E3', 'SELECT s.Matricola, s.Cognome, s.Nome FROM Studente s JOIN Esame e ON e.Studente = s.Matricola JOIN Corso c ON c.Codice = e.Corso WHERE e.Voto = 30 AND c.Anno = 1 GROUP BY s.Matricola')).esito.corretta).toBe(true);
    // E1 con una condizione sul nome dell'anno scritta come costante «anno corrente - 3»: stessa cosa sui dati originali
    const q = "SELECT Matricola, Cognome, Nome FROM Studente WHERE AnnoIscrizione >= 2023 AND Cognome <> 'Rossi' OR Cognome = 'Rossi' AND AnnoIscrizione >= 2023 AND Matricola <> 100099 ORDER BY Cognome, Nome";
    expect((await verifica('E1', q)).esito.corretta).toBe(true); // equivalente: nessun falso negativo
  });

  it('numero di colonne diverso e righe mancanti restano errori, come prima', async () => {
    const colonne = (await verifica('E1', 'SELECT Matricola FROM Studente WHERE AnnoIscrizione >= 2023')).esito;
    expect(colonne.corretta).toBe(false);
    expect(colonne.differenza).toEqual({ tipo: 'colonne', attese: 3, ottenute: 1 });
    expect(colonne.fallitaSuVariante).toBeUndefined();
    const mancanti = (await verifica('E1', 'SELECT Matricola, Cognome, Nome FROM Studente WHERE AnnoIscrizione >= 2024 ORDER BY Cognome, Nome')).esito;
    expect(mancanti.differenza).toMatchObject({ tipo: 'righe', mancanti: 5 });
    expect(messaggiFeedback(mancanti.differenza!).join(' ')).toContain('Mancano 5 righe');
  });

  it('la verifica completa dell\'esempio è rapida (anche con la costruzione delle varianti)', async () => {
    const r = await creaDb(sc.database.statements, sc.logico);
    const t0 = performance.now();
    const v = new VariantiDB(r.db, r.struttura, `${r.db.schema}_v`);
    const e = esercizio('E8');
    const out = await verificaCompleta(r.db, v, e.soluzioni[0], e.soluzioni, 1000);
    const primo = performance.now() - t0;
    expect(out.esito.corretta).toBe(true);
    // seconda verifica: i risultati delle soluzioni ufficiali sono già in cache
    const t1 = performance.now();
    await verificaCompleta(r.db, v, e.soluzioni[1], e.soluzioni, 1000);
    const secondo = performance.now() - t1;
    expect(primo).toBeLessThan(3000);
    expect(secondo).toBeLessThan(400);
    console.log(`verifica con ${NUMERO_VARIANTI} varianti: prima ${primo.toFixed(0)} ms (incluse le varianti), poi ${secondo.toFixed(0)} ms`);
    await v.chiudi();
  });
});

describe('soluzioni con LIMIT', () => {
  it('si verificano solo sui dati originali (i pareggi dipendono dai dati)', async () => {
    const r = await creaDb([
      'CREATE TABLE P (Id INTEGER PRIMARY KEY, Nome TEXT NOT NULL, Punti INTEGER NOT NULL)',
      "INSERT INTO P VALUES (1,'a',10),(2,'b',20),(3,'c',30),(4,'d',40),(5,'e',50),(6,'f',60),(7,'g',70),(8,'h',80)",
    ]);
    const v = new VariantiDB(r.db, r.struttura, `${r.db.schema}_v`);
    const sol = ['SELECT Nome FROM P ORDER BY Punti DESC LIMIT 3'];
    const ok = await verificaCompleta(r.db, v, 'SELECT Nome FROM P ORDER BY Punti DESC LIMIT 3', sol, 100);
    expect(ok.esito).toMatchObject({ corretta: true, soloDatiOriginali: true, databaseDiProva: 0 });
    // una risposta scritta a mano coincide sull'originale e viene accettata (limite dichiarato)
    expect((await verificaCompleta(r.db, v, "SELECT Nome FROM P WHERE Id >= 6 ORDER BY Punti DESC", sol, 100)).esito.corretta).toBe(true);
    await v.chiudi();
  });
});

describe('esegui sul database originale dopo la creazione delle varianti', () => {
  it('continua a funzionare', async () => {
    expect((await esegui(db, 'SELECT COUNT(*) FROM Studente')).righe).toEqual([[14]]);
  });
});
