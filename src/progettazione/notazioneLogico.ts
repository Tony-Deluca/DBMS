// Notazione testuale dello schema logico (come nelle prove d'esame):
//
//   Studente(_Matricola_, Nome, Cognome, Città*)
//   Esame(_Studente_, _Corso_, Data, Voto)
//
//   Esame.Studente → Studente.Matricola
//   Esame(Studente, Corso) → Iscrizione(Studente, Corso)
//
// _Nome_ = chiave primaria (nel testo semplice la sottolineatura non si può scrivere), Nome* = facoltativo
// (ammette NULL). I vincoli di integrità referenziale usano → oppure ->. Righe che iniziano con -- o # sono commenti.
import { nuovoIdElemento, type ChiaveEsternaP, type SchemaLogicoP, type Tabella } from './modello';

export interface ErroreSintassi {
  riga: number;
  colonna: number;
  messaggio: string;
}

export type EsitoAnalisi = { ok: true; schema: SchemaLogicoP } | { ok: false; errori: ErroreSintassi[] };

const IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const k = (s: string) => s.trim().toLowerCase();

function voceColonna(nome: string, pk: boolean, facoltativa: boolean): string {
  return `${pk ? `_${nome}_` : nome}${facoltativa ? '*' : ''}`;
}

/** Testo nella notazione d'esame (una riga per tabella, poi i vincoli di integrità referenziale). */
export function generaTesto(l: SchemaLogicoP): string {
  const righe = l.tabelle.map((t) => `${t.nome}(${t.colonne.map((c) => voceColonna(c.nome, c.pk, c.facoltativa)).join(', ')})`);
  const vincoli = elencoVincoli(l);
  return vincoli.length ? `${righe.join('\n')}\n\n${vincoli.join('\n')}\n` : `${righe.join('\n')}\n`;
}

/** Vincoli di integrità referenziale, es. «Esame.Studente → Studente.Matricola». */
export function elencoVincoli(l: SchemaLogicoP): string[] {
  const out: string[] = [];
  for (const t of l.tabelle) {
    for (const fk of t.chiaviEsterne) {
      if (fk.colonne.length === 1 && fk.riferimenti.length === 1) out.push(`${t.nome}.${fk.colonne[0]} → ${fk.tabella}.${fk.riferimenti[0]}`);
      else out.push(`${t.nome}(${fk.colonne.join(', ')}) → ${fk.tabella}(${fk.riferimenti.join(', ')})`);
    }
  }
  return out;
}

interface Riferimento {
  tabella: string;
  colonne: string[];
}

/** Analizza «Tab.col» oppure «Tab(col1, col2)». */
function analizzaRiferimento(testo: string, riga: number, colonnaInizio: number, errori: ErroreSintassi[]): Riferimento | null {
  const t = testo.trim();
  const off = colonnaInizio + (testo.length - testo.trimStart().length);
  let m = /^([^.()\s]+)\.([^.()\s]+)$/u.exec(t);
  if (m) {
    if (!IDENT.test(m[1]) || !IDENT.test(m[2])) {
      errori.push({ riga, colonna: off, messaggio: `«${t}» non è un riferimento valido: usa Tabella.Colonna (nomi senza spazi né simboli).` });
      return null;
    }
    return { tabella: m[1], colonne: [m[2]] };
  }
  m = /^([^.()\s]+)\s*\(([^()]*)\)$/u.exec(t);
  if (m) {
    const colonne = m[2].split(',').map((c) => c.trim());
    if (!IDENT.test(m[1]) || colonne.some((c) => !IDENT.test(c))) {
      errori.push({ riga, colonna: off, messaggio: `«${t}» non è un riferimento valido: usa Tabella(Colonna1, Colonna2).` });
      return null;
    }
    return { tabella: m[1], colonne };
  }
  errori.push({ riga, colonna: off, messaggio: `«${t}» non è un riferimento valido: usa Tabella.Colonna oppure Tabella(Colonna1, Colonna2).` });
  return null;
}

/**
 * Converte il testo in schema. Le tabelle già presenti in `precedente` (stesso nome) mantengono id e posizione,
 * così passare dal testo al diagramma non scompiglia il disegno. In caso di errori lo schema non cambia.
 */
