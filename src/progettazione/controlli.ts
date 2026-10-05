// Controlli di coerenza: segnalazioni non bloccanti, mai correzioni automatiche.
import type { Attributo, SchemaER, SchemaLogicoP } from './modello';

export interface Segnalazione {
  livello: 'errore' | 'avviso';
  messaggio: string;
  /** elementi coinvolti (per evidenziarli nell'editor) */
  elementi: string[];
}

const k = (s: string) => s.trim().toLowerCase();

function duplicati<T>(lista: T[], chiave: (x: T) => string): T[][] {
  const gruppi = new Map<string, T[]>();
  for (const x of lista) {
    const c = chiave(x);
    if (!c) continue;
    gruppi.set(c, [...(gruppi.get(c) ?? []), x]);
  }
  return [...gruppi.values()].filter((g) => g.length > 1);
}

export function controllaER(s: SchemaER): Segnalazione[] {
  const out: Segnalazione[] = [];
  const nomeEnt = (id: string) => s.entita.find((e) => e.id === id)?.nome ?? '?';
  const figlie = new Set(s.generalizzazioni.flatMap((g) => g.figlie));

  for (const g of duplicati([...s.entita, ...s.relazioni], (x) => k(x.nome))) {
    out.push({ livello: 'errore', messaggio: `Nome duplicato: «${g[0].nome}» è usato da ${g.length} elementi.`, elementi: g.map((x) => x.id) });
  }

  const controllaAttributi = (owner: { id: string; nome: string }, attributi: Attributo[]) => {
    for (const a of attributi) {
      if (!a.nome.trim()) out.push({ livello: 'errore', messaggio: `«${owner.nome}» ha un attributo senza nome.`, elementi: [owner.id] });
      for (const c of a.componenti) if (!c.nome.trim()) out.push({ livello: 'errore', messaggio: `L'attributo composto «${a.nome}» di «${owner.nome}» ha un componente senza nome.`, elementi: [owner.id] });
    }
    for (const g of duplicati(attributi, (a) => k(a.nome))) {
      out.push({ livello: 'errore', messaggio: `«${owner.nome}» ha due attributi chiamati «${g[0].nome}».`, elementi: [owner.id] });
    }
  };

  for (const e of s.entita) {
    if (!e.nome.trim()) out.push({ livello: 'errore', messaggio: 'C\'è un\'entità senza nome.', elementi: [e.id] });
    controllaAttributi(e, e.attributi);
    const haId = e.attributi.some((a) => a.identificatore) || e.identificatoreEsterno.length > 0;
    if (!haId && !figlie.has(e.id)) {
      out.push({ livello: 'avviso', messaggio: `L'entità «${e.nome}» non ha un identificatore.`, elementi: [e.id] });
    }
    for (const a of e.attributi) {
      if (a.identificatore && a.cardinalita && a.cardinalita !== null) {
        out.push({ livello: 'avviso', messaggio: `«${e.nome}.${a.nome}» è nell'identificatore ma ha cardinalità ${a.cardinalita}: un identificatore deve essere (1,1).`, elementi: [e.id] });
      }
    }
    for (const idRel of e.identificatoreEsterno) {
      const r = s.relazioni.find((x) => x.id === idRel);
      const p = r?.partecipazioni.find((x) => x.entita === e.id);
      if (r && !p) out.push({ livello: 'errore', messaggio: `L'identificatore esterno di «${e.nome}» usa «${r.nome}», a cui «${e.nome}» non partecipa.`, elementi: [e.id, idRel] });
      else if (r && p && p.cardinalita && p.cardinalita !== '(1,1)') {
        out.push({ livello: 'avviso', messaggio: `«${e.nome}» è identificata esternamente tramite «${r.nome}»: di solito la sua partecipazione è (1,1), non ${p.cardinalita}.`, elementi: [e.id, idRel] });
      }
    }
  }

  for (const r of s.relazioni) {
    if (!r.nome.trim()) out.push({ livello: 'errore', messaggio: 'C\'è una relazione senza nome.', elementi: [r.id] });
    controllaAttributi(r, r.attributi);
    if (r.partecipazioni.length < 2) {
      out.push({
        livello: 'errore',
        messaggio: r.partecipazioni.length === 0 ? `La relazione «${r.nome}» non collega nessuna entità.` : `La relazione «${r.nome}» ha un solo partecipante.`,
        elementi: [r.id],
      });
    }
    for (const p of r.partecipazioni) {
      if (!p.cardinalita) out.push({ livello: 'errore', messaggio: `Manca la cardinalità di «${nomeEnt(p.entita)}» in «${r.nome}».`, elementi: [r.id, p.id] });
    }
    const perEntita = duplicati(r.partecipazioni, (p) => p.entita);
    for (const g of perEntita) {
      if (g.some((p) => !p.ruolo.trim())) {
        out.push({ livello: 'avviso', messaggio: `«${r.nome}» è ricorsiva su «${nomeEnt(g[0].entita)}»: indica il ruolo di ogni partecipazione.`, elementi: [r.id] });
      }
    }
    for (const a of r.attributi) {
      if (a.identificatore) out.push({ livello: 'avviso', messaggio: `L'attributo «${a.nome}» della relazione «${r.nome}» è segnato come identificatore: le relazioni non hanno identificatori propri.`, elementi: [r.id] });
    }
  }

  for (const g of s.generalizzazioni) {
    if (g.figlie.includes(g.padre)) out.push({ livello: 'errore', messaggio: `«${nomeEnt(g.padre)}» non può essere figlia di se stessa.`, elementi: [g.id] });
    if (g.figlie.length === 0) out.push({ livello: 'errore', messaggio: `La generalizzazione di «${nomeEnt(g.padre)}» non ha figlie.`, elementi: [g.id] });
  }
  return out;
}

