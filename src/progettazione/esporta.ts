// Esportazione degli schemi: SVG autonomo (stili incorporati, tema chiaro) e PNG ad alta risoluzione.
import type { Rettangolo } from '../diagram/geometry';

/** Stili dei diagrammi con colori fissi (tema chiaro): l'SVG esportato non dipende dal CSS dell'app. */
export const CSS_ESPORTAZIONE = `
text { font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
.er-linea { fill: none; stroke: #334155; stroke-width: 1.6; }
.er-gen { stroke-width: 2; }
.er-freccia { fill: #334155; }
.er-linea-attr { stroke: #334155; stroke-width: 1.2; }
.er-attr { fill: #ffffff; stroke: #334155; stroke-width: 1.4; }
.er-chiave { fill: #0f172a; stroke: #0f172a; stroke-width: 1.4; }
.er-entita { fill: #e8efff; stroke: #1e40af; stroke-width: 2; }
.er-rombo { fill: #fff4dc; stroke: #b45309; stroke-width: 2; }
.er-giunzione { fill: #334155; }
.er-nome { fill: #0f172a; font-size: 14px; font-weight: 600; }
.er-testo-attr { fill: #0f172a; font-size: 12px; }
.er-testo-chiave { font-weight: 600; text-decoration: underline; }
.er-card { fill: #9a3412; font-size: 12px; font-weight: 600; paint-order: stroke; stroke: #ffffff; stroke-width: 4px; stroke-linejoin: round; }
.pg-card-mancante { fill: #b91c1c; }
.log-box { fill: #ffffff; stroke: #1e40af; stroke-width: 1.5; }
.log-intestazione { fill: #1e3a8a; }
.log-nome { fill: #ffffff; font-size: 14px; font-weight: 700; }
.log-separatore { stroke: #d5dbe7; stroke-width: 1; }
.log-col { fill: #0f172a; font-size: 14px; }
.log-pk { font-weight: 700; }
.log-fk { fill: #6d28d9; }
.log-badge { fill: #556073; font-size: 9px; font-weight: 700; }
.log-tipo { fill: #556073; font-size: 11px; }
.log-arco { fill: none; stroke: #7c3aed; stroke-width: 1.6; }
.log-freccia, .log-origine { fill: #7c3aed; }
`;

/** SVG completo e autonomo per il contenuto disegnato nel riquadro `box`. */
export function svgAutonomo(contenuto: string, box: Rettangolo, titolo = '', margine = 28): string {
  const x = Math.floor(box.x - margine);
  const y = Math.floor(box.y - margine - (titolo ? 30 : 0));
  const w = Math.ceil(box.w + 2 * margine);
  const h = Math.ceil(box.h + 2 * margine + (titolo ? 30 : 0));
  const testoTitolo = titolo
    ? `<text x="${x + margine}" y="${y + margine}" style="font: 600 16px -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; fill: #0f172a">${titolo
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"><style>${CSS_ESPORTAZIONE}</style><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>${testoTitolo}${contenuto}</svg>`;
}

export function dimensioniSvg(svg: string): { w: number; h: number } {
  const m = /width="(\d+)" height="(\d+)"/.exec(svg);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 800, h: 600 };
}

/** PNG ad alta risoluzione (scala 2–3, entro i limiti di dimensione del canvas di Safari). */
export async function pngDaSvg(svg: string, scala = 3): Promise<Blob> {
  const { w, h } = dimensioniSvg(svg);
  // Safari limita i canvas a circa 16 milioni di pixel
  const s = Math.max(1, Math.min(scala, Math.sqrt(16_000_000 / (w * h)), 8000 / Math.max(w, h)));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok();
      img.onerror = () => ko(new Error('Impossibile preparare l\'immagine.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * s);
    canvas.height = Math.round(h * s);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Esportazione PNG non riuscita.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function nomeFileSicuro(nome: string, estensione: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'schema'}.${estensione}`;
}
