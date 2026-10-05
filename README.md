# Palestra SQL — Basi di Dati

Sito web personale per esercitarsi sulle **query SQL** in vista dell'esame di
Basi di Dati. Ogni *scenario* contiene:

- il **modello ER** (notazione Atzeni–Ceri dei corsi italiani: entità, relazioni,
  attributi con identificatori pieni, cardinalità `(min,max)`, generalizzazioni);
- il **modello logico** (tabelle, chiavi primarie sottolineate, chiavi esterne con frecce
  e in notazione testuale `TABELLA(Pk, Col, Fk*)`);
- un set di **esercizi** con editor SQL, esecuzione e **verifica automatica** del risultato.

Gira tutto nel browser (SQLite compilato in WebAssembly con sql.js): nessun
server, nessun account. Funziona offline, su PC e su iPad (Safari), e si può
installare come app sulla schermata Home.

Gli scenari si generano in una chat con Claude usando il prompt in
[`PROMPT_GENERATORE.md`](PROMPT_GENERATORE.md) e si importano incollando il JSON.
Il formato è documentato in [`SCHEMA.md`](SCHEMA.md). Il piano di progetto è in
[`PIANO.md`](PIANO.md).

---

## Uso rapido

1. Apri il sito. Lo scenario d'esempio **Università** (7 tabelle, 8 esercizi) è già caricato.
2. Consulta **Modello ER** e **Modello logico**. Trascina per spostare, pinch o
   rotellina per lo zoom, **⤢** (o doppio tocco) per adattare il diagramma allo schermo.
3. In **Esercizi** scrivi la query:
   - **Esegui** (o `Ctrl/⌘ + Invio`) mostra il risultato;
   - **Verifica** (o `Ctrl/⌘ + ⇧ + Invio`) lo confronta con la soluzione ufficiale;
   - **Mostra soluzione** rivela la soluzione ufficiale e le alternative.
   Su schermo largo lo schema resta visibile a destra (il divisore si trascina);
   su iPad in verticale si apre con il pulsante **Schema**.
4. Per un nuovo scenario: **Scenari → «Copia il prompt per generare scenari»** →
   incollalo in Claude → copia il blocco JSON della risposta → incollalo in
   **Scenari → Importa testo incollato**.

Bozze e progressi (✓ risolto, tentato, soluzione vista) vengono salvati automaticamente.

### Come viene verificata la risposta

Si confrontano i **risultati**, non il testo SQL. La risposta è corretta se il
risultato coincide con quello di almeno una delle soluzioni ufficiali:

