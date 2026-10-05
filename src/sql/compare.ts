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
  /** uguale, ma le colonne dell'utente sono in un ordine diverso da quello della soluzione */
  colonnePermutate?: boolean;
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
 * Come si controlla l'ordine delle righe per una soluzione ufficiale:
 * - null: la soluzione non ha ORDER BY, l'ordine non conta;
 * - gruppi: ORDER BY con chiavi note; `lunghezze` sono le lunghezze delle sequenze consecutive di righe a pari
 *   chiave (le righe di uno stesso gruppo possono comparire in qualsiasi ordine, i gruppi no);
 * - rigido: ORDER BY di cui non si conoscono le chiavi, si confronta la sequenza delle righe intere.
 */
export type InfoOrdine = null | { tipo: 'gruppi'; lunghezze: number[] } | { tipo: 'rigido' };

export interface Riferimento {
  sql: string;
  risultato: Risultato;
  ordine: InfoOrdine;
}

function lunghezzeGruppi(chiavi: Valore[][]): number[] {
  const out: number[] = [];
  for (let i = 0; i < chiavi.length; i++) {
    if (i > 0 && righeUguali(chiavi[i], chiavi[i - 1])) out[out.length - 1]++;
    else out.push(1);
  }
  return out;
}

/**
 * Calcola come controllare l'ordine per una soluzione già eseguita.
 * @param chiavi valori delle chiavi d'ordinamento per riga, quando non sono colonne del risultato
 *   (vedi riscriviConChiavi); se mancano e non si ricavano dalle colonne, l'ordine è «rigido».
 */
export function infoOrdine(sqlUfficiale: string, ris: Risultato, chiavi?: Valore[][] | null): InfoOrdine {
  const voci = orderByEsterno(sqlUfficiale);
  if (!voci || voci.length === 0) return null;
  const indici = colonneOrdinamento(voci, ris.colonne);
  if (indici) return { tipo: 'gruppi', lunghezze: lunghezzeGruppi(ris.righe.map((r) => indici.map((i) => r[i]))) };
  if (chiavi && chiavi.length === ris.righe.length) return { tipo: 'gruppi', lunghezze: lunghezzeGruppi(chiavi) };
  return { tipo: 'rigido' };
}

/** Riferimento senza accesso al database (ORDER BY riconducibile alle colonne del risultato, oppure rigido). */
export function riferimentoDaRisultato(sql: string, risultato: Risultato): Riferimento {
  return { sql, risultato, ordine: infoOrdine(sql, risultato) };
}

const MAX_PROVE_PERMUTAZIONE = 5000;

/**
 * Cerca una permutazione delle colonne dell'utente tale che le righe coincidano (come multiinsieme) con quelle
 * attese. Restituisce `perm` con perm[i] = indice della colonna dell'utente da usare come i-esima colonna
 * attesa, oppure null.
 */
export function trovaPermutazione(atteso: Risultato, ottenuto: Risultato): number[] | null {
  const n = atteso.colonne.length;
  const chiaviColonna = (ris: Risultato, c: number) => ris.righe.map((r) => chiaveValore(r[c])).sort().join('\u0002');
  const impronteAttese = Array.from({ length: n }, (_, i) => chiaviColonna(atteso, i));
  const impronteUtente = Array.from({ length: n }, (_, j) => chiaviColonna(ottenuto, j));
  // candidati: colonne dell'utente con lo stesso multiinsieme di valori
  const candidati = impronteAttese.map((a) => impronteUtente.map((u, j) => (u === a ? j : -1)).filter((j) => j >= 0));
  if (candidati.some((c) => c.length === 0)) return null;

  const perm: number[] = new Array(n).fill(-1);
  const usate = new Array<boolean>(n).fill(false);
  let prove = 0;
  // si assegnano prima le colonne con meno candidati
  const ordine = [...Array(n).keys()].sort((a, b) => candidati[a].length - candidati[b].length);
  const cerca = (k: number): boolean => {
    if (k === n) {
      if (++prove > MAX_PROVE_PERMUTAZIONE) return false;
      const riordinate = ottenuto.righe.map((r) => perm.map((j) => r[j]));
      const d = differenzaMultiinsiemi(atteso.righe, riordinate);
      return d.mancanti.length === 0 && d.inPiu.length === 0;
    }
    const i = ordine[k];
    for (const j of candidati[i]) {
      if (usate[j]) continue;
      usate[j] = true;
      perm[i] = j;
      if (cerca(k + 1)) return true;
      if (prove > MAX_PROVE_PERMUTAZIONE) return false;
      usate[j] = false;
      perm[i] = -1;
    }
    return false;
  };
  return cerca(0) ? [...perm] : null;
}

