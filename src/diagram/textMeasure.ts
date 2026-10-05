// Misura della larghezza del testo: canvas nel browser, stima nei test (Node).

export const FONT_FAMIGLIA = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

let ctx: CanvasRenderingContext2D | null | undefined;

function contesto(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  try {
    ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

const cache = new Map<string, number>();

export function larghezzaTesto(testo: string, dimensione: number, grassetto = false): number {
  const k = `${dimensione}|${grassetto ? 1 : 0}|${testo}`;
  const c = cache.get(k);
  if (c !== undefined) return c;
  const g = contesto();
  let w: number;
  if (g) {
    g.font = `${grassetto ? '600 ' : ''}${dimensione}px ${FONT_FAMIGLIA}`;
    w = g.measureText(testo).width;
  } else {
    // stima prudente (per eccesso) quando il canvas non c'è
    let unita = 0;
    for (const ch of testo) {
      if (/[il.,:;'|!()\[\]]/.test(ch)) unita += 0.32;
      else if (/[mwMW@]/.test(ch)) unita += 0.9;
      else if (/[A-Z_]/.test(ch)) unita += 0.7;
      else unita += 0.58;
    }
    w = unita * dimensione * (grassetto ? 1.06 : 1);
  }
  cache.set(k, w);
  return w;
}
