// Disegno dello schema logico della Progettazione: tabelle con PK sottolineata, facoltativi con asterisco,
// frecce dalla colonna chiave esterna alla colonna referenziata.
import type { SchemaLogicoP, Tabella } from './modello';
import { esc, percorsoMonotono, percorsoMorbido, type Punto, type Rettangolo } from '../diagram/geometry';
import { larghezzaTesto } from '../diagram/textMeasure';

export const GL = { intestazione: 32, riga: 26, font: 14, padX: 12 };
const k = (s: string) => s.trim().toLowerCase();

export interface DisegnoTabella {
  id: string;
  nome: string;
  box: Rettangolo;
  colonne: { id: string; nome: string; pk: boolean; facoltativa: boolean; fk: boolean; y: number }[];
}

export interface DisegnoFK {
  id: string;
  /** tabella che contiene la chiave esterna */
  tabella: string;
  punti: Punto[];
  autoRiferimento: boolean;
  descrizione: string;
}

export interface DisegnoLogico {
  tabelle: DisegnoTabella[];
  frecce: DisegnoFK[];
  box: Rettangolo;
}

export function etichettaColonna(c: { nome: string; facoltativa: boolean }): string {
  return `${c.nome}${c.facoltativa ? '*' : ''}`;
}

function larghezzaTabella(t: Tabella): number {
  const testi = t.colonne.map((c) => larghezzaTesto(etichettaColonna(c), GL.font, c.pk) + 34);
  return Math.max(130, larghezzaTesto(t.nome || ' ', GL.font + 1, true) + 2 * GL.padX, ...testi.map((w) => w + 2 * GL.padX));
}

export function calcolaDisegnoLogico(l: SchemaLogicoP): DisegnoLogico {
  const tabelle: DisegnoTabella[] = l.tabelle.map((t) => {
    const fk = new Set(t.chiaviEsterne.flatMap((f) => f.colonne.map(k)));
    const w = larghezzaTabella(t);
    const h = GL.intestazione + Math.max(1, t.colonne.length) * GL.riga + 4;
    return {
      id: t.id,
      nome: t.nome,
      box: { x: t.x, y: t.y, w, h },
      colonne: t.colonne.map((c, i) => ({ id: c.id, nome: c.nome, pk: c.pk, facoltativa: c.facoltativa, fk: fk.has(k(c.nome)), y: t.y + GL.intestazione + i * GL.riga + GL.riga / 2 })),
    };
  });
  const perNome = new Map(tabelle.map((t) => [k(t.nome), t]));
  const frecce: DisegnoFK[] = [];
  l.tabelle.forEach((t, i) => {
    const s = tabelle[i];
    for (const f of t.chiaviEsterne) {
      const d = perNome.get(k(f.tabella));
      if (!d) continue;
      const ys = s.colonne.find((c) => k(c.nome) === k(f.colonne[0]))?.y ?? s.box.y + GL.intestazione / 2;
      const yd = d.colonne.find((c) => k(c.nome) === k(f.riferimenti[0]))?.y ?? d.box.y + GL.intestazione / 2;
      const descrizione = `${t.nome}(${f.colonne.join(', ')}) → ${f.tabella}(${f.riferimenti.join(', ')})`;
      if (d === s) {
        const x = s.box.x + s.box.w;
        frecce.push({ id: f.id, tabella: s.id, punti: [{ x, y: ys }, { x: x + 30, y: ys }, { x: x + 30, y: yd }, { x: x + 2, y: yd }], autoRiferimento: true, descrizione });
        continue;
      }
      // tabelle una sopra l'altra (sovrapposte in orizzontale): la freccia gira attorno al lato destro
      if (d.box.x < s.box.x + s.box.w + 40 && s.box.x < d.box.x + d.box.w + 40) {
        const xs = s.box.x + s.box.w;
        const xd = d.box.x + d.box.w;
        const fuori = Math.max(xs, xd) + 34;
        frecce.push({ id: f.id, tabella: s.id, punti: [{ x: xs, y: ys }, { x: fuori, y: ys }, { x: fuori, y: yd }, { x: xd + 2, y: yd }], autoRiferimento: true, descrizione });
        continue;
      }
      const destra = d.box.x > s.box.x;
      const dir = destra ? 1 : -1;
      const xs = destra ? s.box.x + s.box.w : s.box.x;
      const xd = destra ? d.box.x : d.box.x + d.box.w;
      const punti = [{ x: xs, y: ys }, { x: xs + dir * 22, y: ys }, { x: xd - dir * 24, y: yd }, { x: xd - dir * 2, y: yd }];
      frecce.push({ id: f.id, tabella: s.id, punti, autoRiferimento: false, descrizione });
    }
  });
  const scatole = tabelle.map((t) => t.box);
  for (const f of frecce) for (const p of f.punti) scatole.push({ x: p.x - 2, y: p.y - 2, w: 4, h: 4 });
  const box = scatole.length
    ? (() => {
        const x = Math.min(...scatole.map((r) => r.x));
        const y = Math.min(...scatole.map((r) => r.y));
        return { x, y, w: Math.max(...scatole.map((r) => r.x + r.w)) - x, h: Math.max(...scatole.map((r) => r.y + r.h)) - y };
      })()
    : { x: 0, y: 0, w: 400, h: 300 };
  return { tabelle, frecce, box };
}

