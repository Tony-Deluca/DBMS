// Pipeline di importazione: lettura JSON → validazione → prova SQL → salvataggio.
import { leggiJson } from './parseInput';
import { haErrori, normalizzaScenario, validaScenario, type Problema } from './validate';
import type { Scenario, ScenarioSalvato } from './types';
import { sql } from '../sql/client';
import { nuovoId, salvaScenario } from '../storage/idb';

export interface EsitoImport {
  ok: boolean;
  problemi: Problema[];
  salvato?: ScenarioSalvato;
}

/** Valida completamente uno scenario (struttura + esecuzione SQL) senza salvarlo. */
export async function validaCompleto(dati: unknown): Promise<{ problemi: Problema[]; scenario?: Scenario }> {
  const problemi = validaScenario(dati);
  if (haErrori(problemi)) return { problemi };
  const s = normalizzaScenario(dati);
  try {
    const sqlProblemi = await sql.prova(s.database.statements, s.esercizi, s.logico.tabelle.map((t) => t.nome));
    problemi.push(...sqlProblemi);
  } catch (e) {
    problemi.push({ livello: 'errore', percorso: 'database', messaggio: `impossibile provare lo scenario: ${(e as Error).message}` });
  }
  return { problemi, scenario: haErrori(problemi) ? undefined : s };
}

export async function importaTesto(testo: string, nomiEsistenti: string[], origine: ScenarioSalvato['origine'] = 'importato'): Promise<EsitoImport> {
  const p = leggiJson(testo);
  if (!p.ok) return { ok: false, problemi: [{ livello: 'errore', percorso: 'JSON', messaggio: p.messaggio }] };
  const { problemi, scenario } = await validaCompleto(p.valore);
  if (!scenario) return { ok: false, problemi };
  const salvato: ScenarioSalvato = {
    id: nuovoId(),
    nome: nomeUnico(scenario.metadati.titolo.trim(), nomiEsistenti),
    dati: scenario,
    importatoIl: Date.now(),
    origine,
  };
  await salvaScenario(salvato);
  return { ok: true, problemi, salvato };
}

export function nomeUnico(nome: string, esistenti: string[]): string {
  const set = new Set(esistenti.map((n) => n.toLowerCase()));
  if (!set.has(nome.toLowerCase())) return nome;
  for (let i = 2; ; i++) {
    const n = `${nome} (${i})`;
    if (!set.has(n.toLowerCase())) return n;
  }
}

/** JSON da esportare: il titolo riflette l'eventuale rinomina. */
export function jsonEsportazione(s: ScenarioSalvato): string {
  const dati: Scenario = { ...s.dati, metadati: { ...s.dati.metadati, titolo: s.nome } };
  return JSON.stringify(dati, null, 2);
}

export function nomeFile(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'scenario'}.json`;
}
