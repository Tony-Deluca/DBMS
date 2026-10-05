// Unisce la build di vite.artifact.config.ts in un solo file HTML senza <html>/<head>/<body>
// (la pagina pubblicata su claude.ai riceve il suo scheletro al momento della pubblicazione).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = fileURLToPath(new URL('..', import.meta.url));
const dist = join(radice, 'dist-artifact');
const html = readFileSync(join(dist, 'index.html'), 'utf-8');
const assets = join(dist, 'assets');
const file = readdirSync(assets);
const js = file.filter((f) => f.endsWith('.js'));
const css = file.filter((f) => f.endsWith('.css'));
if (js.length !== 1) throw new Error(`atteso un solo bundle JS, trovati: ${js.join(', ')}`);

// </script> dentro il JS chiuderebbe il tag: lo spezzo
const codice = readFileSync(join(assets, js[0]), 'utf-8').replace(/<\/script/gi, '<\\/script');
const stile = css.map((f) => readFileSync(join(assets, f), 'utf-8')).join('\n');
const titolo = /<title>[\s\S]*?<\/title>/.exec(html)?.[0] ?? '<title>Palestra SQL</title>';
const corpo = /<body>([\s\S]*?)<\/body>/.exec(html)[1]
  .replace(/<script type="module"[^>]*><\/script>/g, '')
  .trim();

const uscita = `${titolo.replace(/<title>.*<\/title>/, '<title>Palestra SQL</title>')}
<meta name="description" content="Esercizi di query SQL con modello ER, modello logico e verifica automatica.">
<style>
${stile}
/* pagina pubblicata: lo scheletro gestisce già le aree sicure in alto e in basso */
.app { height: 100%; padding-top: 0; }
</style>
${corpo}
<script type="module">
${codice}
</script>
`;
const destinazione = process.argv[2] ?? join(radice, 'dist-artifact', 'palestra-sql.html');
writeFileSync(destinazione, uscita);
console.log(`creato ${destinazione} (${(uscita.length / 1024 / 1024).toFixed(2)} MB)`);