export function analizzaTesto(testo: string, precedente?: SchemaLogicoP): EsitoAnalisi {
  const errori: ErroreSintassi[] = [];
  const tabelle: Tabella[] = [];
  const vincoli: { riga: number; colonna: number; da: Riferimento; a: Riferimento }[] = [];
  const righe = testo.replace(/\r\n?/g, '\n').split('\n');

  righe.forEach((grezza, i) => {
    const riga = i + 1;
    const linea = grezza.replace(/\s+$/, '');
    const t = linea.trim();
    if (!t || t.startsWith('--') || t.startsWith('#') || t.startsWith('//')) return;
    if (/^vincoli\b.*:$/i.test(t)) return; // intestazione facoltativa «Vincoli di integrità referenziale:»
    const pulita = t.replace(/^[-•]\s+/, ''); // elenco puntato
    const freccia = /→|->|=>/.exec(pulita);
    const inizio = linea.indexOf(pulita) + 1;
    if (freccia) {
      const sinistra = pulita.slice(0, freccia.index);
      const destra = pulita.slice(freccia.index + freccia[0].length).replace(/;\s*$/, '');
      const da = analizzaRiferimento(sinistra, riga, inizio, errori);
      const a = analizzaRiferimento(destra, riga, inizio + freccia.index + freccia[0].length, errori);
      if (da && a) {
        if (da.colonne.length !== a.colonne.length) {
          errori.push({ riga, colonna: inizio, messaggio: `il vincolo collega ${da.colonne.length} colonne a ${a.colonne.length}: devono essere lo stesso numero.` });
        } else vincoli.push({ riga, colonna: inizio, da, a });
      }
      return;
    }
    const m = /^([^()\s]+)\s*\((.*)\)\s*;?$/u.exec(pulita);
    if (!m) {
      const aperta = pulita.indexOf('(');
      if (aperta < 0) errori.push({ riga, colonna: inizio, messaggio: 'manca «(»: una tabella si scrive Nome(Colonna1, Colonna2, …).' });
      else if (!pulita.includes(')')) errori.push({ riga, colonna: inizio + pulita.length, messaggio: 'manca la parentesi di chiusura «)».' });
      else errori.push({ riga, colonna: inizio, messaggio: 'riga non riconosciuta: scrivi Nome(Colonna1, …) oppure un vincolo Tabella.Colonna → Tabella.Colonna.' });
      return;
    }
    const nome = m[1];
    if (!IDENT.test(nome)) {
      errori.push({ riga, colonna: inizio, messaggio: `«${nome}» non è un nome di tabella valido (lettere, cifre e _ , senza spazi).` });
      return;
    }
    const interno = m[2];
    const inizioInterno = inizio + pulita.indexOf('(') + 1;
    const tabella: Tabella = { id: nuovoIdElemento('t'), nome, x: 0, y: 0, colonne: [], chiaviEsterne: [] };
    let pos = 0;
    if (interno.trim() === '') {
      errori.push({ riga, colonna: inizioInterno, messaggio: `la tabella «${nome}» non ha colonne.` });
      return;
    }
    for (const parte of interno.split(',')) {
      const col = inizioInterno + pos + (parte.length - parte.trimStart().length);
      pos += parte.length + 1;
      let v = parte.trim();
      if (!v) {
        errori.push({ riga, colonna: col, messaggio: 'colonna vuota: c\'è una virgola di troppo.' });
        continue;
      }
      const facoltativa = v.endsWith('*');
      if (facoltativa) v = v.slice(0, -1).trim();
      let pk = false;
      if (v.length > 2 && v.startsWith('_') && v.endsWith('_')) {
        pk = true;
        v = v.slice(1, -1);
      }
      if (!IDENT.test(v)) {
        errori.push({ riga, colonna: col, messaggio: `«${parte.trim()}» non è un nome di colonna valido: usa lettere, cifre e _ (chiave primaria: _Nome_, facoltativo: Nome*).` });
        continue;
      }
      if (pk && facoltativa) {
        errori.push({ riga, colonna: col, messaggio: `«${parte.trim()}»: una colonna della chiave primaria non può essere facoltativa.` });
        continue;
      }
      tabella.colonne.push({ id: nuovoIdElemento('c'), nome: v, pk, facoltativa });
    }
    tabelle.push(tabella);
  });

  for (const v of vincoli) {
    const t = tabelle.find((x) => k(x.nome) === k(v.da.tabella));
    if (!t) {
      errori.push({ riga: v.riga, colonna: v.colonna, messaggio: `la tabella «${v.da.tabella}» del vincolo non è definita nel testo.` });
      continue;
    }
    const mancanti = v.da.colonne.filter((c) => !t.colonne.some((x) => k(x.nome) === k(c)));
    if (mancanti.length) {
      errori.push({ riga: v.riga, colonna: v.colonna, messaggio: `la tabella «${t.nome}» non ha la colonna «${mancanti[0]}».` });
      continue;
    }
    const nomiReali = v.da.colonne.map((c) => t.colonne.find((x) => k(x.nome) === k(c))!.nome);
    const fk: ChiaveEsternaP = { id: nuovoIdElemento('f'), colonne: nomiReali, tabella: v.a.tabella, riferimenti: v.a.colonne };
    t.chiaviEsterne.push(fk);
  }

  if (errori.length) return { ok: false, errori: errori.sort((a, b) => a.riga - b.riga || a.colonna - b.colonna) };

  // conserva id e posizioni delle tabelle già disegnate
  let nuove = 0;
  const maxY = Math.max(0, ...(precedente?.tabelle ?? []).map((t) => t.y + 60 + t.colonne.length * 24));
  for (const t of tabelle) {
    const vecchia = precedente?.tabelle.find((x) => k(x.nome) === k(t.nome));
    if (vecchia) {
      t.id = vecchia.id;
      t.x = vecchia.x;
      t.y = vecchia.y;
      for (const c of t.colonne) {
        const vc = vecchia.colonne.find((x) => k(x.nome) === k(c.nome));
        if (vc) c.id = vc.id;
      }
      for (const fk of t.chiaviEsterne) {
        const vf = vecchia.chiaviEsterne.find((x) => k(x.tabella) === k(fk.tabella) && x.colonne.map(k).join() === fk.colonne.map(k).join());
        if (vf) fk.id = vf.id;
      }
    } else {
      t.x = 40 + (nuove % 3) * 260;
      t.y = (precedente?.tabelle.length ? maxY + 40 : 40) + Math.floor(nuove / 3) * 220;
      nuove++;
    }
  }
  return { ok: true, schema: { tabelle } };
}
