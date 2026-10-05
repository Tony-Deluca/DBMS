// Wrapper minimo su IndexedDB: scenari, progressi e impostazioni.
import type { ScenarioSalvato } from '../scenario/types';
import type { Progetto } from '../progettazione/modello';

const NOME_DB = 'palestra-sql';
// v2: aggiunto l'archivio «progetti» (sezione Progettazione); gli altri archivi restano invariati
const VERSIONE = 2;

export interface Progresso {
  /** chiave: `${scenarioId}::${esercizioId}` */
  chiave: string;
  scenarioId: string;
  bozza: string;
  stato: 'nuovo' | 'tentato' | 'risolto';
  soluzioneVista: boolean;
  tentativi: number;
  aggiornato: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

// Ripiego in memoria quando IndexedDB non è disponibile (finestra privata, dati del sito bloccati):
// l'app funziona, ma gli scenari importati si perdono alla chiusura.
const memoria = {
  scenari: new Map<string, ScenarioSalvato>(),
  progressi: new Map<string, Progresso>(),
  impostazioni: new Map<string, unknown>(),
  progetti: new Map<string, Progetto>(),
};
let soloMemoria = false;

/** true se l'archivio del browser non è disponibile e i dati restano solo in memoria. */
export function archivioSoloInMemoria(): boolean {
  return soloMemoria;
}

async function disponibile(): Promise<boolean> {
  if (soloMemoria) return false;
  try {
    await apri();
    return true;
  } catch {
    soloMemoria = true;
    return false;
  }
}

function apri(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((risolvi, rifiuta) => {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB non disponibile');
    const req = indexedDB.open(NOME_DB, VERSIONE);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('scenari')) db.createObjectStore('scenari', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('progressi')) {
        const s = db.createObjectStore('progressi', { keyPath: 'chiave' });
        s.createIndex('scenario', 'scenarioId');
      }
      if (!db.objectStoreNames.contains('impostazioni')) db.createObjectStore('impostazioni');
      if (!db.objectStoreNames.contains('progetti')) db.createObjectStore('progetti', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // un'altra scheda con una versione più nuova dell'app chiede l'aggiornamento: si chiude la connessione
      db.onversionchange = () => db.close();
      risolvi(db);
    };
    req.onerror = () => rifiuta(req.error ?? new Error('IndexedDB non disponibile'));
    // onblocked: un'altra scheda usa ancora la versione precedente; l'apertura prosegue appena si chiude
  });
  return dbPromise;
}

function promessa<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((risolvi, rifiuta) => {
    req.onsuccess = () => risolvi(req.result);
    req.onerror = () => rifiuta(req.error);
  });
}

async function store(nome: string, modo: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  const db = await apri();
  return db.transaction(nome, modo).objectStore(nome);
}

export async function elencoScenari(): Promise<ScenarioSalvato[]> {
  if (!(await disponibile())) return [...memoria.scenari.values()].sort((a, b) => a.importatoIl - b.importatoIl);
  const s = await store('scenari');
  const tutti = await promessa(s.getAll() as IDBRequest<ScenarioSalvato[]>);
  return tutti.sort((a, b) => a.importatoIl - b.importatoIl);
}

export async function leggiScenario(id: string): Promise<ScenarioSalvato | undefined> {
  if (!(await disponibile())) return memoria.scenari.get(id);
  const s = await store('scenari');
  return promessa(s.get(id) as IDBRequest<ScenarioSalvato | undefined>);
}

export async function salvaScenario(sc: ScenarioSalvato): Promise<void> {
  if (!(await disponibile())) return void memoria.scenari.set(sc.id, sc);
  const s = await store('scenari', 'readwrite');
  await promessa(s.put(sc));
}

export async function eliminaScenario(id: string): Promise<void> {
  if (!(await disponibile())) {
    memoria.scenari.delete(id);
    return azzeraProgressi(id);
  }
  const s = await store('scenari', 'readwrite');
  await promessa(s.delete(id));
  await azzeraProgressi(id);
}

export async function progressiScenario(scenarioId: string): Promise<Progresso[]> {
  if (!(await disponibile())) return [...memoria.progressi.values()].filter((p) => p.scenarioId === scenarioId);
  const s = await store('progressi');
  return promessa(s.index('scenario').getAll(scenarioId) as IDBRequest<Progresso[]>);
}

export async function salvaProgresso(p: Progresso): Promise<void> {
  if (!(await disponibile())) return void memoria.progressi.set(p.chiave, p);
  const s = await store('progressi', 'readwrite');
  await promessa(s.put(p));
}

export async function azzeraProgressi(scenarioId: string): Promise<void> {
  if (!(await disponibile())) {
    for (const [k, p] of memoria.progressi) if (p.scenarioId === scenarioId) memoria.progressi.delete(k);
    return;
  }
  const s = await store('progressi', 'readwrite');
  const chiavi = await promessa(s.index('scenario').getAllKeys(scenarioId));
  await Promise.all(chiavi.map((k) => promessa(s.delete(k))));
}

export async function leggiImpostazione<T>(chiave: string): Promise<T | undefined> {
  if (!(await disponibile())) return memoria.impostazioni.get(chiave) as T | undefined;
  const s = await store('impostazioni');
  return promessa(s.get(chiave) as IDBRequest<T | undefined>);
}

export async function scriviImpostazione(chiave: string, valore: unknown): Promise<void> {
  if (!(await disponibile())) return void memoria.impostazioni.set(chiave, valore);
  const s = await store('impostazioni', 'readwrite');
  await promessa(s.put(valore, chiave));
}

/** Chiede al browser di non cancellare i dati (Safari li elimina dopo settimane di inutilizzo). */
export async function richiediPersistenza(): Promise<'concessa' | 'negata' | 'non supportata'> {
  if (!navigator.storage?.persist) return 'non supportata';
  try {
    if (await navigator.storage.persisted()) return 'concessa';
    return (await navigator.storage.persist()) ? 'concessa' : 'negata';
  } catch {
    return 'non supportata';
  }
}

export function nuovoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- progetti (sezione Progettazione) ----------

export async function elencoProgetti(): Promise<Progetto[]> {
  const ordina = (l: Progetto[]) => l.sort((a, b) => b.modificato - a.modificato);
  if (!(await disponibile())) return ordina([...memoria.progetti.values()].map((p) => structuredClone(p)));
  const s = await store('progetti');
  return ordina(await promessa(s.getAll() as IDBRequest<Progetto[]>));
}

export async function salvaProgetto(p: Progetto): Promise<void> {
  if (!(await disponibile())) return void memoria.progetti.set(p.id, structuredClone(p));
  const s = await store('progetti', 'readwrite');
  await promessa(s.put(p));
}

export async function eliminaProgetto(id: string): Promise<void> {
  if (!(await disponibile())) return void memoria.progetti.delete(id);
  const s = await store('progetti', 'readwrite');
  await promessa(s.delete(id));
}
