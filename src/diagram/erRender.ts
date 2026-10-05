import type { LayoutER } from './erLayout';
import { STILE } from './erLayout';
import { esc, percorsoMonotono } from './geometry';

const f = (n: number) => Math.round(n * 10) / 10;

/** SVG del diagramma ER. I colori vengono dal CSS (tema chiaro/scuro). */
export function svgER(l: LayoutER): string {
  const parti: string[] = [];
  parti.push(`<defs>
    <marker id="er-freccia" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" class="er-freccia"/>
    </marker>
  </defs>`);

  // archi sotto le figure
  for (const a of l.archi) {
    const cls = a.tipo === 'partecipazione' ? 'er-linea' : 'er-linea er-gen';
    const marker = a.tipo === 'padre' ? ' marker-end="url(#er-freccia)"' : '';
    parti.push(`<path d="${percorsoMonotono(a.punti)}" class="${cls}"${marker}/>`);
    if (a.identificatoreEsterno) {
      parti.push(`<circle cx="${f(a.identificatoreEsterno.x)}" cy="${f(a.identificatoreEsterno.y)}" r="${STILE.raggio}" class="er-chiave"><title>Identificatore esterno</title></circle>`);
    }
  }

  for (const n of l.nodi) {
    // attributi
    for (const at of n.attributi) {
      parti.push(`<line x1="${f(at.x1)}" y1="${f(at.y1)}" x2="${f(at.cx)}" y2="${f(at.cy)}" class="er-linea-attr"/>`);
      parti.push(`<circle cx="${f(at.cx)}" cy="${f(at.cy)}" r="${STILE.raggio}" class="${at.chiave ? 'er-chiave' : 'er-attr'}"/>`);
      parti.push(
        `<text x="${f(at.tx)}" y="${f(at.ty)}" text-anchor="${at.ancora}" dominant-baseline="central" class="er-testo-attr${at.chiave ? ' er-testo-chiave' : ''}">${esc(at.etichetta)}</text>`,
      );
    }
    if (n.tipo === 'entita') {
      parti.push(`<rect x="${f(n.cx - n.w / 2)}" y="${f(n.cy - n.h / 2)}" width="${f(n.w)}" height="${f(n.h)}" rx="2" class="er-entita"/>`);
      parti.push(`<text x="${f(n.cx)}" y="${f(n.cy)}" text-anchor="middle" dominant-baseline="central" class="er-nome">${esc(n.nome)}</text>`);
    } else if (n.tipo === 'relazione') {
      const p = [
        [n.cx, n.cy - n.h / 2],
        [n.cx + n.w / 2, n.cy],
        [n.cx, n.cy + n.h / 2],
        [n.cx - n.w / 2, n.cy],
      ]
        .map(([x, y]) => `${f(x)},${f(y)}`)
        .join(' ');
      parti.push(`<polygon points="${p}" class="er-rombo"/>`);
      parti.push(`<text x="${f(n.cx)}" y="${f(n.cy)}" text-anchor="middle" dominant-baseline="central" class="er-nome er-nome-rel">${esc(n.nome)}</text>`);
    } else {
      parti.push(`<circle cx="${f(n.cx)}" cy="${f(n.cy)}" r="3" class="er-giunzione"/>`);
      if (n.copertura) {
        parti.push(`<text x="${f(n.cx)}" y="${f(n.cy - 12)}" text-anchor="middle" class="er-card">${esc(n.copertura)}</text>`);
      }
    }
  }

  // etichette sopra tutto, con alone per restare leggibili sulle linee
  for (const a of l.archi) {
    if (!a.etichetta) continue;
    const e = a.etichetta;
    parti.push(`<text x="${f(e.x)}" y="${f(e.y)}" text-anchor="${e.ancora}" dominant-baseline="central" class="er-card">${esc(e.testo)}</text>`);
  }
  return parti.join('');
}
