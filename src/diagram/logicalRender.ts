import type { LayoutLogico } from './logicalLayout';
import { STILE_LOG } from './logicalLayout';
import { esc, percorsoMonotono, percorsoMorbido } from './geometry';
import type { ModelloLogico } from '../scenario/types';

const f = (n: number) => Math.round(n * 10) / 10;

export function svgLogico(l: LayoutLogico): string {
  const p: string[] = [];
  p.push(`<defs>
    <marker id="log-freccia" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" class="log-freccia"/>
    </marker>
  </defs>`);

  for (const t of l.tabelle) {
    const { x, y, w, h } = t.box;
    p.push(`<g class="log-tabella">`);
    p.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="6" class="log-box"/>`);
    p.push(`<path d="M${f(x)},${f(y + STILE_LOG.intestazione)} V${f(y + 6)} a6,6 0 0 1 6,-6 H${f(x + w - 6)} a6,6 0 0 1 6,6 V${f(y + STILE_LOG.intestazione)} Z" class="log-intestazione"/>`);
    p.push(`<text x="${f(x + w / 2)}" y="${f(y + STILE_LOG.intestazione / 2)}" text-anchor="middle" dominant-baseline="central" class="log-nome">${esc(t.nome)}</text>`);
    t.colonne.forEach((c, i) => {
      if (i > 0) p.push(`<line x1="${f(x)}" x2="${f(x + w)}" y1="${f(c.y - STILE_LOG.riga / 2)}" y2="${f(c.y - STILE_LOG.riga / 2)}" class="log-separatore"/>`);
      const xt = x + STILE_LOG.padX;
      const cls = ['log-col', c.pk ? 'log-pk' : '', c.fk ? 'log-fk' : ''].join(' ').trim();
      p.push(`<text x="${f(xt)}" y="${f(c.y)}" dominant-baseline="central" class="${cls}"${c.pk ? ' text-decoration="underline"' : ''}>${esc(c.nome)}</text>`);
      const badge = [c.pk ? 'PK' : '', c.fk ? 'FK' : ''].filter(Boolean).join(' ');
      if (badge) p.push(`<text x="${f(xt + c.larghezzaNome + 6)}" y="${f(c.y)}" dominant-baseline="central" class="log-badge">${badge}</text>`);
      p.push(`<text x="${f(t.xTipo)}" y="${f(c.y)}" text-anchor="end" dominant-baseline="central" class="log-tipo">${esc(c.tipo)}${c.nullable ? ' <tspan class="log-null"><title>Ammette NULL</title>∅</tspan>' : ''}</text>`);
    });
    p.push(`</g>`);
  }
  for (const fr of l.frecce) {
    p.push(`<path d="${fr.autoRiferimento ? percorsoMorbido(fr.punti) : percorsoMonotono(fr.punti)}" class="log-arco" marker-end="url(#log-freccia)"><title>${esc(fr.descrizione)}</title></path>`);
    const s = fr.punti[0];
    p.push(`<circle cx="${f(s.x)}" cy="${f(s.y)}" r="3" class="log-origine"/>`);
  }
  return p.join('');
}

/** Notazione testuale delle dispense: TABELLA(<u>Pk</u>, Col, Fk*) + vincoli di riferimento. */
export function htmlSchemaTestuale(m: ModelloLogico): string {
  const k = (s: string) => s.trim().toLowerCase();
  return m.tabelle
    .map((t) => {
      const pk = new Set(t.chiavePrimaria.map(k));
      const fk = new Set((t.chiaviEsterne ?? []).flatMap((x) => x.colonne.map(k)));
      const cols = t.colonne
        .map((c) => {
          let s = esc(c.nome);
          if (pk.has(k(c.nome))) s = `<u>${s}</u>`;
          if (fk.has(k(c.nome))) s = `<span class="fk">${s}</span>*`;
          if (c.nullable) s += '<sup title="ammette NULL">∅</sup>';
          return s;
        })
        .join(', ');
      const vincoli = (t.chiaviEsterne ?? [])
        .map((x) => `<li><span class="fk">${esc(x.colonne.join(', '))}</span> → ${esc(x.tabella.toUpperCase())}(${esc(x.riferimenti.join(', '))})</li>`)
        .join('');
      const tipi = t.colonne.map((c) => `${esc(c.nome)}: ${esc(c.tipo)}`).join(' · ');
      return `<div class="schema-tabella"><div class="schema-rel"><strong>${esc(t.nome.toUpperCase())}</strong>(${cols})</div>${vincoli ? `<ul class="schema-fk">${vincoli}</ul>` : ''}<div class="schema-tipi">${tipi}</div></div>`;
    })
    .join('');
}
