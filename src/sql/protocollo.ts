import type { ModelloLogico } from '../scenario/types';
import type { RichiestaPagina } from './dati';

export type Richiesta =
  | { tipo: 'carica'; statements: string[]; logico: ModelloLogico | null }
  | { tipo: 'esegui'; sql: string; maxRighe: number }
  | { tipo: 'tabelle' }
  | { tipo: 'pagina'; richiesta: RichiestaPagina }
  | { tipo: 'verifica'; sql: string; soluzioni: string[]; maxRighe: number }
  | { tipo: 'prova'; statements: string[]; esercizi: { id: string; soluzioni: string[] }[]; tabelleLogico: string[]; logico: ModelloLogico | null };
