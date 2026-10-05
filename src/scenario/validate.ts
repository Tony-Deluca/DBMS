// Validazione strutturale e di coerenza dello scenario, con messaggi in italiano
// che indicano il percorso del campo sbagliato (es. esercizi[2].soluzioni[0]).
import { VERSIONE_SCHEMA, type Scenario } from './types';
import { controllaQuery } from '../sql/guard';

export interface Problema {
  livello: 'errore' | 'avviso';
  percorso: string;
  messaggio: string;
}

export const RE_CARDINALITA = /^\(\s*(0|1|[0-9]+)\s*,\s*(1|N|n|[0-9]+)\s*\)$/;
export const RE_COPERTURA = /^\(\s*[tp]\s*,\s*[es]\s*\)$/;

type Obj = Record<string, unknown>;

class Validatore {
  problemi: Problema[] = [];

  errore(percorso: string, messaggio: string) {
    this.problemi.push({ livello: 'errore', percorso, messaggio });
  }
  avviso(percorso: string, messaggio: string) {
    this.problemi.push({ livello: 'avviso', percorso, messaggio });
  }

  oggetto(v: unknown, p: string): v is Obj {
    if (v === undefined) {
      this.errore(p, 'campo obbligatorio mancante (deve essere un oggetto { … }).');
      return false;
    }
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      this.errore(p, `deve essere un oggetto { … }, trovato ${descrivi(v)}.`);
      return false;
    }
    return true;
  }

  array(v: unknown, p: string, min = 0, max = Infinity): v is unknown[] {
    if (v === undefined) {
      this.errore(p, 'campo obbligatorio mancante (deve essere un array [ … ]).');
      return false;
    }
    if (!Array.isArray(v)) {
      this.errore(p, `deve essere un array [ … ], trovato ${descrivi(v)}.`);
      return false;
    }
    if (v.length < min) this.errore(p, min === 1 ? 'non può essere vuoto.' : `deve contenere almeno ${min} elementi (ne ha ${v.length}).`);
    if (v.length > max) this.errore(p, `può contenere al massimo ${max} elementi (ne ha ${v.length}).`);
    return true;
  }

  stringa(v: unknown, p: string, obbligatoria = true): v is string {
    if (v === undefined) {
      if (obbligatoria) this.errore(p, 'campo obbligatorio mancante (deve essere una stringa).');
      return false;
    }
    if (typeof v !== 'string') {
      this.errore(p, `deve essere una stringa, trovato ${descrivi(v)}.`);
      return false;
    }
    if (obbligatoria && !v.trim()) {
      this.errore(p, 'non può essere una stringa vuota.');
      return false;
    }
    return true;
  }

  booleano(v: unknown, p: string): void {
    if (v !== undefined && typeof v !== 'boolean') this.errore(p, `deve essere true o false, trovato ${descrivi(v)}.`);
  }

  campiSconosciuti(o: Obj, p: string, ammessi: string[]) {
    for (const k of Object.keys(o)) {
      if (!ammessi.includes(k)) {
        const simile = ammessi.find((a) => a.toLowerCase() === k.toLowerCase() || senzaAccenti(a) === senzaAccenti(k));
        this.avviso(`${p}.${k}`, simile ? `campo sconosciuto: forse intendevi «${simile}»?` : `campo sconosciuto, viene ignorato (ammessi: ${ammessi.join(', ')}).`);
      }
    }
  }
}