export type ColpoLogico = { tipo: 'tabella'; id: string; colonna?: string } | { tipo: 'fk'; id: string; tabella: string };

export function colpisciLogico(d: DisegnoLogico, p: Punto, tolleranza = 6): ColpoLogico | null {
  for (let i = d.tabelle.length - 1; i >= 0; i--) {
    const t = d.tabelle[i];
    const b = t.box;
    if (p.x >= b.x - 2 && p.x <= b.x + b.w + 2 && p.y >= b.y - 2 && p.y <= b.y + b.h + 2) {
      const c = t.colonne.find((x) => Math.abs(p.y - x.y) <= GL.riga / 2);
      return { tipo: 'tabella', id: t.id, colonna: c?.id };
    }
  }
  for (const f of d.frecce) {
    for (let i = 0; i < f.punti.length - 1; i++) {
      const a = f.punti[i];
      const b = f.punti[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= tolleranza) {
        return { tipo: 'fk', id: f.id, tabella: f.tabella };
      }
    }
  }
  return null;
}

export function tabelleNelRettangolo(d: DisegnoLogico, r: Rettangolo): string[] {
  return d.tabelle
    .filter((t) => {
      const cx = t.box.x + t.box.w / 2;
      const cy = t.box.y + t.box.h / 2;
      return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
    })
    .map((t) => t.id);
}

const f1 = (n: number) => Math.round(n * 10) / 10;

export function svgDisegnoLogico(d: DisegnoLogico, opz: { selezionati?: Set<string>; segnalati?: Set<string> } = {}): string {
  const sel = opz.selezionati ?? new Set<string>();
  const seg = opz.segnalati ?? new Set<string>();
  const p: string[] = [];
  p.push(`<defs><marker id="pg-log-freccia" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="log-freccia"/></marker></defs>`);
  for (const t of d.tabelle) {
    const { x, y, w, h } = t.box;
    const extra = `${sel.has(t.id) ? ' pg-sel' : ''}${seg.has(t.id) ? ' pg-segnalato' : ''}`;
    p.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="6" class="log-box${extra}"/>`);
    p.push(`<path d="M${f1(x)},${f1(y + GL.intestazione)} V${f1(y + 6)} a6,6 0 0 1 6,-6 H${f1(x + w - 6)} a6,6 0 0 1 6,6 V${f1(y + GL.intestazione)} Z" class="log-intestazione"/>`);
    p.push(`<text x="${f1(x + w / 2)}" y="${f1(y + GL.intestazione / 2)}" text-anchor="middle" dominant-baseline="central" class="log-nome">${esc(t.nome || '(senza nome)')}</text>`);
    if (t.colonne.length === 0) p.push(`<text x="${f1(x + GL.padX)}" y="${f1(y + GL.intestazione + GL.riga / 2)}" dominant-baseline="central" class="log-tipo">nessuna colonna</text>`);
    t.colonne.forEach((c, i) => {
      if (i > 0) p.push(`<line x1="${f1(x)}" x2="${f1(x + w)}" y1="${f1(c.y - GL.riga / 2)}" y2="${f1(c.y - GL.riga / 2)}" class="log-separatore"/>`);
      if (sel.has(c.id)) p.push(`<rect x="${f1(x + 1)}" y="${f1(c.y - GL.riga / 2)}" width="${f1(w - 2)}" height="${GL.riga}" class="pg-sel-riga"/>`);
      const cls = ['log-col', 'pg-col', c.pk ? 'log-pk' : '', c.fk ? 'log-fk' : ''].join(' ').trim();
      p.push(`<text x="${f1(x + GL.padX)}" y="${f1(c.y)}" dominant-baseline="central" class="${cls}"${c.pk ? ' text-decoration="underline"' : ''}>${esc(etichettaColonna(c))}</text>`);
      if (c.fk) p.push(`<text x="${f1(x + w - GL.padX)}" y="${f1(c.y)}" text-anchor="end" dominant-baseline="central" class="log-badge">FK</text>`);
    });
  }
  for (const f of d.frecce) {
    const path = f.autoRiferimento || f.punti.length < 3 ? percorsoMorbido(f.punti) : percorsoMonotono(f.punti);
    p.push(`<path d="${path}" class="log-arco${sel.has(f.id) ? ' pg-sel-linea' : ''}" marker-end="url(#pg-log-freccia)"><title>${esc(f.descrizione)}</title></path>`);
    p.push(`<circle cx="${f1(f.punti[0].x)}" cy="${f1(f.punti[0].y)}" r="3" class="log-origine"/>`);
  }
  return p.join('');
}