function ordineRispettato(info: InfoOrdine, atteso: Valore[][], ottenuto: Valore[][]): number | null {
  if (!info) return null;
  if (info.tipo === 'rigido') {
    for (let i = 0; i < atteso.length; i++) if (!righeUguali(atteso[i], ottenuto[i])) return i + 1;
    return null;
  }
  // gruppi di righe a pari chiave: ogni gruppo dell'utente deve contenere le stesse righe del gruppo atteso
  let pos = 0;
  for (const len of info.lunghezze) {
    const d = differenzaMultiinsiemi(atteso.slice(pos, pos + len), ottenuto.slice(pos, pos + len));
    if (d.mancanti.length > 0 || d.inPiu.length > 0) {
      // prima riga che differisce, per il messaggio
      for (let i = pos; i < pos + len; i++) {
        if (!righeUguali(atteso[i], ottenuto[i])) return pos + 1;
      }
      return pos + 1;
    }
    pos += len;
  }
  return null;
}

/**
 * Confronta il risultato dell'utente con quello di una soluzione ufficiale (solo i risultati, mai il testo SQL):
 * numero di colonne uguale, righe come multiinsieme, colonne in qualsiasi ordine (con segnalazione),
 * ordine delle righe solo se la soluzione ha un ORDER BY.
 */
