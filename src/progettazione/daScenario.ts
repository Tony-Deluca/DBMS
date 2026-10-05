// «Apri in Progettazione»: converte ER e logico di uno scenario in un nuovo progetto (lo scenario non cambia).
// Le posizioni vengono dal layout automatico già usato per mostrare gli scenari.
import type { Scenario } from '../scenario/types';
import { calcolaLayoutER } from '../diagram/erLayout';
import { calcolaLayoutLogico } from '../diagram/logicalLayout';
import {
  CARDINALITA_PARTECIPAZIONE,
  COPERTURE,
  nuovoAttributo,
  nuovoIdElemento,
  nuovoProgetto,
  type Attributo,
  type CardinalitaAttributo,
  type CardinalitaPartecipazione,
  type Copertura,
  type Progetto,
} from './modello';

const norm = (c: string | undefined) => (c ?? '').replace(/\s+/g, '').replace(/n\)$/, 'N)');
const k = (s: string) => s.trim().toLowerCase();

function cardAttributo(c: string | undefined): CardinalitaAttributo {
  const n = norm(c);
  return n === '(0,1)' || n === '(1,N)' || n === '(0,N)' ? n : null;
}

export function progettoDaScenario(sc: Scenario, nome: string, id: string): Progetto {
  const p = nuovoProgetto(nome, id);
  p.traccia = sc.metadati.descrizione ?? '';
  const layout = calcolaLayoutER(sc.er, true);
  const centro = (idNodo: string) => {
    const n = layout.nodi.find((x) => x.id === idNodo);
    return n ? { x: Math.round(n.cx), y: Math.round(n.cy) } : { x: 0, y: 0 };
  };
  const attr = (a: { nome: string; chiave?: boolean; cardinalita?: string }): Attributo =>
    nuovoAttributo(a.nome, { identificatore: !!a.chiave, cardinalita: cardAttributo(a.cardinalita) });

  const idEntita = new Map<string, string>();
  const idRelazione = new Map<string, string>();
  p.er.entita = sc.er.entita.map((e, i) => {
    const id2 = nuovoIdElemento('e');
    idEntita.set(k(e.nome), id2);
    return { id: id2, nome: e.nome, ...centro(`e${i}`), attributi: (e.attributi ?? []).map(attr), identificatoreEsterno: [] };
  });
  p.er.relazioni = sc.er.relazioni.map((r, i) => {
    const id2 = nuovoIdElemento('r');
    idRelazione.set(k(r.nome), id2);
    return {
      id: id2,
      nome: r.nome,
      ...centro(`r${i}`),
      attributi: (r.attributi ?? []).map(attr),
      partecipazioni: r.partecipanti
        .filter((x) => idEntita.has(k(x.entita)))
        .map((x) => {
          const c = norm(x.cardinalita);
          return {
            id: nuovoIdElemento('p'),
            entita: idEntita.get(k(x.entita))!,
            cardinalita: (CARDINALITA_PARTECIPAZIONE as string[]).includes(c) ? (c as CardinalitaPartecipazione) : null,
            ruolo: x.ruolo ?? '',
          };
        }),
    };
  });
  sc.er.entita.forEach((e, i) => {
    p.er.entita[i].identificatoreEsterno = (e.identificatoreEsterno ?? []).map((r) => idRelazione.get(k(r))).filter((x): x is string => !!x);
  });
  p.er.generalizzazioni = (sc.er.generalizzazioni ?? [])
    .filter((g) => idEntita.has(k(g.padre)))
    .map((g) => {
      const c = (g.copertura ?? '(t,e)').replace(/\s+/g, '');
      return {
        id: nuovoIdElemento('g'),
        padre: idEntita.get(k(g.padre))!,
        figlie: g.figlie.map((f) => idEntita.get(k(f))).filter((x): x is string => !!x),
        copertura: ((COPERTURE as string[]).includes(c) ? c : '(t,e)') as Copertura,
      };
    });

  const ll = calcolaLayoutLogico(sc.logico);
  p.logico.tabelle = sc.logico.tabelle.map((t, i) => {
    const pk = new Set(t.chiavePrimaria.map(k));
    return {
      id: nuovoIdElemento('t'),
      nome: t.nome,
      x: Math.round(ll.tabelle[i].box.x),
      y: Math.round(ll.tabelle[i].box.y),
      colonne: t.colonne.map((c) => ({ id: nuovoIdElemento('c'), nome: c.nome, pk: pk.has(k(c.nome)), facoltativa: !!c.nullable })),
      chiaviEsterne: (t.chiaviEsterne ?? []).map((f) => ({ id: nuovoIdElemento('f'), colonne: [...f.colonne], tabella: f.tabella, riferimenti: [...f.riferimenti] })),
    };
  });
  p.pannelli = ['er', 'logico'];
  return p;
}
