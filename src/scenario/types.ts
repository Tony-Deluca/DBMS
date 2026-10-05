// Formato dello scenario, versione 1. Documentato in SCHEMA.md.

export const VERSIONE_SCHEMA = 1;

export interface Scenario {
  version: number;
  metadati: Metadati;
  er: ModelloER;
  logico: ModelloLogico;
  database: Database;
  esercizi: Esercizio[];
}

export interface Metadati {
  titolo: string;
  descrizione?: string;
  dominio?: string;
  autore?: string;
}

export interface AttributoER {
  nome: string;
  /** Fa parte dell'identificatore (interno) dell'entità. */
  chiave?: boolean;
  /** Cardinalità dell'attributo, es. "(0,1)" opzionale, "(1,N)" multivalore. Default (1,1). */
  cardinalita?: string;
}

export interface EntitaER {
  nome: string;
  attributi: AttributoER[];
  /** Nomi delle relazioni che contribuiscono all'identificatore (identificatore esterno). */
  identificatoreEsterno?: string[];
}

export interface PartecipazioneER {
  entita: string;
  cardinalita: string;
  ruolo?: string;
}

export interface RelazioneER {
  nome: string;
  partecipanti: PartecipazioneER[];
  attributi?: AttributoER[];
}

export interface GeneralizzazioneER {
  padre: string;
  figlie: string[];
  /** "(t,e)", "(t,s)", "(p,e)", "(p,s)" */
  copertura?: string;
}

export interface ModelloER {
  entita: EntitaER[];
  relazioni: RelazioneER[];
  generalizzazioni?: GeneralizzazioneER[];
}

export interface ColonnaLogico {
  nome: string;
  tipo: string;
  nullable?: boolean;
}

export interface ChiaveEsterna {
  colonne: string[];
  tabella: string;
  riferimenti: string[];
}

export interface TabellaLogico {
  nome: string;
  colonne: ColonnaLogico[];
  chiavePrimaria: string[];
  chiaviEsterne?: ChiaveEsterna[];
  unici?: string[][];
}

export interface ModelloLogico {
  tabelle: TabellaLogico[];
}

export interface Database {
  statements: string[];
}

export interface Esercizio {
  id: string;
  titolo?: string;
  /** 1 (facile) … 5 (difficile) */
  difficolta: number;
  argomento?: string;
  traccia: string;
  soluzioni: string[];
  suggerimento?: string;
}

/** Scenario salvato nel browser. */
export interface ScenarioSalvato {
  id: string;
  nome: string;
  dati: Scenario;
  importatoIl: number;
  origine: 'esempio' | 'importato';
}