export function confrontaRisultati(rif: Riferimento, ottenuto: Risultato): EsitoConfronto {
  const atteso = rif.risultato;
  const ordinato = rif.ordine !== null;

  if (atteso.colonne.length !== ottenuto.colonne.length) {
    return { uguale: false, ordinato, differenza: { tipo: 'colonne', attese: atteso.colonne.length, ottenute: ottenuto.colonne.length } };
  }

  let righeUtente = ottenuto.righe;
  let colonnePermutate = false;
  const { mancanti, inPiu } = differenzaMultiinsiemi(atteso.righe, righeUtente);
  if (mancanti.length > 0 || inPiu.length > 0) {
    // forse le colonne sono in un altro ordine
    const perm = atteso.colonne.length > 1 ? trovaPermutazione(atteso, ottenuto) : null;
    if (!perm) {
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
    righeUtente = ottenuto.righe.map((r) => perm.map((j) => r[j]));
    colonnePermutate = perm.some((j, i) => j !== i);
  }

  const posizione = ordineRispettato(rif.ordine, atteso.righe, righeUtente);
  if (posizione !== null) return { uguale: false, ordinato, differenza: { tipo: 'ordine', posizione } };
  return { uguale: true, ordinato, colonnePermutate };
}

export interface EsitoVerifica {
  corretta: boolean;
  /** Indice della soluzione che coincide (se corretta) o della più vicina. */
  indiceSoluzione: number;
  differenza?: Differenza;
  ordinato: boolean;
  /** Corretta, ma con le colonne in ordine diverso da quello della soluzione ufficiale. */
  colonnePermutate?: boolean;
  /** Numero di database di prova (varianti dei dati) su cui la risposta è stata verificata, oltre a quello originale. */
  databaseDiProva?: number;
  /** La verifica sulle varianti non è stata fatta (es. soluzione con LIMIT) o solo in parte. */
  soloDatiOriginali?: boolean;
  /** Coincide sui dati originali ma non su un database di prova. */
  fallitaSuVariante?: { caratteristiche: string[]; differenza?: Differenza; errore?: boolean };
}

/** Punteggio di "distanza" per scegliere la soluzione più vicina da usare nel feedback. */
function distanza(e: EsitoConfronto): number {
  if (e.uguale) return 0;
  const d = e.differenza!;
  if (d.tipo === 'ordine') return 1;
  if (d.tipo === 'righe') return 2 + d.mancanti + d.inPiu;
  return 1e9 + Math.abs(d.attese - d.ottenute);
}

/** Confronto sui soli dati originali con più soluzioni di riferimento. */
export function verificaControSoluzioni(rif: Riferimento[], ottenuto: Risultato): EsitoVerifica {
  let migliore: { i: number; esito: EsitoConfronto } | null = null;
  const corrette: { i: number; esito: EsitoConfronto }[] = [];
  for (let i = 0; i < rif.length; i++) {
    const esito = confrontaRisultati(rif[i], ottenuto);
    if (esito.uguale) corrette.push({ i, esito });
    else if (!migliore || distanza(esito) < distanza(migliore.esito)) migliore = { i, esito };
  }
  if (corrette.length > 0) {
    // preferisce una soluzione senza permutazione di colonne
    const scelta = corrette.find((c) => !c.esito.colonnePermutate) ?? corrette[0];
    return { corretta: true, indiceSoluzione: scelta.i, ordinato: scelta.esito.ordinato, colonnePermutate: !!scelta.esito.colonnePermutate };
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

/** Feedback quando la risposta coincide sui dati originali ma non su un database di prova (senza rivelare la soluzione). */
export function messaggiVarianteFallita(f: NonNullable<EsitoVerifica['fallitaSuVariante']>): string[] {
  const con = f.caratteristiche.length > 0 ? ` (con ${f.caratteristiche.join(', ')})` : '';
  const m: string[] = [`Funziona sui dati attuali ma non in generale: su un database di prova${con} il risultato non coincide con quello atteso.`];
  if (f.errore) m.push('Su quel database la query dà un errore.');
  else if (f.differenza?.tipo === 'righe') {
    const parti: string[] = [];
    if (f.differenza.mancanti > 0) parti.push(`mancano ${f.differenza.mancanti} ${f.differenza.mancanti === 1 ? 'riga' : 'righe'}`);
    if (f.differenza.inPiu > 0) parti.push(`ci ${f.differenza.inPiu === 1 ? 'è 1 riga' : `sono ${f.differenza.inPiu} righe`} in più`);
    m.push(`Differenza: ${parti.join(' e ')}.`);
  } else if (f.differenza?.tipo === 'ordine') m.push('Le righe sono giuste ma in un ordine diverso da quello richiesto.');
  else if (f.differenza?.tipo === 'colonne') m.push('Il numero di colonne non coincide.');
  const suggerimenti: string[] = [];
  if (f.caratteristiche.includes('valori NULL')) suggerimenti.push('valori NULL (confronti, NOT IN, outer join)');
  if (f.caratteristiche.includes('righe duplicate')) suggerimenti.push('duplicati (DISTINCT, join che moltiplicano le righe)');
  if (f.caratteristiche.includes('righe mancanti')) suggerimenti.push('elementi senza corrispondenze o tabelle vuote (LEFT JOIN, NOT EXISTS)');
  m.push(
    `Controlla casi come ${suggerimenti.length ? suggerimenti.join(', ') : 'NULL, duplicati o elementi senza corrispondenze'}, ed evita di basarti su valori specifici dei dati attuali.`,
  );
  return m;
}

/** Riga di descrizione sui database di prova per l'esito positivo. */
export function testoDatabaseDiProva(v: EsitoVerifica): string {
  const n = v.databaseDiProva ?? 0;
  if (n > 0) return `Verificata su ${n} database di prova (varianti dei dati con righe tolte, duplicate e valori NULL).`;
  if (v.soloDatiOriginali) return 'Verificata solo sui dati dello scenario (per le soluzioni con LIMIT i database di prova non si usano).';
  return '';
}
