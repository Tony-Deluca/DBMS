export type Richiesta =
  | { tipo: 'carica'; statements: string[] }
  | { tipo: 'esegui'; sql: string; maxRighe: number }
  | { tipo: 'verifica'; sql: string; soluzioni: string[]; maxRighe: number }
  | { tipo: 'prova'; statements: string[]; esercizi: { id: string; soluzioni: string[] }[]; tabelleLogico: string[] };
