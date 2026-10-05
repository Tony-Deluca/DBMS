export interface Punto {
  x: number;
  y: number;
}

export interface Rettangolo {
  x: number; // angolo in alto a sinistra
  y: number;
  w: number;
  h: number;
}

/** Intersezione del segmento da `fuori` verso il centro di un rettangolo con il suo bordo. */
export function bordoRettangolo(cx: number, cy: number, w: number, h: number, fuori: Punto): Punto {
  const dx = fuori.x - cx;
  const dy = fuori.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy - h / 2 };
  const sx = dx !== 0 ? w / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/** Intersezione del segmento da `fuori` verso il centro di un rombo con il suo bordo. */
export function bordoRombo(cx: number, cy: number, w: number, h: number, fuori: Punto): Punto {
  const dx = fuori.x - cx;
  const dy = fuori.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy - h / 2 };
  // |x|/(w/2) + |y|/(h/2) = 1
  const s = 1 / (Math.abs(dx) / (w / 2) + Math.abs(dy) / (h / 2));
  return { x: cx + dx * s, y: cy + dy * s };
}

export function siSovrappongono(a: Rettangolo, b: Rettangolo, margine = 0): boolean {
  return a.x < b.x + b.w + margine && b.x < a.x + a.w + margine && a.y < b.y + b.h + margine && b.y < a.y + a.h + margine;
}

/** Percorso SVG morbido (Catmull-Rom → Bézier) che passa per i punti dati. */
export function percorsoMorbido(punti: Punto[]): string {
  if (punti.length === 0) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  if (punti.length === 2) return `M${f(punti[0].x)},${f(punti[0].y)}L${f(punti[1].x)},${f(punti[1].y)}`;
  let d = `M${f(punti[0].x)},${f(punti[0].y)}`;
  for (let i = 0; i < punti.length - 1; i++) {
    const p0 = punti[i - 1] ?? punti[i];
    const p1 = punti[i];
    const p2 = punti[i + 1];
    const p3 = punti[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

/**
 * Percorso con interpolazione monotona in x (Fritsch–Carlson, come curveMonotoneX di d3):
 * nessun "rimbalzo" oltre i punti. I punti devono essere ordinati in x (crescente o decrescente).
 */
export function percorsoMonotono(punti: Punto[]): string {
  const n = punti.length;
  if (n < 3) return percorsoMorbido(punti);
  const f = (v: number) => Math.round(v * 10) / 10;
  const verso = punti[n - 1].x >= punti[0].x ? 1 : -1;
  const xs = punti.map((p) => p.x * verso);
  const ys = punti.map((p) => p.y);
  // tolgo punti con x non crescente (degenerati)
  const X: number[] = [xs[0]];
  const Y: number[] = [ys[0]];
  for (let i = 1; i < n; i++) {
    if (xs[i] > X[X.length - 1] + 0.5) {
      X.push(xs[i]);
      Y.push(ys[i]);
    }
  }
  const m = X.length;
  if (m < 3) return percorsoMorbido(punti);
  const d: number[] = [];
  for (let i = 0; i < m - 1; i++) d.push((Y[i + 1] - Y[i]) / (X[i + 1] - X[i]));
  const t: number[] = new Array(m).fill(0);
  t[0] = d[0];
  t[m - 1] = d[m - 2];
  for (let i = 1; i < m - 1; i++) t[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < m - 1; i++) {
    if (d[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / d[i];
    const b = t[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * d[i];
      t[i + 1] = tau * b * d[i];
    }
  }
  let path = `M${f(X[0] * verso)},${f(Y[0])}`;
  for (let i = 0; i < m - 1; i++) {
    const h = (X[i + 1] - X[i]) / 3;
    path += `C${f((X[i] + h) * verso)},${f(Y[i] + h * t[i])} ${f((X[i + 1] - h) * verso)},${f(Y[i + 1] - h * t[i + 1])} ${f(X[i + 1] * verso)},${f(Y[i + 1])}`;
  }
  return path;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