export function controllaLogico(l: SchemaLogicoP): Segnalazione[] {
  const out: Segnalazione[] = [];
  for (const g of duplicati(l.tabelle, (t) => k(t.nome))) {
    out.push({ livello: 'errore', messaggio: `Nome di tabella duplicato: «${g[0].nome}».`, elementi: g.map((t) => t.id) });
  }
  for (const t of l.tabelle) {
    if (t.colonne.length === 0) out.push({ livello: 'errore', messaggio: `La tabella «${t.nome}» non ha colonne.`, elementi: [t.id] });
    if (t.colonne.length > 0 && !t.colonne.some((c) => c.pk)) out.push({ livello: 'errore', messaggio: `La tabella «${t.nome}» non ha una chiave primaria.`, elementi: [t.id] });
    for (const g of duplicati(t.colonne, (c) => k(c.nome))) out.push({ livello: 'errore', messaggio: `La tabella «${t.nome}» ha due colonne «${g[0].nome}».`, elementi: [t.id] });
    for (const c of t.colonne) if (c.pk && c.facoltativa) out.push({ livello: 'errore', messaggio: `«${t.nome}.${c.nome}» è nella chiave primaria ma è facoltativa.`, elementi: [t.id] });
    for (const fk of t.chiaviEsterne) {
      const descr = `${t.nome}(${fk.colonne.join(', ')}) → ${fk.tabella}(${fk.riferimenti.join(', ')})`;
      const dest = l.tabelle.find((x) => k(x.nome) === k(fk.tabella));
      if (!dest) {
        out.push({ livello: 'errore', messaggio: `Il vincolo ${descr} punta alla tabella «${fk.tabella}», che non esiste.`, elementi: [t.id] });
        continue;
      }
      for (const c of fk.colonne) if (!t.colonne.some((x) => k(x.nome) === k(c))) out.push({ livello: 'errore', messaggio: `Il vincolo ${descr} usa la colonna «${c}», che non esiste in «${t.nome}».`, elementi: [t.id] });
      const mancanti = fk.riferimenti.filter((c) => !dest.colonne.some((x) => k(x.nome) === k(c)));
      for (const c of mancanti) out.push({ livello: 'errore', messaggio: `Il vincolo ${descr} punta alla colonna «${c}», che non esiste in «${dest.nome}».`, elementi: [t.id, dest.id] });
      if (fk.colonne.length !== fk.riferimenti.length) out.push({ livello: 'errore', messaggio: `Il vincolo ${descr} ha un numero diverso di colonne ai due lati.`, elementi: [t.id] });
      const pkDest = dest.colonne.filter((c) => c.pk).map((c) => k(c.nome)).sort().join();
      if (mancanti.length === 0 && pkDest && fk.riferimenti.map(k).sort().join() !== pkDest) {
        out.push({ livello: 'avviso', messaggio: `Il vincolo ${descr} non punta alla chiave primaria di «${dest.nome}» (${dest.colonne.filter((c) => c.pk).map((c) => c.nome).join(', ')}).`, elementi: [t.id, dest.id] });
      }
    }
  }
  return out;
}