function senzaAccenti(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function descrivi(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'un array';
  if (typeof v === 'string') return `la stringa "${v.length > 30 ? v.slice(0, 30) + '…' : v}"`;
  if (typeof v === 'number') return `il numero ${v}`;
  if (typeof v === 'boolean') return `il valore ${v}`;
  return 'un oggetto';
}

function chiave(s: string): string {
  return s.trim().toLowerCase();
}

/** Validazione completa (senza eseguire SQL). Gli errori bloccano l'import, gli avvisi no. */
export function validaScenario(dati: unknown): Problema[] {
  const v = new Validatore();
  if (!v.oggetto(dati, 'radice')) return v.problemi;
  const s = dati;
  v.campiSconosciuti(s, 'radice', ['version', 'metadati', 'er', 'logico', 'database', 'esercizi']);

  // version
  if (s.version === undefined) v.errore('version', `campo obbligatorio mancante: aggiungi "version": ${VERSIONE_SCHEMA}.`);
  else if (typeof s.version !== 'number' || !Number.isInteger(s.version)) v.errore('version', `deve essere un numero intero, trovato ${descrivi(s.version)}.`);
  else if (s.version > VERSIONE_SCHEMA) v.errore('version', `versione ${s.version} non supportata: questa app legge fino alla versione ${VERSIONE_SCHEMA}. Aggiorna l'app.`);
  else if (s.version < 1) v.errore('version', 'deve essere almeno 1.');

  // metadati
  if (v.oggetto(s.metadati, 'metadati')) {
    const m = s.metadati;
    v.campiSconosciuti(m, 'metadati', ['titolo', 'descrizione', 'dominio', 'autore']);
    v.stringa(m.titolo, 'metadati.titolo');
    v.stringa(m.descrizione, 'metadati.descrizione', false);
    v.stringa(m.dominio, 'metadati.dominio', false);
    v.stringa(m.autore, 'metadati.autore', false);
  }

  // ER
  const entita = new Set<string>();
  if (v.oggetto(s.er, 'er')) {
    const er = s.er;
    v.campiSconosciuti(er, 'er', ['entita', 'relazioni', 'generalizzazioni']);
    const relazioni = new Set<string>();
    if (Array.isArray(er.relazioni)) for (const r of er.relazioni) if (r && typeof (r as Obj).nome === 'string') relazioni.add(chiave((r as Obj).nome as string));

    if (v.array(er.entita, 'er.entita', 1)) {
      er.entita.forEach((e, i) => {
        const p = `er.entita[${i}]`;
        if (!v.oggetto(e, p)) return;
        v.campiSconosciuti(e, p, ['nome', 'attributi', 'identificatoreEsterno']);
        if (v.stringa(e.nome, `${p}.nome`)) {
          if (entita.has(chiave(e.nome))) v.errore(`${p}.nome`, `l'entità «${e.nome}» è definita due volte.`);
          entita.add(chiave(e.nome));
        }
        const attr = validaAttributi(v, e.attributi, `${p}.attributi`, true);
        const haChiave = attr.some((a) => a.chiave === true);
        if (e.identificatoreEsterno !== undefined) {
          if (v.array(e.identificatoreEsterno, `${p}.identificatoreEsterno`, 1)) {
            e.identificatoreEsterno.forEach((r, j) => {
              if (v.stringa(r, `${p}.identificatoreEsterno[${j}]`) && !relazioni.has(chiave(r))) {
                v.errore(`${p}.identificatoreEsterno[${j}]`, `la relazione «${r}» non esiste in er.relazioni.`);
              }
            });
          }
        }
        if (attr.length > 0 && !haChiave && e.identificatoreEsterno === undefined && !eFiglia(er, e.nome)) {
          v.avviso(`${p}.attributi`, `l'entità «${String(e.nome)}» non ha attributi con "chiave": true (manca l'identificatore).`);
        }
      });
    }
    if (v.array(er.relazioni, 'er.relazioni')) {
      const nomiRel = new Set<string>();
      er.relazioni.forEach((r, i) => {
        const p = `er.relazioni[${i}]`;
        if (!v.oggetto(r, p)) return;
        v.campiSconosciuti(r, p, ['nome', 'partecipanti', 'attributi']);
        if (v.stringa(r.nome, `${p}.nome`)) {
          if (nomiRel.has(chiave(r.nome))) v.errore(`${p}.nome`, `la relazione «${r.nome}» è definita due volte.`);
          if (entita.has(chiave(r.nome))) v.errore(`${p}.nome`, `«${r.nome}» è già il nome di un'entità: usa nomi diversi.`);
          nomiRel.add(chiave(r.nome));
        }
        if (v.array(r.partecipanti, `${p}.partecipanti`, 2)) {
          r.partecipanti.forEach((pa, j) => {
            const pp = `${p}.partecipanti[${j}]`;
            if (!v.oggetto(pa, pp)) return;
            v.campiSconosciuti(pa, pp, ['entita', 'cardinalita', 'ruolo']);
            if (v.stringa(pa.entita, `${pp}.entita`) && !entita.has(chiave(pa.entita))) {
              v.errore(`${pp}.entita`, `l'entità «${pa.entita}» non esiste in er.entita.`);
            }
            if (v.stringa(pa.cardinalita, `${pp}.cardinalita`)) controllaCardinalita(v, pa.cardinalita, `${pp}.cardinalita`);
            v.stringa(pa.ruolo, `${pp}.ruolo`, false);
          });
          const nomi = r.partecipanti.map((pa) => (pa && typeof pa === 'object' ? chiave(String((pa as Obj).entita)) : ''));
          if (new Set(nomi).size < nomi.length && r.partecipanti.some((pa) => !(pa as Obj)?.ruolo)) {
            v.avviso(`${p}.partecipanti`, 'relazione ricorsiva: indica il "ruolo" di ciascun partecipante.');
          }
        }
        if (r.attributi !== undefined) validaAttributi(v, r.attributi, `${p}.attributi`, false);
      });
    }
    if (er.generalizzazioni !== undefined && v.array(er.generalizzazioni, 'er.generalizzazioni')) {
      er.generalizzazioni.forEach((g, i) => {
        const p = `er.generalizzazioni[${i}]`;
        if (!v.oggetto(g, p)) return;
        v.campiSconosciuti(g, p, ['padre', 'figlie', 'copertura']);
        if (v.stringa(g.padre, `${p}.padre`) && !entita.has(chiave(g.padre))) v.errore(`${p}.padre`, `l'entità «${g.padre}» non esiste in er.entita.`);
        if (v.array(g.figlie, `${p}.figlie`, 1)) {
          g.figlie.forEach((f, j) => {
            if (v.stringa(f, `${p}.figlie[${j}]`) && !entita.has(chiave(f))) v.errore(`${p}.figlie[${j}]`, `l'entità «${f}» non esiste in er.entita.`);
            if (typeof f === 'string' && typeof g.padre === 'string' && chiave(f) === chiave(g.padre)) v.errore(`${p}.figlie[${j}]`, 'una figlia non può coincidere con il padre.');
          });
        }
        if (g.copertura !== undefined && v.stringa(g.copertura, `${p}.copertura`) && !RE_COPERTURA.test(g.copertura)) {
          v.errore(`${p}.copertura`, `"${g.copertura}" non è valida: usa "(t,e)", "(t,s)", "(p,e)" o "(p,s)".`);
        }
      });
    }
  }

  // Logico
  const tabelle = new Map<string, Set<string>>();
  if (v.oggetto(s.logico, 'logico')) {
    v.campiSconosciuti(s.logico, 'logico', ['tabelle']);
    const lt = s.logico.tabelle;
    if (v.array(lt, 'logico.tabelle', 1)) {
      // prima passata: nomi e colonne (le FK possono riferire tabelle definite dopo)
      lt.forEach((t) => {
        if (t && typeof t === 'object' && typeof (t as Obj).nome === 'string') {
          const cols = new Set<string>();
          const cc = (t as Obj).colonne;
          if (Array.isArray(cc)) for (const c of cc) if (c && typeof (c as Obj).nome === 'string') cols.add(chiave((c as Obj).nome as string));
          tabelle.set(chiave((t as Obj).nome as string), cols);
        }
      });
      const viste = new Set<string>();
      lt.forEach((t, i) => {
        const p = `logico.tabelle[${i}]`;
        if (!v.oggetto(t, p)) return;
        v.campiSconosciuti(t, p, ['nome', 'colonne', 'chiavePrimaria', 'chiaviEsterne', 'unici']);
        if (v.stringa(t.nome, `${p}.nome`)) {
          if (viste.has(chiave(t.nome))) v.errore(`${p}.nome`, `la tabella «${t.nome}» è definita due volte.`);
          viste.add(chiave(t.nome));
        }
        const cols = new Set<string>();
        if (v.array(t.colonne, `${p}.colonne`, 1)) {
          t.colonne.forEach((c, j) => {
            const pc = `${p}.colonne[${j}]`;
            if (!v.oggetto(c, pc)) return;
            v.campiSconosciuti(c, pc, ['nome', 'tipo', 'nullable']);
            if (v.stringa(c.nome, `${pc}.nome`)) {
              if (cols.has(chiave(c.nome))) v.errore(`${pc}.nome`, `la colonna «${c.nome}» è ripetuta.`);
              cols.add(chiave(c.nome));
            }
            v.stringa(c.tipo, `${pc}.tipo`);
            v.booleano(c.nullable, `${pc}.nullable`);
          });
        }
        const elencoColonne = (x: unknown, pp: string, min: number) => {
          if (!v.array(x, pp, min)) return [] as string[];
          const out: string[] = [];
          x.forEach((n, k) => {
            if (v.stringa(n, `${pp}[${k}]`)) {
              if (!cols.has(chiave(n))) v.errore(`${pp}[${k}]`, `la colonna «${n}» non esiste nella tabella «${String(t.nome)}».`);
              out.push(n);
            }
          });
          return out;
        };
        elencoColonne(t.chiavePrimaria, `${p}.chiavePrimaria`, 1);
        if (t.chiaviEsterne !== undefined && v.array(t.chiaviEsterne, `${p}.chiaviEsterne`)) {
          t.chiaviEsterne.forEach((fk, k) => {
            const pf = `${p}.chiaviEsterne[${k}]`;
            if (!v.oggetto(fk, pf)) return;
            v.campiSconosciuti(fk, pf, ['colonne', 'tabella', 'riferimenti']);
            const locali = elencoColonne(fk.colonne, `${pf}.colonne`, 1);
            if (v.stringa(fk.tabella, `${pf}.tabella`)) {
              const dest = tabelle.get(chiave(fk.tabella));
              if (!dest) v.errore(`${pf}.tabella`, `la tabella «${fk.tabella}» non esiste in logico.tabelle.`);
              if (v.array(fk.riferimenti, `${pf}.riferimenti`, 1)) {
                fk.riferimenti.forEach((r, q) => {
                  if (v.stringa(r, `${pf}.riferimenti[${q}]`) && dest && !dest.has(chiave(r))) {
                    v.errore(`${pf}.riferimenti[${q}]`, `la colonna «${r}» non esiste nella tabella «${String(fk.tabella)}».`);
                  }
                });
                if (Array.isArray(fk.colonne) && fk.colonne.length !== fk.riferimenti.length && locali.length > 0) {
                  v.errore(`${pf}.riferimenti`, `deve avere lo stesso numero di elementi di "colonne" (${fk.colonne.length}).`);
                }
              }
            }
          });
        }
        if (t.unici !== undefined && v.array(t.unici, `${p}.unici`)) {
          t.unici.forEach((u, k) => elencoColonne(u, `${p}.unici[${k}]`, 1));
        }
      });
    }
  }

  // Database
  if (v.oggetto(s.database, 'database')) {
    v.campiSconosciuti(s.database, 'database', ['statements']);
    const st = s.database.statements;
    if (typeof st === 'string') {
      v.errore('database.statements', 'deve essere un array di stringhe, una per istruzione SQL (non un\'unica stringa).');
    } else if (v.array(st, 'database.statements', 1)) {
      st.forEach((x, i) => v.stringa(x, `database.statements[${i}]`));
    }
  }

  // Esercizi
  if (v.array(s.esercizi, 'esercizi', 1)) {
    const ids = new Set<string>();
    s.esercizi.forEach((e, i) => {
      const p = `esercizi[${i}]`;
      if (!v.oggetto(e, p)) return;
      v.campiSconosciuti(e, p, ['id', 'titolo', 'difficolta', 'argomento', 'traccia', 'soluzioni', 'suggerimento']);
      if (typeof e.id === 'number') e.id = String(e.id);
      if (v.stringa(e.id, `${p}.id`)) {
        if (ids.has(e.id)) v.errore(`${p}.id`, `l'id «${e.id}» è già usato da un altro esercizio.`);
        ids.add(e.id);
      }
      v.stringa(e.titolo, `${p}.titolo`, false);
      if (e.difficolta === undefined) v.errore(`${p}.difficolta`, 'campo obbligatorio mancante (numero intero da 1 a 5).');
      else if (typeof e.difficolta !== 'number' || !Number.isInteger(e.difficolta) || e.difficolta < 1 || e.difficolta > 5) {
        v.errore(`${p}.difficolta`, `deve essere un numero intero da 1 a 5, trovato ${descrivi(e.difficolta)}.`);
      }
      v.stringa(e.argomento, `${p}.argomento`, false);
      v.stringa(e.traccia, `${p}.traccia`);
      v.stringa(e.suggerimento, `${p}.suggerimento`, false);
      if (typeof e.soluzioni === 'string') {
        v.errore(`${p}.soluzioni`, 'deve essere un array di stringhe (da 1 a 3 query), anche se la soluzione è una sola: ["SELECT …"].');
      } else if (v.array(e.soluzioni, `${p}.soluzioni`, 1, 3)) {
        e.soluzioni.forEach((q, j) => {
          if (!v.stringa(q, `${p}.soluzioni[${j}]`)) return;
          const g = controllaQuery(q);
          if (!g.ok) v.errore(`${p}.soluzioni[${j}]`, g.messaggio);
        });
      }
    });
  }
  return v.problemi;
}

function eFiglia(er: Obj, nome: unknown): boolean {
  const g = er.generalizzazioni;
  if (!Array.isArray(g) || typeof nome !== 'string') return false;
  return g.some((x) => x && Array.isArray((x as Obj).figlie) && ((x as Obj).figlie as unknown[]).some((f) => typeof f === 'string' && chiave(f) === chiave(nome)));
}

function controllaCardinalita(v: Validatore, c: string, p: string) {
  const m = RE_CARDINALITA.exec(c);
  if (!m) {
    v.errore(p, `"${c}" non è una cardinalità valida: usa la forma "(min,max)", ad es. "(0,N)", "(1,1)", "(1,N)".`);
    return;
  }
  if (m[2].toUpperCase() !== 'N' && Number(m[1]) > Number(m[2])) v.errore(p, `"${c}": il minimo non può superare il massimo.`);
}

function validaAttributi(v: Validatore, attr: unknown, p: string, obbligatori: boolean): Obj[] {
  if (attr === undefined && !obbligatori) return [];
  if (!v.array(attr, p)) return [];
  const out: Obj[] = [];
  const nomi = new Set<string>();
  attr.forEach((a, i) => {
    const pa = `${p}[${i}]`;
    if (typeof a === 'string') {
      v.errore(pa, `ogni attributo deve essere un oggetto, ad es. { "nome": "${a}" }.`);
      return;
    }
    if (!v.oggetto(a, pa)) return;
    v.campiSconosciuti(a, pa, ['nome', 'chiave', 'cardinalita']);
    if (v.stringa(a.nome, `${pa}.nome`)) {
      if (nomi.has(chiave(a.nome))) v.errore(`${pa}.nome`, `l'attributo «${a.nome}» è ripetuto.`);
      nomi.add(chiave(a.nome));
    }
    v.booleano(a.chiave, `${pa}.chiave`);
    if (a.cardinalita !== undefined && v.stringa(a.cardinalita, `${pa}.cardinalita`)) controllaCardinalita(v, a.cardinalita, `${pa}.cardinalita`);
    out.push(a);
  });
  return out;
}

export function haErrori(problemi: Problema[]): boolean {
  return problemi.some((p) => p.livello === 'errore');
}

/** Normalizza campi facoltativi dopo una validazione senza errori. */
export function normalizzaScenario(dati: unknown): Scenario {
  const s = dati as Scenario;
  s.er.generalizzazioni ??= [];
  for (const r of s.er.relazioni) r.attributi ??= [];
  for (const t of s.logico.tabelle) {
    t.chiaviEsterne ??= [];
    t.unici ??= [];
  }
  for (const e of s.esercizi) e.id = String(e.id);
  return s;
}
