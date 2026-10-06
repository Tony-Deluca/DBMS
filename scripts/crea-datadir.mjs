// Prepara la cartella dati di PostgreSQL (PGlite) già inizializzata, così l'app non deve eseguire initdb a
// ogni avvio (5-6 s): con la cartella pronta il motore parte in meno di un secondo.
// Si tolgono i database template0 e template1 (inutili qui) per ridurre il download a ~2,5 MB.
// Va rigenerata quando si aggiorna @electric-sql/pglite: npm run datadir
import { PGlite } from '@electric-sql/pglite';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONF = ['shared_buffers = 8MB', 'wal_buffers = 1MB'];

const db = await PGlite.create({ postgresqlconf: CONF });
await db.exec("UPDATE pg_database SET datistemplate = false WHERE datname IN ('template0', 'template1')");
await db.exec('DROP DATABASE template0');
await db.exec('DROP DATABASE template1');
await db.exec('CHECKPOINT');
const dump = await db.dumpDataDir('gzip');
const dest = fileURLToPath(new URL('../src/sql/pg/datadir.tar.gz', import.meta.url));
writeFileSync(dest, Buffer.from(await dump.arrayBuffer()));
const versione = (await db.query('SELECT version() AS v')).rows[0].v;
await db.close();
console.log(`creato ${dest} (${(dump.size / 1024 / 1024).toFixed(2)} MB) — ${versione.split(' (')[0]}`);
process.exit(0);
