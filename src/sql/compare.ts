import { colonneOrdinamento, orderByEsterno } from './orderBy';

export type Valore = number | string | Uint8Array | null;

export interface Risultato {
  colonne: string[];
  righe: Valore[][];
}

export type Differenza =
  | { tipo: 'colonne'; attese: number; ottenute: number }
  | {
      tipo: 'righe';
      mancanti: number;
      inPiu: number;
      esempioMancante?: Valore[];
      esempioInPiu?: Valore[];
      attese: number;
      ottenute: number;
      /** le righe in più sono copie di righe attese (manca un DISTINCT?) */
      inPiuDuplicati?: boolean;
    }
  | { tipo: 'ordine'; posizione: number };

export interface EsitoConfronto {
  uguale: boolean;
  differenza?: Differenza;
  /** true se il confronto ha tenuto conto dell'ordine delle righe. */
  ordinato: boolean;
}

const TOLLERANZA = 1e-6;

export function valoriUguali(a: Valore, b: Valore): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return true;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) <= TOLLERANZA * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return false;
}

function righeUguali(a: Valore[], b: Valore[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!valoriUguali(a[i], b[i])) return false;
  return true;
}

/** Chiave canonica di un valore: i numeri sono arrotondati a 9 cifre significative. */
function chiaveValore(v: Valore): string {
  if (v === null) return 'n';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return 'd' + v;
    return 'd' + Number(v.toPrecision(9));
  }
  if (typeof v === 'string') return 's' + v.length + ':' + v;
  return 'b' + Array.from(v).join(',');
}

function chiaveRiga(r: Valore[]): string {
  return r.map(chiaveValore).join('\u0001');
}

/**
 * Differenza tra multiinsiemi di righe: restituisce le righe di `attese` che
 * mancano in `ottenute` e quelle di `ottenute` in più rispetto ad `attese`.
 */
export function differenzaMultiinsiemi(attese: Valore[][], ottenute: Valore[][]): { mancanti: Valore[][]; inPiu: Valore[][] } {
  const conteggio = new Map<string, Valore[][]>();
  for (const r of attese) {
    const k = chiaveRiga(r);
    const lista = conteggio.get(k);
    if (lista) lista.push(r);
    else conteggio.set(k, [r]);
  }
  let inPiu: Valore[][] = [];
  for (const r of ottenute) {
    const k = chiaveRiga(r);
    const lista = conteggio.get(k);
    if (lista && lista.length > 0) lista.pop();
    else inPiu.push(r);
  }
  let mancanti: Valore[][] = [];
  for (const lista of conteggio.values()) mancanti.push(...lista);

  // Secondo passaggio con tolleranza (numeri vicini al confine di arrotondamento).
  if (mancanti.length > 0 && inPiu.length > 0 && mancanti.length * inPiu.length <= 4_000_000) {
    const usate = new Array<boolean>(inPiu.length).fill(false);
    const restanti: Valore[][] = [];
    for (const m of mancanti) {
      const j = inPiu.findIndex((r, idx) => !usate[idx] && righeUguali(m, r));
      if (j >= 0) usate[j] = true;
      else restanti.push(m);
    }
    mancanti = restanti;
    inPiu = inPiu.filter((_, idx) => !usate[idx]);
  }
  return { mancanti, inPiu };
}

/**
 * Confronta il risultato dell'utente con quello di una soluzione ufficiale.
 * @param sqlUfficiale testo della soluzione: serve a capire se l'ordine conta.
 */
export function confrontaRisultati(atteso: Risultato, ottenuto: Risultato, sqlUfficiale: string): EsitoConfronto {
  const voci = orderByEsterno(sqlUfficiale);
  const ordinato = voci !== null && voci.length > 0;

  if (atteso.colonne.length !== ottenuto.colonne.length) {
    return { uguale: false, ordinato, differenza: { tipo: 'colonne', attese: atteso.colonne.length, ottenute: ottenuto.colonne.length } };
  }

  const { mancanti, inPiu } = differenzaMultiinsiemi(atteso.righe, ottenuto.righe);
  if (mancanti.length > 0 || inPiu.length > 0) {
    const chiaviAttese = new Set(atteso.righe.map(chiaveRiga));
    const inPiuDuplicati = inPiu.length > 0 && inPiu.every((r) => chiaviAttese.has(chiaveRiga(r)));
    return {
      uguale: false,
      ordinato,
      differenza: {
        tipo: 'righe',
        mancanti: mancanti.length,
        inPiu: inPiu.length,
        esempioMancante: mancanti[0],
        esempioInPiu: inPiu[0],
        attese: atteso.righe.length,
        ottenute: ottenuto.righe.length,
        inPiuDuplicati,
      },
    };
  }

  if (ordinato) {
    // Se l'ORDER BY usa colonne del risultato confronto solo le chiavi
    // d'ordinamento: le righe a pari merito possono stare in qualunque ordine.
    const indici = colonneOrdinamento(voci!, atteso.colonne);
    const proietta = (r: Valore[]) => (indici ? indici.map((i) => r[i]) : r);
    for (let i = 0; i < atteso.righe.length; i++) {
      if (!righeUguali(proietta(atteso.righe[i]), proietta(ottenuto.righe[i]))) {
        return { uguale: false, ordinato, differenza: { tipo: 'ordine', posizione: i + 1 } };
      }
    }
  }
  return { uguale: true, ordinato };
}

