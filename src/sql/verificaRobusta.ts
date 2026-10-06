// Verifica completa di una risposta: sui dati originali e su alcuni database di prova.
//
// La risposta è corretta se coincide con UNA STESSA soluzione di riferimento sui dati originali e su tutte le
// varianti utilizzabili (righe tolte, duplicate, valori NULL). Non è una prova formale di equivalenza ma un
// controllo pratico che rende improbabili le coincidenze fortuite.
import type { Db } from './motore';
import { confrontaRisultati, verificaControSoluzioni, type Differenza, type EsitoVerifica, type Riferimento, type Risultato } from './compare';
import { esegui, riferimentiUfficiali, riferimentoPer, type RispostaVerifica } from './engine';
import { haLimitEsterno } from './orderBy';
import type { VariantiDB, Variante } from './varianti';

async function riferimentoVariante(v: Variante, sql: string): Promise<Riferimento | null> {
  if (v.riferimenti.has(sql)) return v.riferimenti.get(sql)!;
  let r: Riferimento | null;
  try {
    r = await riferimentoPer(v.db, sql);
  } catch {
    r = null; // la soluzione ufficiale dà errore su questa variante: la variante si scarta
  }
  v.riferimenti.set(sql, r);
  return r;
}

export async function verificaCompleta(
  db: Db,
  varianti: VariantiDB | null,
  testo: string,
  soluzioni: string[],
  maxRighe: number,
): Promise<RispostaVerifica> {
  const t0 = performance.now();
  const ottenuto = await esegui(db, testo);
  const millisecondi = performance.now() - t0;
  const risultato = {
    colonne: ottenuto.colonne,
    righe: ottenuto.righe.slice(0, maxRighe),
    totaleRighe: ottenuto.righe.length,
    troncato: ottenuto.righe.length > maxRighe,
    millisecondi,
  };

  // 1. dati originali
  const rif0 = await riferimentiUfficiali(db, soluzioni);
  let candidati = rif0
    .map((r, i) => ({ i, esito: confrontaRisultati(r, ottenuto) }))
    .filter((c) => c.esito.uguale);
  if (candidati.length === 0) {
    // nessuna soluzione coincide: il feedback usa la più vicina
    return { esito: verificaControSoluzioni(rif0, ottenuto), risultato };
  }
  const ordinato = candidati.some((c) => c.esito.ordinato);

  // 2. database di prova
  let verificate = 0;
  if (varianti) {
    for (const v of await varianti.tutte()) {
      const rifs: (Riferimento | null)[] = [];
      for (const s of soluzioni) rifs.push(await riferimentoVariante(v, s));
      if (rifs.some((r) => r === null)) continue; // variante scartata
      let utenteV: Risultato | null = null;
      let erroreUtente = false;
      try {
        utenteV = await esegui(v.db, testo);
      } catch {
        erroreUtente = true;
      }
      verificate++;
      const restano: typeof candidati = [];
      let ultima: Differenza | undefined;
      for (const c of candidati) {
        // le soluzioni con LIMIT dipendono dai pareggi: si verificano solo sui dati originali
        if (haLimitEsterno(soluzioni[c.i])) {
          restano.push(c);
          continue;
        }
        if (erroreUtente || !utenteV) continue;
        const e = confrontaRisultati(rifs[c.i]!, utenteV);
        if (e.uguale) restano.push(c);
        else ultima = e.differenza;
      }
      if (restano.length === 0) {
        const esito: EsitoVerifica = {
          corretta: false,
          indiceSoluzione: candidati[0].i,
          ordinato,
          databaseDiProva: verificate,
          fallitaSuVariante: { caratteristiche: v.caratteristiche, differenza: ultima, errore: erroreUtente },
        };
        return { esito, risultato };
      }
      candidati = restano;
    }
  }

  const scelta = candidati.find((c) => !c.esito.colonnePermutate) ?? candidati[0];
  const soloOriginali = verificate === 0 || candidati.every((c) => haLimitEsterno(soluzioni[c.i]));
  const esito: EsitoVerifica = {
    corretta: true,
    indiceSoluzione: scelta.i,
    ordinato: scelta.esito.ordinato,
    colonnePermutate: !!scelta.esito.colonnePermutate,
    databaseDiProva: soloOriginali ? 0 : verificate,
    soloDatiOriginali: soloOriginali,
  };
  return { esito, risultato };
}
