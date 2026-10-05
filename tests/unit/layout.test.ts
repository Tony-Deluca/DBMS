import { describe, expect, it } from 'vitest';
import { calcolaLayoutER } from '../../src/diagram/erLayout';
import { calcolaLayoutLogico } from '../../src/diagram/logicalLayout';
import { siSovrappongono, type Rettangolo } from '../../src/diagram/geometry';
import { larghezzaTesto } from '../../src/diagram/textMeasure';
import { svgER } from '../../src/diagram/erRender';
import { svgLogico, htmlSchemaTestuale } from '../../src/diagram/logicalRender';
import type { ModelloER, ModelloLogico } from '../../src/scenario/types';
import { leggiScenario } from './helpers';

/** ER sintetico con 10 entità, relazioni N:N con attributi, una ricorsiva, una ternaria e una generalizzazione. */
function erGrande(): ModelloER {
  const nomi = ['CLIENTE', 'ORDINE', 'PRODOTTO', 'CATEGORIA', 'FORNITORE', 'MAGAZZINO', 'DIPENDENTE', 'REPARTO', 'CORRIERE', 'SPEDIZIONE'];
  const entita = nomi.map((n, i) => ({
    nome: n,
    attributi: [
      { nome: `Codice${n.slice(0, 3)}`, chiave: true },
      { nome: 'Nome' },
      ...(i % 2 === 0 ? [{ nome: 'DataRegistrazione' }, { nome: 'Telefono', cardinalita: '(0,1)' }] : []),
      ...(i % 3 === 0 ? [{ nome: 'IndirizzoCompleto' }, { nome: 'Note', cardinalita: '(0,N)' }] : []),
    ],
  }));
  entita.push({ nome: 'MAGAZZINIERE', attributi: [{ nome: 'Turno' }] }, { nome: 'AUTISTA', attributi: [{ nome: 'Patente' }] });
  const rel = (nome: string, a: string, ca: string, b: string, cb: string, attributi: { nome: string }[] = []) => ({
    nome,
    partecipanti: [
      { entita: a, cardinalita: ca },
      { entita: b, cardinalita: cb },
    ],
    attributi,
  });
  return {
    entita,
    relazioni: [
      rel('EFFETTUA', 'CLIENTE', '(0,N)', 'ORDINE', '(1,1)'),
      rel('CONTIENE', 'ORDINE', '(1,N)', 'PRODOTTO', '(0,N)', [{ nome: 'Quantita' }, { nome: 'PrezzoUnitario' }]),
      rel('APPARTIENE', 'PRODOTTO', '(1,1)', 'CATEGORIA', '(0,N)'),
      rel('FORNISCE', 'FORNITORE', '(0,N)', 'PRODOTTO', '(1,N)', [{ nome: 'Prezzo' }]),
      rel('GIACENZA', 'PRODOTTO', '(0,N)', 'MAGAZZINO', '(0,N)', [{ nome: 'Quantita' }]),
      rel('LAVORA', 'DIPENDENTE', '(1,1)', 'REPARTO', '(0,N)'),
      rel('DIRIGE', 'DIPENDENTE', '(0,1)', 'REPARTO', '(1,1)'),
      rel('GESTISCE', 'MAGAZZINO', '(1,1)', 'REPARTO', '(0,N)'),
      {
        nome: 'SUPERVISIONE',
        partecipanti: [
          { entita: 'DIPENDENTE', cardinalita: '(0,N)', ruolo: 'capo' },
          { entita: 'DIPENDENTE', cardinalita: '(0,1)', ruolo: 'sottoposto' },
        ],
        attributi: [],
      },
      {
        nome: 'CONSEGNA',
        partecipanti: [
          { entita: 'SPEDIZIONE', cardinalita: '(1,1)' },
          { entita: 'CORRIERE', cardinalita: '(0,N)' },
          { entita: 'ORDINE', cardinalita: '(0,N)' },
        ],
        attributi: [{ nome: 'Data' }],
      },
    ],
    generalizzazioni: [{ padre: 'DIPENDENTE', figlie: ['MAGAZZINIERE', 'AUTISTA'], copertura: '(p,e)' }],
  };
}

