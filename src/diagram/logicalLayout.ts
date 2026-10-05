// Layout del modello logico: un box per tabella (dagre) e frecce dalla colonna
// chiave esterna alla colonna referenziata.
import dagre from '@dagrejs/dagre';
import type { ModelloLogico } from '../scenario/types';
import type { Punto, Rettangolo } from './geometry';
import { larghezzaTesto } from './textMeasure';

export const STILE_LOG = {
  intestazione: 32,
  riga: 24,
  font: 13,
  fontTipo: 11,
  padX: 12,
};

export interface ColonnaLayout {
  nome: string;
  tipo: string;
  pk: boolean;
  fk: boolean;
  nullable: boolean;
  larghezzaNome: number;
  y: number; // centro della riga
}

export interface TabellaLayout {
  nome: string;
  box: Rettangolo;
  colonne: ColonnaLayout[];
  xTipo: number;
}

export interface FrecciaFK {
  punti: Punto[];
  descrizione: string;
  autoRiferimento: boolean;
}

export interface LayoutLogico {
  tabelle: TabellaLayout[];
  frecce: FrecciaFK[];
  larghezza: number;
  altezza: number;
}

const k = (s: string) => s.trim().toLowerCase();

export function calcolaLayoutLogico(m: ModelloLogico): LayoutLogico {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 90, edgesep: 20, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  const dim = new Map<string, { w: number; h: number; xTipo: number }>();
  m.tabelle.forEach((t, i) => {
    const fkCols = new Set((t.chiaviEsterne ?? []).flatMap((fk) => fk.colonne.map(k)));
    const pk = new Set(t.chiavePrimaria.map(k));
    let wNome = 0;
    let wTipo = 0;
    for (const c of t.colonne) {
      const extra = (pk.has(k(c.nome)) ? 24 : 0) + (fkCols.has(k(c.nome)) ? 24 : 0) + 6;
      wNome = Math.max(wNome, larghezzaTesto(c.nome, STILE_LOG.font, pk.has(k(c.nome))) + extra);
      wTipo = Math.max(wTipo, larghezzaTesto(c.tipo + (c.nullable ? ' ∅' : ''), STILE_LOG.fontTipo));
    }
    const w = Math.max(larghezzaTesto(t.nome.toUpperCase(), STILE_LOG.font + 1, true) + 2 * STILE_LOG.padX, wNome + wTipo + 2 * STILE_LOG.padX + 18);
    const h = STILE_LOG.intestazione + t.colonne.length * STILE_LOG.riga + 4;
    dim.set(`t${i}`, { w, h, xTipo: w - STILE_LOG.padX });
    g.setNode(`t${i}`, { width: w, height: h });
  });

  const indice = new Map(m.tabelle.map((t, i) => [k(t.nome), i]));
  m.tabelle.forEach((t, i) => {
    (t.chiaviEsterne ?? []).forEach((fk, j) => {
      const dest = indice.get(k(fk.tabella));
      if (dest === undefined || dest === i) return;
      g.setEdge(`t${i}`, `t${dest}`, { minlen: 1 }, `fk${i}-${j}`);
    });
  });

  dagre.layout(g);

  const tabelle: TabellaLayout[] = m.tabelle.map((t, i) => {
    const n = g.node(`t${i}`);
    const d = dim.get(`t${i}`)!;
    const box = { x: n.x - d.w / 2, y: n.y - d.h / 2, w: d.w, h: d.h };
    const pk = new Set(t.chiavePrimaria.map(k));
    const fkCols = new Set((t.chiaviEsterne ?? []).flatMap((fk) => fk.colonne.map(k)));
    return {
      nome: t.nome,
      box,
      xTipo: box.x + d.xTipo,
      colonne: t.colonne.map((c, r) => ({
        nome: c.nome,
        tipo: c.tipo,
        pk: pk.has(k(c.nome)),
        fk: fkCols.has(k(c.nome)),
        nullable: !!c.nullable,
        larghezzaNome: larghezzaTesto(c.nome, STILE_LOG.font, pk.has(k(c.nome))),
        y: box.y + STILE_LOG.intestazione + r * STILE_LOG.riga + STILE_LOG.riga / 2,
      })),
    };
  });

  const yColonna = (ti: number, nome: string) => {
    const t = tabelle[ti];
    const c = t.colonne.find((x) => k(x.nome) === k(nome));
    return c ? c.y : t.box.y + STILE_LOG.intestazione / 2;
  };

  const frecce: FrecciaFK[] = [];
  m.tabelle.forEach((t, i) => {
    (t.chiaviEsterne ?? []).forEach((fk, j) => {
      const dest = indice.get(k(fk.tabella));
      if (dest === undefined) return;
      const descrizione = `${t.nome}(${fk.colonne.join(', ')}) → ${fk.tabella}(${fk.riferimenti.join(', ')})`;
      const s = tabelle[i];
      const d = tabelle[dest];
      const ys = yColonna(i, fk.colonne[0]);
      const yd = yColonna(dest, fk.riferimenti[0]);
      if (dest === i) {
        const x = s.box.x + s.box.w;
        frecce.push({
          punti: [{ x, y: ys }, { x: x + 28, y: ys }, { x: x + 28, y: yd }, { x, y: yd }],
          descrizione,
          autoRiferimento: true,
        });
        return;
      }
      const e = g.edge(`t${i}`, `t${dest}`, `fk${i}-${j}`);
      const interni: Punto[] = e?.points ? e.points.slice(1, -1).map((p: Punto) => ({ x: p.x, y: p.y })) : [];
      const versoDestra = d.box.x + d.box.w / 2 >= s.box.x + s.box.w / 2;
      const xs = versoDestra ? s.box.x + s.box.w : s.box.x;
      const xd = versoDestra ? d.box.x : d.box.x + d.box.w;
      const dir = versoDestra ? 1 : -1;
      // tratti orizzontali in uscita e in entrata, poi i punti di dagre
      const punti = [
        { x: xs, y: ys },
        { x: xs + dir * 18, y: ys },
        ...interni.filter((p) => (versoDestra ? p.x > xs + 24 && p.x < xd - 24 : p.x < xs - 24 && p.x > xd + 24)),
        { x: xd - dir * 22, y: yd },
        { x: xd - dir * 2, y: yd },
      ];
      frecce.push({ punti, descrizione, autoRiferimento: false });
    });
  });

  let larghezza = 0;
  let altezza = 0;
  for (const t of tabelle) {
    larghezza = Math.max(larghezza, t.box.x + t.box.w + 40);
    altezza = Math.max(altezza, t.box.y + t.box.h + 24);
  }
  return { tabelle, frecce, larghezza, altezza };
}
