// Operazioni che modificano lo stato e lo salvano.
import { stato, emetti, chiaveProgresso, type Vista } from './stato';
import * as archivio from '../storage/idb';
import type { Progresso } from '../storage/idb';
import { sql } from '../sql/client';
import type { ScenarioSalvato } from '../scenario/types';
import { importaTesto } from '../scenario/importa';
import esempio from '../../scenari-esempio/universita.json';

export async function caricaScenari(): Promise<void> {
  stato.scenari = await archivio.elencoScenari();
  emetti('scenari');
}

/**
 * Lo scenario d'esempio salvato con una versione precedente dell'app (es. quella con SQLite) viene
 * sostituito da quello incluso, mantenendo nome e progressi.
 */
export async function aggiornaEsempio(): Promise<void> {
  let cambiato = false;
  for (const sc of stato.scenari) {
    if (sc.origine !== 'esempio' || JSON.stringify(sc.dati) === JSON.stringify(esempio)) continue;
    await archivio.salvaScenario({ ...sc, dati: structuredClone(esempio) as ScenarioSalvato['dati'] });
    cambiato = true;
  }
  if (cambiato) await caricaScenari();
}

export async function assicuraEsempio(forza = false): Promise<ScenarioSalvato | undefined> {
  if (!forza && stato.scenari.length > 0) return undefined;
  const esito = await importaTesto(JSON.stringify(esempio), stato.scenari.map((s) => s.nome), 'esempio');
  await caricaScenari();
  return esito.salvato;
}

export async function apriScenario(id: string | null): Promise<void> {
  const sc = (id && stato.scenari.find((s) => s.id === id)) || stato.scenari[0] || null;
  stato.corrente = sc;
  stato.schemaDb = null;
  stato.erroreDb = null;
  stato.progressi = new Map();
  if (sc) {
    const prog = await archivio.progressiScenario(sc.id);
    for (const p of prog) stato.progressi.set(p.chiave, p);
    const ultimo = await archivio.leggiImpostazione<string>(`esercizio:${sc.id}`);
    stato.esercizioId = sc.dati.esercizi.find((e) => e.id === ultimo)?.id ?? sc.dati.esercizi[0]?.id ?? null;
    await archivio.scriviImpostazione('ultimoScenario', sc.id);
  } else {
    stato.esercizioId = null;
  }
  emetti('scenario', 'esercizio', 'progressi');
  if (sc) {
    try {
      const { schema } = await sql.carica(sc.dati.database.statements, sc.dati.logico);
      if (stato.corrente?.id !== sc.id) return;
      stato.schemaDb = schema;
    } catch (e) {
      stato.erroreDb = (e as Error).message;
    }
    emetti('db');
  }
}

export function cambiaVista(v: Vista): void {
  if (stato.vista === v) return;
  stato.vista = v;
  emetti('vista');
}

export function scegliEsercizio(id: string): void {
  if (stato.esercizioId === id) return;
  stato.esercizioId = id;
  if (stato.corrente) archivio.scriviImpostazione(`esercizio:${stato.corrente.id}`, id).catch(() => undefined);
  emetti('esercizio');
}

export function progresso(esercizioId: string): Progresso | undefined {
  if (!stato.corrente) return undefined;
  return stato.progressi.get(chiaveProgresso(stato.corrente.id, esercizioId));
}

export function aggiornaProgresso(esercizioId: string, modifica: Partial<Progresso>, notifica = true): void {
  const sc = stato.corrente;
  if (!sc) return;
  const chiave = chiaveProgresso(sc.id, esercizioId);
  const prec: Progresso = stato.progressi.get(chiave) ?? {
    chiave,
    scenarioId: sc.id,
    bozza: '',
    stato: 'nuovo',
    soluzioneVista: false,
    tentativi: 0,
    aggiornato: 0,
  };
  const nuovo: Progresso = { ...prec, ...modifica, aggiornato: Date.now() };
  // "risolto" non torna indietro
  if (prec.stato === 'risolto' && modifica.stato === 'tentato') nuovo.stato = 'risolto';
  stato.progressi.set(chiave, nuovo);
  archivio.salvaProgresso(nuovo).catch(() => undefined);
  if (notifica) emetti('progressi');
}

export async function rinominaScenario(id: string, nome: string): Promise<void> {
  const sc = stato.scenari.find((s) => s.id === id);
  if (!sc || !nome.trim()) return;
  sc.nome = nome.trim();
  await archivio.salvaScenario(sc);
  emetti('scenari', 'scenario');
}

export async function eliminaScenario(id: string): Promise<void> {
  await archivio.eliminaScenario(id);
  await caricaScenari();
  if (stato.corrente?.id === id) {
    if (stato.scenari.length === 0) await assicuraEsempio();
    await apriScenario(stato.scenari[0]?.id ?? null);
  }
}

export async function azzeraProgressi(id: string): Promise<void> {
  await archivio.azzeraProgressi(id);
  if (stato.corrente?.id === id) {
    stato.progressi = new Map();
    emetti('scenario', 'progressi');
  }
}

export async function richiediPersistenza(): Promise<void> {
  stato.persistenza = await archivio.richiediPersistenza();
}