export interface EsitoVerifica {
  corretta: boolean;
  /** Indice della soluzione che coincide (se corretta) o della più vicina. */
  indiceSoluzione: number;
  differenza?: Differenza;
  ordinato: boolean;
}

/** Punteggio di "distanza" per scegliere la soluzione più vicina da usare nel feedback. */
function distanza(e: EsitoConfronto): number {
  if (e.uguale) return 0;
  const d = e.differenza!;
  if (d.tipo === 'ordine') return 1;
  if (d.tipo === 'righe') return 2 + d.mancanti + d.inPiu;
  return 1e9 + Math.abs(d.attese - d.ottenute);
}

export function verificaControSoluzioni(
  soluzioni: { sql: string; risultato: Risultato }[],
  ottenuto: Risultato,
): EsitoVerifica {
  let migliore: { i: number; esito: EsitoConfronto } | null = null;
  for (let i = 0; i < soluzioni.length; i++) {
    const esito = confrontaRisultati(soluzioni[i].risultato, ottenuto, soluzioni[i].sql);
    if (esito.uguale) return { corretta: true, indiceSoluzione: i, ordinato: esito.ordinato };
    if (!migliore || distanza(esito) < distanza(migliore.esito)) migliore = { i, esito };
  }
  return {
    corretta: false,
    indiceSoluzione: migliore ? migliore.i : 0,
    differenza: migliore?.esito.differenza,
    ordinato: migliore?.esito.ordinato ?? false,
  };
}

/** Rappresentazione testuale breve di una riga, per i messaggi. */
export function rigaInTesto(r: Valore[]): string {
  return (
    '(' +
    r
      .map((v) => {
        if (v === null) return 'NULL';
        if (typeof v === 'number') return String(v);
        if (typeof v === 'string') return `'${v.length > 40 ? v.slice(0, 40) + '…' : v}'`;
        return `[blob ${v.length} byte]`;
      })
      .join(', ') +
    ')'
  );
}

/** Messaggi di feedback in italiano, senza rivelare la soluzione. */
export function messaggiFeedback(d: Differenza): string[] {
  switch (d.tipo) {
    case 'colonne':
      return [
        `Il risultato dovrebbe avere ${d.attese} ${d.attese === 1 ? 'colonna' : 'colonne'}, la tua query ne restituisce ${d.ottenute}.`,
        d.ottenute > d.attese
          ? 'Controlla la clausola SELECT: forse stai proiettando attributi non richiesti.'
          : 'Controlla la clausola SELECT: manca qualche attributo richiesto dalla traccia.',
      ];
    case 'righe': {
      const m: string[] = [`Righe attese: ${d.attese}, righe ottenute: ${d.ottenute}.`];
      if (d.mancanti > 0) {
        m.push(`Mancano ${d.mancanti} ${d.mancanti === 1 ? 'riga' : 'righe'}${d.esempioMancante ? `, ad esempio ${rigaInTesto(d.esempioMancante)}` : ''}.`);
      }
      if (d.inPiu > 0) {
        m.push(`Ci sono ${d.inPiu} ${d.inPiu === 1 ? 'riga' : 'righe'} in più${d.esempioInPiu ? `, ad esempio ${rigaInTesto(d.esempioInPiu)}` : ''}.`);
      }
      if (d.mancanti === 0 && d.inPiuDuplicati) {
        m.push('Le righe in più sono ripetizioni di righe corrette: manca un DISTINCT, oppure un join moltiplica le righe.');
      } else if (d.mancanti === 0 && d.inPiu > 0) {
        m.push('Suggerimento: le condizioni sono troppo permissive (WHERE/HAVING) o manca una condizione di join.');
      } else if (d.inPiu === 0 && d.mancanti > 0) {
        m.push('Suggerimento: condizioni troppo restrittive? Pensa ai valori NULL e alle tuple senza corrispondenze (outer join).');
      }
      return m;
    }
    case 'ordine':
      return [
        'Le righe sono giuste, ma l\'ordine non è quello richiesto.',
        `La prima differenza è alla riga ${d.posizione}. Controlla ORDER BY (criteri e ASC/DESC).`,
      ];
  }
}
