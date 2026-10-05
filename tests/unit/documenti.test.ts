import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { estraiPrompt } from '../../src/scenario/prompt';
import { radice } from './helpers';

describe('PROMPT_GENERATORE.md', () => {
  const md = readFileSync(radice('PROMPT_GENERATORE.md'), 'utf-8');
  const prompt = estraiPrompt(md);

  it('contiene un prompt estraibile e autosufficiente', () => {
    expect(prompt.length).toBeGreaterThan(2000);
    expect(prompt).not.toContain('# Prompt per generare');
    for (const parola of ['"version": 1', 'metadati', 'entita', 'cardinalita', 'chiavePrimaria', 'chiaviEsterne', 'statements', 'soluzioni', 'difficolta']) {
      expect(prompt, parola).toContain(parola);
    }
  });

  it('impone casi limite, verifica dei risultati e un unico blocco JSON', () => {
    expect(prompt).toMatch(/NULL/);
    expect(prompt).toMatch(/duplicati/);
    expect(prompt).toMatch(/NON vuoto/);
    expect(prompt).toMatch(/UNICO blocco di codice/);
    expect(prompt).toMatch(/Dominio:/);
    expect(prompt).toMatch(/Difficoltà/);
  });
});

describe('README.md', () => {
  const md = readFileSync(radice('README.md'), 'utf-8');
  it('spiega pubblicazione, schermata Home su iPad e fragilità della verifica', () => {
    expect(md).toMatch(/GitHub Pages/);
    expect(md).toMatch(/schermata Home/);
    expect(md).toMatch(/casi limite/);
  });
});