- stesso numero di colonne (i nomi/alias vengono ignorati);
- righe confrontate come **multiinsieme** (i duplicati contano, l'ordine no);
- l'ordine conta solo se la soluzione ufficiale ha un `ORDER BY`; le righe a pari
  merito possono stare in qualunque ordine;
- i numeri decimali si confrontano con una piccola tolleranza.

Se la risposta è sbagliata ricevi un feedback utile senza che ti venga
rivelata la soluzione: colonne in più o in meno, righe mancanti o in più (con un
esempio), ordine errato (con la prima riga diversa).

### ⚠️ Attenzione: la verifica può essere ingannata dai dati

Due query diverse possono dare **lo stesso risultato per coincidenza** sui dati
dello scenario (es. `JOIN` invece di `LEFT JOIN` quando ogni corso ha almeno un
esame). Un «Corretto» dice che la query funziona *su questi dati*, non che è giusta
in generale: confrontala sempre con le soluzioni ufficiali.

Per ridurre il rischio, **gli scenari vanno generati con dati che contengono
casi limite**: valori NULL (anche in chiavi esterne facoltative), duplicati,
entità senza associazioni (tuple che restano vuote in un join), valori al
confine delle condizioni, pareggi. Il prompt in `PROMPT_GENERATORE.md` lo impone
e l'importazione segnala con un avviso le soluzioni che restituiscono un
risultato vuoto o alternative non equivalenti.

---

## Pubblicazione gratuita (passo passo)

Su iPad non si possono eseguire `npm` né un server locale: il sito va pubblicato
una volta online, poi si apre da Safari (e dopo il primo caricamento funziona
anche offline).

### Opzione A — GitHub Pages (consigliata, workflow già pronto)

1. Su GitHub crea un repository (anche privato, se il tuo piano consente Pages
   su repository privati; altrimenti pubblico) e caricaci questo progetto.
   Il ramo principale deve chiamarsi `main` o `master`.
2. Nel repository apri **Settings → Pages**.
3. In **Build and deployment → Source** scegli **GitHub Actions**.
4. Vai in **Actions**: il workflow **«Pubblica su GitHub Pages»**
   (`.github/workflows/deploy.yml`) parte a ogni push. Se non è mai partito, aprilo
   e premi **Run workflow**. Esegue `npm ci`, i test, `npm run build` e pubblica `dist/`.
5. Dopo 1–2 minuti il sito è su `https://<tuo-utente>.github.io/<nome-repository>/`
   (lo vedi anche in Settings → Pages e nel riepilogo del workflow).
   Per questo repository: `https://tony-deluca.github.io/Cluade/`.

La build usa percorsi relativi (`base: './'`), quindi funziona sotto
`/<nome-repository>/` senza configurazioni aggiuntive.

### Opzione B — Netlify o Cloudflare Pages

1. Collega il repository GitHub dal pannello di Netlify ("Add new site → Import
   an existing project") o di Cloudflare ("Workers & Pages → Create → Pages →
   Connect to Git").
2. Impostazioni di build: **Build command** `npm run build`, **Publish/Output
   directory** `dist`, versione di Node 20 o superiore (variabile `NODE_VERSION=22`
   se serve).
3. Salva: a ogni push il sito viene ricostruito.

### Aggiornamenti

A ogni push il sito si aggiorna. L'app installata scarica la nuova versione in
background e la usa alla riapertura successiva (chiudila completamente e riaprila).
Gli scenari salvati non vengono toccati.

---

## Installarla su iPad (schermata Home)

1. Apri l'indirizzo del sito con **Safari** (con altri browser su iPad
   l'installazione può non essere disponibile).
2. Aspetta il caricamento completo: in basso compare «Pronta anche offline».
3. Tocca il pulsante **Condividi** (il quadrato con la freccia verso l'alto, in
   alto a destra nella barra di Safari).
4. Scorri e scegli **«Aggiungi alla schermata Home»**, poi **Aggiungi**.
5. Apri **Palestra SQL** dall'icona: si apre a tutto schermo, come un'app, e
   funziona anche senza connessione.

Consigli per iPad:

- Safari può cancellare i dati dei siti non usati per alcune settimane. L'app
  chiede l'**archiviazione persistente** (lo stato è nella finestra Scenari), e
  l'app installata sulla schermata Home è più protetta. Ogni tanto usa comunque
  **Esporta** o **Copia JSON** per fare un backup degli scenari a cui tieni.
- L'app installata e Safari hanno archivi **separati**: gli scenari importati in
  Safari non compaiono nell'app della schermata Home (e viceversa).
- Le **virgolette tipografiche** (’ “ ”) inserite dalla tastiera vengono convertite
  automaticamente in apici dritti. Se vuoi, puoi anche disattivarle in
  Impostazioni → Generali → Tastiera → «Punteggiatura smart».
- Con la tastiera virtuale aperta compare una **barra di scorciatoie** (SELECT,
  FROM, WHERE, JOIN, GROUP BY, ( ), ' ', *, =, <>, % …) sopra la tastiera.

---

## Sviluppo

Richiede Node.js 20 o superiore.

```bash
npm install
npm run dev          # server di sviluppo (http://localhost:5173)
npm test             # test unitari (Vitest)
npm run build        # sito statico in dist/ (con service worker e manifest)
npm run test:e2e     # test E2E (Playwright): build servita sotto /Cluade/
npm run icone        # rigenera le icone PNG da public/favicon.svg
python3 scripts/crea-esempio.py   # rigenera scenari-esempio/universita.json
```

### Struttura

```
src/
  app/        stato globale e azioni (scenari, progressi)
  ui/         viste (ER, logico, esercizi), dialoghi, pan/zoom, barra scorciatoie
  editor/     CodeMirror 6 configurato per SQL e per iPad
  diagram/    layout automatico (dagre) e rendering SVG di ER e logico
  sql/        worker sql.js, guardia SELECT/WITH, confronto risultati, errori in italiano
  scenario/   tipi, validatore, lettura del JSON incollato, importazione
  storage/    IndexedDB e archiviazione persistente
tests/unit/   confronto, guardia, validatore, scenario d'esempio, layout, documenti
tests/e2e/    layout laptop/iPad, esecuzione e verifica, import per incolla, offline
```

### Scelte tecniche

- **Vite + TypeScript** senza framework UI: poche viste e un bundle leggero.
- **sql.js** in un **Web Worker**: le query non bloccano l'interfaccia e quelle
  troppo lunghe (oltre 8 s) vengono interrotte ricreando il worker.
- Sicurezza dei dati: è ammessa una sola istruzione `SELECT`/`WITH`
  (`WITH … DELETE` compreso tra quelle bloccate), e in più il database è aperto con
  `PRAGMA query_only = ON`. A ogni apertura dello scenario viene ricreato dagli statement.
- **CodeMirror 6** con evidenziazione della sintassi, autocompletamento di tabelle e
  colonne, `autocorrect/autocapitalize/spellcheck` disattivati e font a 16 px (niente
  zoom automatico di iOS).
- **dagre** per il layout automatico dei diagrammi; gli archi si agganciano ai lati
  delle figure e gli attributi stanno sopra e sotto, così non si sovrappongono.
- **vite-plugin-pwa** (Workbox): manifest, icone e precache di tutto, compreso il
  file `.wasm` di SQLite.

### Limiti noti

- I test automatici "iPad" usano Chromium con viewport e touch emulati (nell'ambiente
  di sviluppo WebKit non era disponibile). Comportamenti specifici di Safari/iPadOS
  (tastiera virtuale e barra scorciatoie agganciata, punteggiatura smart,
  installazione sulla schermata Home, eliminazione dei dati dopo inattività) vanno
  provati su un iPad reale.
- La verifica confronta i risultati sui dati dello scenario: vedi l'avvertenza sopra.
