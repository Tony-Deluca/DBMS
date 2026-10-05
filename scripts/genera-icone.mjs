// Genera le icone PNG della PWA a partire da public/favicon.svg (solo sviluppo).
// Uso: npm run icone
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf-8');
const browser = await chromium.launch();
const page = await browser.newPage();

async function rendi(nome, lato, { maschera = false, sfondo = false } = {}) {
  await page.setViewportSize({ width: lato, height: lato });
  // maskable: l'icona occupa la "safe zone" centrale (80%) su sfondo pieno
  const interno = maschera ? Math.round(lato * 0.72) : lato;
  const svgSenzaAngoli = maschera || sfondo ? svg.replace('rx="14"', 'rx="0"') : svg;
  await page.setContent(`<html><body style="margin:0;background:${maschera || sfondo ? '#1e3a8a' : 'transparent'};display:grid;place-items:center;width:${lato}px;height:${lato}px">
    <div style="width:${interno}px;height:${interno}px">${svgSenzaAngoli.replace('<svg ', `<svg width="${interno}" height="${interno}" `)}</div></body></html>`);
  const buf = await page.screenshot({ omitBackground: !(maschera || sfondo), clip: { x: 0, y: 0, width: lato, height: lato } });
  writeFileSync(new URL(`../public/${nome}`, import.meta.url), buf);
  console.log('creata', nome);
}

await rendi('icon-192.png', 192);
await rendi('icon-512.png', 512);
await rendi('icon-maskable-512.png', 512, { maschera: true });
await rendi('apple-touch-icon.png', 180, { sfondo: true });
await browser.close();
