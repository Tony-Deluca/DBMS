// Stato globale minimo con notifiche ai componenti interessati.
import type { ScenarioSalvato } from '../scenario/types';
import type { Progresso } from '../storage/idb';

export type Vista = 'er' | 'logico' | 'dati' | 'esercizi';

export interface Stato {
  scenari: ScenarioSalvato[];
  corrente: ScenarioSalvato | null;
  progressi: Map<string, Progresso>;
  vista: Vista;
  esercizioId: string | null;
  /** tabelle → colonne del DB caricato (autocompletamento) */
  schemaDb: Record<string, string[]> | null;
  erroreDb: string | null;
  persistenza: 'concessa' | 'negata' | 'non supportata' | 'sconosciuta';
}

export type Evento = 'scenari' | 'scenario' | 'vista' | 'esercizio' | 'progressi' | 'db';

export const stato: Stato = {
  scenari: [],
  corrente: null,
  progressi: new Map(),
  vista: 'esercizi',
  esercizioId: null,
  schemaDb: null,
  erroreDb: null,
  persistenza: 'sconosciuta',
};

const ascoltatori = new Map<Evento, Set<() => void>>();

export function on(evento: Evento, f: () => void): void {
  if (!ascoltatori.has(evento)) ascoltatori.set(evento, new Set());
  ascoltatori.get(evento)!.add(f);
}

export function emetti(...eventi: Evento[]): void {
  for (const e of eventi) for (const f of ascoltatori.get(e) ?? []) f();
}

export function chiaveProgresso(scenarioId: string, esercizioId: string): string {
  return `${scenarioId}::${esercizioId}`;
}
