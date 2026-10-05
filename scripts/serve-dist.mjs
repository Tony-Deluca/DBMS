// Server statico minimo che serve dist/ sotto un sottopercorso, come GitHub Pages
// (es. http://localhost:4173/Cluade/). Usato dai test E2E.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = fileURLToPath(new URL('../dist/', import.meta.url));
const porta = Number(process.env.PORT ?? 4173);
const base = process.env.BASE_PATH ?? '/Cluade/';
const tipi = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!url.pathname.startsWith(base)) {
    res.writeHead(302, { location: base });
    return res.end();
  }
  let rel = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
  let file = normalize(join(radice, rel));
  if (!file.startsWith(radice)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const dati = await readFile(file);
    res.writeHead(200, { 'content-type': tipi[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(dati);
  } catch {
    res.writeHead(404);
    res.end('404');
  }
}).listen(porta, () => console.log(`dist servita su http://localhost:${porta}${base}`));
