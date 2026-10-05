import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext, type Completion, type CompletionResult } from '@codemirror/autocomplete';
import { estensioneSql } from '../../src/editor/dialetto';
import { leggiScenario } from './helpers';

const schema: Record<string, string[]> = {
  Studente: ['Matricola', 'Nome', 'Cognome', 'CorsoDiLaurea'],
  Esame: ['Studente', 'Corso', 'Data', 'Voto'],
  'Corso di Laurea': ['Codice', 'Nome del corso'],
  Interna: ['x1', '2cifre'], _nascosta: ['y'],
};

/** Opzioni di completamento nel punto `|` del testo. */
async function suggerimenti(testoConCursore: string, sch = schema): Promise<Completion[]> {
  const pos = testoConCursore.indexOf('|');
  const doc = testoConCursore.replace('|', '');
  const state = EditorState.create({ doc, extensions: [estensioneSql(sch)] });
  const fonti = state.languageDataAt<(c: CompletionContext) => CompletionResult | null | Promise<CompletionResult | null>>('autocomplete', pos);
  const out: Completion[] = [];
  for (const f of fonti) {
    const r = await f(new CompletionContext(state, pos, true));
    if (r) out.push(...r.options);
  }
  return out;
}

/** Testo che finirebbe nell'editor scegliendo il suggerimento. */
const testoInserito = (c: Completion) => (typeof c.apply === 'string' ? c.apply : c.label);

describe('autocompletamento: niente virgolette sui nomi semplici', () => {
  it('nomi di tabella dopo FROM', async () => {
    const o = await suggerimenti('SELECT * FROM Stu|');
    const c = o.find((x) => x.label === 'Studente')!;
    expect(c).toBeDefined();
    expect(testoInserito(c)).toBe('Studente');
    expect(testoInserito(o.find((x) => x.label === 'Esame')!)).toBe('Esame');
    expect(testoInserito(o.find((x) => x.label === '_nascosta')!)).toBe('_nascosta');
  });

  it('colonne dopo «tabella.»', async () => {
    const o = await suggerimenti('SELECT Studente.Ma| FROM Studente');
    for (const nome of ['Matricola', 'Nome', 'Cognome', 'CorsoDiLaurea']) {
      expect(testoInserito(o.find((x) => x.label === nome)!), nome).toBe(nome);
    }
  });

  it('colonne dopo «alias.»', async () => {
    const o = await suggerimenti('SELECT s.Ma| FROM Studente s');
    const nomi = o.map((x) => x.label);
    expect(nomi).toContain('Matricola');
    expect(testoInserito(o.find((x) => x.label === 'Matricola')!)).toBe('Matricola');
    // l'alias di tabella con AS funziona allo stesso modo
    const o2 = await suggerimenti('SELECT e.Vo| FROM Esame AS e');
    expect(testoInserito(o2.find((x) => x.label === 'Voto')!)).toBe('Voto');
  });

  it('le virgolette restano solo per gli identificatori non semplici', async () => {
    const o = await suggerimenti('SELECT * FROM |');
    expect(testoInserito(o.find((x) => x.label === 'Corso di Laurea')!)).toBe('"Corso di Laurea"');
    const c = await suggerimenti('SELECT "Corso di Laurea".| FROM "Corso di Laurea"');
    expect(testoInserito(c.find((x) => x.label === 'Codice')!)).toBe('Codice');
    expect(testoInserito(c.find((x) => x.label === 'Nome del corso')!)).toBe('"Nome del corso"');
    // inizia con una cifra: non è semplice
    const u = await suggerimenti('SELECT Interna.| FROM Interna');
    expect(testoInserito(u.find((x) => x.label === 'x1')!)).toBe('x1');
    expect(testoInserito(u.find((x) => x.label === '2cifre')!)).toBe('"2cifre"');
  });

  it('nessun suggerimento dello scenario di esempio ha virgolette se il nome è semplice', async () => {
    const sc = leggiScenario();
    const sch: Record<string, string[]> = {};
    for (const t of sc.logico.tabelle) sch[t.nome] = t.colonne.map((c) => c.nome);
    const semplice = /^[A-Za-z_][A-Za-z0-9_]*$/;
    for (const [tabella, colonne] of Object.entries(sch)) {
      const o = await suggerimenti('SELECT * FROM |', sch);
      expect(testoInserito(o.find((x) => x.label === tabella)!), tabella).toBe(tabella);
      const oc = await suggerimenti(`SELECT ${tabella}.| FROM ${tabella}`, sch);
      for (const col of colonne) {
        expect(semplice.test(col)).toBe(true);
        expect(testoInserito(oc.find((x) => x.label === col)!), `${tabella}.${col}`).toBe(col);
      }
    }
  });
});