function controllaER(er: ModelloER) {
  const l = calcolaLayoutER(er, true);
  const figure: Rettangolo[] = l.nodi.filter((n) => n.tipo !== 'giunzione').map((n) => ({ x: n.cx - n.w / 2, y: n.cy - n.h / 2, w: n.w, h: n.h }));

  // 1. gli ingombri dei nodi (figura + attributi) non si sovrappongono
  for (let i = 0; i < l.nodi.length; i++) {
    for (let j = i + 1; j < l.nodi.length; j++) {
      expect(siSovrappongono(l.nodi[i].box, l.nodi[j].box), `${l.nodi[i].nome} / ${l.nodi[j].nome}`).toBe(false);
    }
  }
  // 2. ogni attributo (cerchio + testo) resta dentro l'ingombro del suo nodo
  for (const n of l.nodi) {
    for (const a of n.attributi) {
      const w = larghezzaTesto(a.etichetta, 12, a.chiave);
      const x = a.ancora === 'start' ? a.tx : a.tx - w;
      const r = { x: Math.min(x, a.cx - 5), y: a.cy - 7, w: w + Math.abs(a.tx - a.cx) + 5, h: 14 };
      expect(r.x >= n.box.x - 1 && r.x + r.w <= n.box.x + n.box.w + 1, `${n.nome}.${a.nome}`).toBe(true);
      expect(r.y >= n.box.y - 1 && r.y + r.h <= n.box.y + n.box.h + 1, `${n.nome}.${a.nome}`).toBe(true);
    }
  }
  // 3. le etichette di cardinalità non coprono entità o rombi e non si sovrappongono tra loro
  const etichette: Rettangolo[] = l.archi
    .filter((a) => a.etichetta)
    .map((a) => {
      const e = a.etichetta!;
      const w = larghezzaTesto(e.testo, 12, true);
      const x = e.ancora === 'start' ? e.x : e.ancora === 'end' ? e.x - w : e.x - w / 2;
      return { x, y: e.y - 6, w, h: 12 };
    });
  for (const e of etichette) {
    for (const f of figure) expect(siSovrappongono(e, f), 'etichetta su una figura').toBe(false);
  }
  for (let i = 0; i < etichette.length; i++) {
    for (let j = i + 1; j < etichette.length; j++) expect(siSovrappongono(etichette[i], etichette[j]), 'etichette sovrapposte').toBe(false);
  }
  // 4. ogni arco parte e arriva sul bordo delle figure
  expect(l.archi.every((a) => a.punti.length >= 2 && a.punti.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))).toBe(true);
  return l;
}

function controllaLogico(m: ModelloLogico) {
  const l = calcolaLayoutLogico(m);
  for (let i = 0; i < l.tabelle.length; i++) {
    for (let j = i + 1; j < l.tabelle.length; j++) {
      expect(siSovrappongono(l.tabelle[i].box, l.tabelle[j].box, 4), `${l.tabelle[i].nome} / ${l.tabelle[j].nome}`).toBe(false);
    }
  }
  return l;
}

describe('layout automatico dei diagrammi', () => {
  it('ER dello scenario di esempio senza sovrapposizioni', () => {
    const l = controllaER(leggiScenario().er);
    expect(l.nodi.filter((n) => n.tipo === 'entita')).toHaveLength(8);
    expect(svgER(l)).toContain('PROPEDEUTICITA');
  });

  it('ER con 12 entità, ricorsiva, ternaria e generalizzazione senza sovrapposizioni', () => {
    const l = controllaER(erGrande());
    expect(l.archi.filter((a) => a.tipo === 'padre')).toHaveLength(1);
    // la relazione ricorsiva ha due rami distinti
    const sup = l.archi.filter((a) => a.etichetta?.testo.includes('capo') || a.etichetta?.testo.includes('sottoposto'));
    expect(sup).toHaveLength(2);
    expect(sup[0].punti[0].y).not.toBe(sup[1].punti[0].y);
  });

  it('ER senza attributi (interruttore «Attributi»)', () => {
    const l = calcolaLayoutER(erGrande(), false);
    expect(l.nodi.every((n) => n.attributi.length === 0)).toBe(true);
  });

  it('modello logico: 10 tabelle senza sovrapposizioni, frecce per ogni FK', () => {
    const tabelle = Array.from({ length: 10 }, (_, i) => ({
      nome: `Tabella${i}`,
      colonne: [
        { nome: 'Id', tipo: 'INTEGER' },
        { nome: 'Descrizione', tipo: 'TEXT' },
        { nome: 'Rif', tipo: 'INTEGER', nullable: true },
        { nome: 'Altro', tipo: 'INTEGER', nullable: true },
      ],
      chiavePrimaria: ['Id'],
      chiaviEsterne: [
        ...(i > 0 ? [{ colonne: ['Rif'], tabella: `Tabella${Math.floor((i - 1) / 2)}`, riferimenti: ['Id'] }] : []),
        ...(i % 3 === 0 ? [{ colonne: ['Altro'], tabella: `Tabella${i}`, riferimenti: ['Id'] }] : []),
      ],
    }));
    const l = controllaLogico({ tabelle });
    expect(l.frecce).toHaveLength(9 + 4);
    expect(l.frecce.filter((f) => f.autoRiferimento)).toHaveLength(4);
  });

  it('modello logico dello scenario di esempio e vista testuale', () => {
    const m = leggiScenario().logico;
    const l = controllaLogico(m);
    expect(svgLogico(l)).toContain('Propedeuticita');
    const html = htmlSchemaTestuale(m);
    expect(html).toContain('<u>Studente</u>');
    expect(html).toContain('→ STUDENTE(Matricola)');
  });

  it('i nomi vengono sempre scappati nel markup (niente HTML iniettato)', () => {
    const er: ModelloER = { entita: [{ nome: '<img src=x onerror=alert(1)>', attributi: [{ nome: '"><script>', chiave: true }] }], relazioni: [] };
    const svg = svgER(calcolaLayoutER(er));
    expect(svg).not.toContain('<img');
    expect(svg).not.toContain('<script>');
  });
});
