import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validaScenario, haErrori } from '../../src/scenario/validate';
import { leggiJson, pulisciTesto } from '../../src/scenario/parseInput';
import { provaScenario } from '../../src/sql/engine';
import { leggiScenario, motoreTest, radice } from './helpers';

const base = () => structuredClone(leggiScenario()) as unknown as Record<string, any>;
const percorsi = (dati: unknown) => validaScenario(dati).filter((p) => p.livello === 'errore').map((p) => p.percorso);

describe('validazione dello scenario', () => {
  it('segnala i campi mancanti con il percorso giusto', () => {
    const s = base();
    delete s.version;
    delete s.metadati.titolo;
    s.esercizi[2].soluzioni = [];
    expect(percorsi(s)).toEqual(['version', 'metadati.titolo', 'esercizi[2].soluzioni']);
  });

  it('cardinalità, entità inesistenti e copertura', () => {
    const s = base();
    s.er.relazioni[0].partecipanti[0].cardinalita = '(1;N)';
    s.er.relazioni[1].partecipanti[1].entita = 'DIPARTIMENTI';
    s.er.generalizzazioni[0].copertura = 'totale';
    const p = validaScenario(s).filter((x) => x.livello === 'errore');
    expect(p.map((x) => x.percorso)).toEqual([
      'er.relazioni[0].partecipanti[0].cardinalita',
      'er.relazioni[1].partecipanti[1].entita',
      'er.generalizzazioni[0].copertura',
    ]);
    expect(p[0].messaggio).toMatch(/\(min,max\)/);
    expect(p[1].messaggio).toMatch(/«DIPARTIMENTI» non esiste/);
  });

  it('chiavi esterne verso tabelle o colonne inesistenti', () => {
    const s = base();
    s.logico.tabelle[1].chiaviEsterne[0].tabella = 'Dip';
    s.logico.tabelle[4].chiaviEsterne[0].riferimenti = ['Codice'];
    s.logico.tabelle[0].chiavePrimaria = ['Id'];
    expect(percorsi(s)).toEqual([
      'logico.tabelle[0].chiavePrimaria[0]',
      'logico.tabelle[1].chiaviEsterne[0].tabella',
      'logico.tabelle[4].chiaviEsterne[0].riferimenti[0]',
    ]);
  });

  it('esercizi: difficoltà, soluzioni non SELECT, troppe soluzioni, id duplicati', () => {
    const s = base();
    s.esercizi[0].difficolta = 'facile';
    s.esercizi[1].soluzioni = ['DELETE FROM Studente'];
    s.esercizi[2].soluzioni = ['SELECT 1', 'SELECT 1', 'SELECT 1', 'SELECT 1'];
    s.esercizi[3].id = 'E1';
    s.esercizi[4].soluzioni = 'SELECT 1';
    expect(percorsi(s)).toEqual(['esercizi[0].difficolta', 'esercizi[1].soluzioni[0]', 'esercizi[2].soluzioni', 'esercizi[3].id', 'esercizi[4].soluzioni']);
  });

  it('campi sconosciuti producono un avviso con suggerimento', () => {
    const s = base();
    s.esercizi[0].difficoltà = 2;
    const avvisi = validaScenario(s).filter((x) => x.livello === 'avviso');
    expect(avvisi[0]).toMatchObject({ percorso: 'esercizi[0].difficoltà', messaggio: expect.stringMatching(/forse intendevi «difficolta»/) });
  });

  it('prova SQL: statement errato, soluzione non eseguibile, risultato vuoto, alternative diverse', async () => {
    const SQL = await motoreTest();
    const statements = ['CREATE TABLE t(a INTEGER)', 'INSERT INTO t VALUES (1),(2)'];
    expect((await provaScenario(SQL, [...statements, 'INSERT INTO x VALUES (1)'], [], []))[0]).toMatchObject({ livello: 'errore', percorso: 'database.statements[2]' });
    const p = await provaScenario(SQL, statements, [
      { id: 'A', soluzioni: ['SELECT b FROM t'] },
      { id: 'B', soluzioni: ['SELECT a FROM t WHERE a > 5'] },
      { id: 'C', soluzioni: ['SELECT a FROM t', 'SELECT a FROM t WHERE a = 1'] },
    ], ['t', 'manca']);
    expect(p.map((x) => [x.livello, x.percorso])).toEqual([
      ['avviso', 'logico.tabelle[1].nome'],
      ['errore', 'esercizi[0].soluzioni[0]'],
      ['avviso', 'esercizi[1].soluzioni[0]'],
      ['avviso', 'esercizi[2].soluzioni[1]'],
    ]);
  });

  it('l\'esempio completo di SCHEMA.md è valido', async () => {
    const md = readFileSync(radice('SCHEMA.md'), 'utf-8');
    const blocchi = [...md.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    const completo = blocchi.find((b) => b.includes('"version"') && b.includes('"esercizi"'));
    expect(completo).toBeDefined();
    const parse = leggiJson(completo!);
    expect(parse.ok).toBe(true);
    if (!parse.ok) return;
    const problemi = validaScenario(parse.valore);
    expect(problemi).toEqual([]);
    const s = parse.valore as any;
    expect(await provaScenario(await motoreTest(), s.database.statements, s.esercizi, s.logico.tabelle.map((t: any) => t.nome), s.logico)).toEqual([]);
    expect(haErrori(problemi)).toBe(false);
  });
});

describe('lettura del JSON incollato', () => {
  it('toglie recinti di codice e testo intorno', () => {
    expect(pulisciTesto('Ecco lo scenario:\n```json\n{"a": 1}\n```\nBuono studio!')).toBe('{"a": 1}');
    expect(pulisciTesto('﻿  {"a": 1}  ')).toBe('{"a": 1}');
  });

  it('indica riga e colonna degli errori di sintassi', () => {
    const r = leggiJson('{\n  "a": 1,\n  "b": [1, 2,]\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.messaggio).toMatch(/riga 3, colonna 14: virgola di troppo prima di «]»/);
    const r2 = leggiJson("{\n  'a': 1\n}");
    if (!r2.ok) expect(r2.messaggio).toMatch(/riga 2.*virgolette doppie/);
    const r3 = leggiJson('{ "a": “x” }');
    if (!r3.ok) expect(r3.messaggio).toMatch(/virgolette tipografiche/);
    expect(leggiJson('').ok).toBe(false);
  });
});

describe('scenario generato seguendo PROMPT_GENERATORE.md (dialetto PostgreSQL)', () => {
  it('si importa senza errori né avvisi: tipi DATE/BOOLEAN/NUMERIC, >= ALL, = ANY, EXCEPT, EXTRACT', async () => {
    const s = leggiScenario('tests/fixtures/scenario-generato.json');
    expect(validaScenario(structuredClone(s))).toEqual([]);
    expect(await provaScenario(await motoreTest(), s.database.statements, s.esercizi, s.logico.tabelle.map((t) => t.nome), s.logico)).toEqual([]);
  });
});
