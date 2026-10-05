# Piano di progetto — Palestra SQL

App web statica (nessun backend, nessun account) per esercitarsi sulle query SQL
in vista dell'esame di Basi di Dati. Funziona su PC (mouse + tastiera) e su iPad
(Safari, touch), offline dopo il primo caricamento.

---

## 1. Scelte tecnologiche

| Esigenza | Scelta | Motivo |
|---|---|---|
| Build / dev server | **Vite** + **TypeScript** | sito statico in `dist/`, tipi per lo schema JSON |
| UI | **TypeScript puro**, niente framework | l'app ha poche viste: un piccolo helper `h()` per il DOM basta, bundle leggero |
| Motore SQL | **sql.js** (SQLite compilato in WASM) | tutto in locale; gira in un **Web Worker** così una query lenta non blocca l'interfaccia e si può interrompere |
| Editor | **CodeMirror 6** + `@codemirror/lang-sql` (dialetto SQLite) | evidenziazione sintassi, autocompletamento di tabelle e colonne, funziona con il touch |
| Layout dei diagrammi | **@dagrejs/dagre** (~30 KB gz) + disegno SVG fatto a mano | layout automatico a livelli senza sovrapposizioni; ELK sarebbe 10 volte più pesante |
| Salvataggio | **IndexedDB** (wrapper minimo scritto a mano) + `navigator.storage.persist()` | gli scenari restano nel browser |
| PWA | **vite-plugin-pwa** (Workbox, `generateSW`) | manifest, icone, service worker che mette in cache anche `sql-wasm.wasm` |
| Test unitari | **Vitest** (sql.js reale in Node) | confronto risultati, guardia SQL, validatore, layout senza sovrapposizioni |
| Test E2E | **Playwright** | viewport laptop e iPad (orizzontale/verticale), import per incolla, offline |

Senza framework UI né librerie di validazione: i messaggi d'errore in italiano
con il percorso del campo (`esercizi[3].soluzioni[0]`) si scrivono più facilmente
con un validatore fatto a mano.

---

## 2. Struttura delle cartelle

```
/
├─ index.html
├─ package.json · tsconfig.json · vite.config.ts · playwright.config.ts
├─ README.md               uso, pubblicazione passo passo, iPad, limiti
├─ SCHEMA.md               formato JSON v1 documentato + esempio completo
├─ PROMPT_GENERATORE.md    prompt da incollare in Claude per generare scenari
├─ PIANO.md                questo file
├─ scenari-esempio/
│   └─ universita.json     scenario di esempio (7 tabelle, 8 esercizi)
├─ public/
│   ├─ favicon.svg · icon-192.png · icon-512.png · icon-maskable-512.png · apple-touch-icon.png
├─ scripts/
│   └─ genera-icone.mjs    rende le PNG dall'SVG con Playwright (solo sviluppo)
├─ .github/workflows/deploy.yml   build + test + pubblicazione su GitHub Pages
├─ src/
│   ├─ main.ts             avvio, registrazione service worker
│   ├─ app/                stato globale, eventi, navigazione tra le viste
│   ├─ ui/                 header, gestione scenari, viste ER/logico/esercizi,
│   │                      tabella risultati, barra scorciatoie, pan/zoom, dialog, toast
│   ├─ editor/             setup CodeMirror, normalizzazione virgolette tipografiche
│   ├─ diagram/            layout + rendering SVG di ER e logico, misura del testo
│   ├─ sql/                worker sql.js, client RPC con timeout, guardia
│   │                      SELECT/WITH, tokenizer, confronto risultati, errori in italiano
│   ├─ scenario/           tipi, validatore, localizzazione errori JSON, pulizia input incollato
│   ├─ storage/            IndexedDB, storage persistente
│   └─ styles/main.css     tema chiaro/scuro con variabili CSS
└─ tests/
    ├─ unit/               *.test.ts (Vitest)
    └─ e2e/                *.spec.ts (Playwright)
```

---

## 3. Formato JSON dello scenario (v1)

```jsonc
{
  "version": 1,
  "metadati": { "titolo": "…", "descrizione": "…", "dominio": "…", "autore": "…" },
  "er": {
    "entita": [
      { "nome": "STUDENTE",
        "attributi": [ { "nome": "Matricola", "chiave": true },
                       { "nome": "Email", "cardinalita": "(0,1)" } ] }
    ],
    "relazioni": [
      { "nome": "ESAME",
        "partecipanti": [ { "entita": "STUDENTE", "cardinalita": "(0,N)" },
                          { "entita": "CORSO",    "cardinalita": "(0,N)" } ],
        "attributi": [ { "nome": "Voto" }, { "nome": "Data" } ] }
    ],
    "generalizzazioni": [
      { "padre": "DOCENTE", "figlie": ["ORDINARIO", "ASSOCIATO"], "copertura": "(t,e)" }
    ]
  },
  "logico": {
    "tabelle": [
      { "nome": "Esame",
        "colonne": [ { "nome": "Studente", "tipo": "INTEGER", "nullable": false }, … ],
        "chiavePrimaria": ["Studente", "Corso"],
        "chiaviEsterne": [ { "colonne": ["Studente"], "tabella": "Studente", "riferimenti": ["Matricola"] } ] }
    ]
  },
  "database": { "statements": [ "CREATE TABLE …", "INSERT INTO … VALUES …" ] },
  "esercizi": [
    { "id": "E1", "titolo": "…", "difficolta": 1, "argomento": "join",
      "traccia": "…", "soluzioni": [ "SELECT …", "SELECT … EXISTS …" ], "suggerimento": "…" }
  ]
}
```

- `version` obbligatorio (oggi `1`): le versioni future si potranno migrare.
- Cardinalità come stringhe `"(min,max)"` con min ∈ {0,1,n} e max ∈ {1,N,n}.
- Identificatori composti: più attributi con `"chiave": true`.
  Identificatore esterno: `"identificatoreEsterno": ["RELAZIONE"]` sull'entità.
- `difficolta` va da 1 a 5; `soluzioni` contiene da 1 a 3 query equivalenti.
- Validazione a due livelli:
  **errori** (bloccano l'import: campo mancante/tipo errato, riferimenti a
  entità/tabelle inesistenti, SQL del database che fallisce, soluzione non
  SELECT/WITH o che va in errore) e **avvisi** (soluzione con risultato vuoto,
  soluzioni alternative non equivalenti, tabelle del logico diverse da quelle del database).

Il formato completo è documentato in `SCHEMA.md`. Un test verifica che
l'esempio contenuto in SCHEMA.md superi davvero la validazione.

---

## 4. Viste e interazione

**Header**: nome dell'app, selettore dello scenario attivo, pulsante "Scenari"
(gestione e importazione), "?" (guida), tema (auto/chiaro/scuro).
**Navigazione**: tre tab, cioè *Modello ER*, *Modello logico* ed *Esercizi*.

### 4.1 Modello ER (notazione Atzeni–Ceri, quella dei corsi italiani)
- Entità come rettangoli, relazioni come rombi, attributi "a lecca-lecca":
  cerchio vuoto, oppure **cerchio pieno se fa parte dell'identificatore**.
  Le cardinalità degli attributi (0,1)/(1,N) si mostrano accanto al nome.
- Cardinalità `(min,max)` sul ramo vicino all'entità, più il ruolo se presente.
- Attributi delle relazioni appesi al rombo.
- Generalizzazioni: le figlie convergono in un punto di giunzione con una freccia
  verso il padre e l'etichetta di copertura `(t,e)`, `(p,s)`…
- Relazioni ricorsive: due rami paralleli distinti, ciascuno con il suo ruolo.
- Layout: dagre (da sinistra a destra) sul grafo bipartito entità–rombi.
  Gli attributi sono disposti a pettine sopra e sotto ogni nodo, così i rami
  orizzontali non li attraversano. Un test verifica che non ci siano sovrapposizioni
  con 10 entità.

### 4.2 Modello logico
- **Diagramma**: una tabella per box (intestazione con il nome, righe colonna/tipo).
  PK <u>sottolineata</u> con icona chiave, FK con il badge "FK → Tabella" e una
  freccia curva dalla riga della colonna alla riga della colonna referenziata.
- **Vista testuale** (quella delle dispense):
  `ESAME(<u>Studente</u>, <u>Corso</u>, Voto, Data)` seguita da
  `Studente → STUDENTE(Matricola)`. È compatta e ideale nel pannello laterale.

### 4.3 Pan e zoom (entrambi i diagrammi)
- Pointer Events: un dito o il mouse trascinano; due dita fanno il pinch-zoom
  attorno al punto medio; la rotellina fa zoom attorno al cursore.
- `touch-action: none` sul canvas e blocco di `gesturestart` (Safari),
  così la pagina non si zooma al posto del diagramma.
- Pulsanti ＋, －, **Adatta** (da 44×44 px). L'adattamento è automatico al primo
  rendering e al ridimensionamento finché l'utente non sposta la vista.

### 4.4 Esercizi
- Fila di "chip" E1…E8 con stato (non svolto / tentato / risolto ✓ / soluzione vista)
  e pulsanti precedente/successivo.
- Traccia con difficoltà (●●●○○) e argomento, suggerimento facoltativo
  (pulsante "Suggerimento", niente hover).
- Editor CodeMirror: font 16px, `autocorrect=off`, `autocapitalize=off`,
  `spellcheck=false`, `autocomplete=off`. Le virgolette tipografiche ‘ ’ “ ”
  e il trattino lungo — vengono convertite al volo in ' " -- (le "virgolette
  intelligenti" di iOS sono un'impostazione della tastiera che una pagina web
  non può spegnere in modo affidabile, quindi le correggiamo noi).
  Autocompletamento di tabelle e colonne dello scenario.
- **Barra scorciatoie**: SELECT, FROM, WHERE, JOIN, ON, GROUP BY, HAVING,
  ORDER BY, AS, AND, OR, NOT, IN, EXISTS, DISTINCT, COUNT, ( ), ' ', *, =, <>,
  <, >, %, virgola, punto, `;`. Su touch, con l'editor attivo, la barra si
  aggancia sopra la tastiera virtuale (calcolata con l'API `visualViewport`);
  altrimenti sta sotto l'editor. I tasti non tolgono il focus all'editor.
- **Esegui** (anche Ctrl/Cmd+Invio) e **Verifica** (Ctrl/Cmd+Maiusc+Invio),
  poi **Mostra soluzione** (chiede conferma se non hai ancora provato) con
  soluzione ufficiale e alternative, più "Copia nell'editor".
- La bozza di ogni esercizio viene salvata automaticamente in IndexedDB.
- Tabella dei risultati: scorrimento orizzontale nativo, intestazione fissa,
  celle che vanno a capo (mai troncate), NULL in corsivo, numeri allineati a
  destra; oltre 500 righe c'è il pulsante "mostra altre".

### 4.5 Layout responsive
- **≥ 1024 px** (laptop, iPad orizzontale 1180): due colonne. A sinistra
  l'esercizio, a destra il pannello di consultazione con le tab
  *ER / Logico / Testo*, separato da un divisore trascinabile (anche col dito).
- **< 1024 px** (iPad verticale 820): una colonna; il pulsante **Schema** apre
  un pannello a scomparsa da destra con le stesse tab.
- `100dvh` (niente `100vh`), `viewport-fit=cover` e `env(safe-area-inset-*)`.
  Nessuna funzione dipende dall'hover; i bersagli touch sono di almeno 44×44 px.
- Tema chiaro/scuro con variabili CSS (anche i diagrammi, senza ri-rendering).

---

## 5. Esecuzione SQL e sicurezza

- Un Web Worker contiene il database sql.js. Ad ogni apertura dello scenario il DB
  viene ricreato eseguendo gli `statements` dentro una transazione (veloce
  anche con migliaia di INSERT).
- Alla fine del caricamento si imposta **`PRAGMA query_only = ON`**: anche se la
  guardia lasciasse passare qualcosa, SQLite rifiuta qualunque scrittura.
- La **guardia** (tokenizer che ignora stringhe e commenti) permette una sola
  istruzione, che deve iniziare con `SELECT` o `WITH`. Blocca anche
  `WITH … DELETE/INSERT/UPDATE`. I messaggi sono comprensibili ("Sono consentite
  solo interrogazioni SELECT/WITH: i dati dello scenario non si possono modificare").
- **Timeout** di 8 s: il worker viene terminato e ricreato, e il DB ricaricato
  ("Query interrotta: probabilmente un prodotto cartesiano enorme o una CTE ricorsiva infinita").
- I messaggi d'errore SQLite più comuni sono tradotti in italiano
  (tabella/colonna inesistente, colonna ambigua, errore di sintassi vicino a…,
  uso improprio di funzione aggregata…), con l'originale tra parentesi.

## 6. Verifica della risposta (`src/sql/compare.ts`)

Per ogni soluzione ufficiale: esegui la query ufficiale e quella dell'utente
sullo stesso DB e confronta **i risultati**.
1. Stesso numero di colonne (i nomi si ignorano).
2. Righe confrontate come **multiinsieme**: chiave canonica per riga
   (i reali arrotondati a 9 cifre significative). Le righe rimaste senza coppia
   passano a un secondo abbinamento con **tolleranza** relativa 1e-6, così
   `3` e `3.0000000001` coincidono. Interi e reali sono confrontabili tra loro;
   NULL = NULL; testo esatto.
3. **Ordine** solo se la soluzione ufficiale ha un `ORDER BY` al livello più
   esterno (non dentro sottoquery). Per tollerare i pareggi, se le voci
   dell'ORDER BY si riferiscono a colonne del risultato (nome, alias o
   posizione) si confronta solo la sequenza delle **chiavi d'ordinamento**;
   altrimenti si confronta la sequenza delle righe intere.
4. Corretta se coincide con **almeno una** soluzione. Se è sbagliata il
   feedback usa la soluzione "più vicina": colonne diverse (n vs m), righe
   mancanti (quante + un esempio), righe in più (quante + un esempio),
   ordine errato (prima posizione in cui differisce). La soluzione non viene mai rivelata.

## 7. Importazione e gestione scenari

- Tre modi: **file picker** (`accept=".json,application/json"`),
  **area di testo per incollare** (con il pulsante "Incolla dagli appunti"
  quando l'API è disponibile) e **drag & drop** (solo come extra su PC).
- Pulizia del testo incollato: BOM, recinti ```json … ```, testo prima del
  primo `{` o dopo l'ultimo `}`.
- Errori di sintassi JSON con **riga e colonna**: un piccolo parser di
  diagnostica, perché Safari non dà la posizione dell'errore.
- Validazione: schema → coerenza (ER/logico) → esecuzione reale in un DB
  temporaneo di statements e soluzioni. Gli errori vengono elencati con il percorso del campo.
- Elenco scenari: apri, rinomina, esporta (`.json` da scaricare + "Copia JSON",
  utile su iPad), elimina (con conferma), azzera progressi, ripristina esempio.
- `navigator.storage.persist()` all'avvio e dopo il primo import, con lo stato
  mostrato nella finestra Scenari.

## 8. Scenario di esempio: Università

7 tabelle (Dipartimento, Docente, CorsoDiLaurea, Studente, Corso, Esame,
Propedeuticita), una generalizzazione (Docente → Ordinario/Associato/Ricercatore,
accorpata nel padre con il campo `Ruolo`), una relazione ricorsiva
(propedeuticità) e una N:N con attributi (Esame).
Casi limite inclusi: studenti senza esami, corso senza esami, dipartimento
senza docenti, email NULL, omonimi, voti uguali, corsi con gli stessi crediti.
8 esercizi in ordine di difficoltà: selezione con ORDER BY, join, join a tre vie con
DISTINCT, GROUP BY con LEFT JOIN (conteggio 0), HAVING, sottoquery scalare,
NOT EXISTS (con la trappola del NOT IN e NULL), divisione (doppio NOT EXISTS e
alternativa con COUNT).

## 9. PWA e pubblicazione

- `base: './'` (percorsi relativi): la stessa build funziona su GitHub Pages
  (`/nome-repo/`), Netlify e Cloudflare Pages.
- Manifest (nome, colori, `display: standalone`, icone 192/512/maskable),
  `apple-touch-icon` e meta per iOS.
- Service worker Workbox con precache di js, css, html, **wasm**, icone;
  `registerType: autoUpdate` (al prossimo avvio carica la versione nuova).
- Workflow `.github/workflows/deploy.yml`: `npm ci` → `npm test` → `npm run build`
  → `actions/upload-pages-artifact` → `actions/deploy-pages`.
- README: pubblicazione passo passo (GitHub Pages, in alternativa
  Netlify/Cloudflare), "Aggiungi alla schermata Home" da Safari, backup con l'esportazione.

## 10. Documenti

- `SCHEMA.md`: tutti i campi, i vincoli, gli errori e gli avvisi, più un esempio completo.
- `PROMPT_GENERATORE.md`: un prompt autosufficiente con lo schema, le regole
  (dominio e difficoltà variabili, casi limite obbligatori come NULL,
  duplicati ed entità senza associazioni, ORDER BY con ordinamento totale,
  verifica che ogni soluzione dia un risultato non vuoto e coerente con la traccia)
  e la richiesta di un **unico blocco di codice JSON**.
- **Avviso di fragilità** (README, SCHEMA, prompt, guida nell'app): un risultato
  uguale non dimostra che la query sia corretta in generale.

## 11. Test

**Unit (Vitest + sql.js in Node)**
- confronto: corretta; corretta in forma alternativa (JOIN / sottoquery / EXISTS);
  colonne diverse; righe mancanti; righe in più; duplicati; ordine errato; pareggi
  con ORDER BY; tolleranza sui decimali; NULL.
- guardia: SELECT/WITH ammessi, DML/DDL/PRAGMA/ATTACH bloccati,
  `WITH … DELETE` bloccato, più istruzioni bloccate, `;` finale ammesso,
  parole chiave dentro stringhe e commenti ignorate.
- validatore: lo scenario d'esempio e l'esempio di SCHEMA.md sono validi;
  gli errori riportano il percorso giusto; posizione dell'errore JSON.
- scenario d'esempio: tutte le soluzioni girano, non sono vuote e le alternative sono equivalenti.
- layout ER/logico: nessuna sovrapposizione tra nodi con 10 entità.

**E2E (Playwright)**: build servita sotto `/Cluade/` come su GitHub Pages
- caricamento, ER e logico disegnati, esecuzione e verifica di una query digitata,
  blocco di `DELETE`;
- import per incolla (anche da un blocco ```json);
- viewport laptop 1366×768, iPad 1180×820 e 820×1180 con touch: niente
  scroll orizzontale della pagina, pannello laterale o a scomparsa al posto
  giusto, pulsanti ≥ 44 px;
- funzionamento offline dopo il primo caricamento (service worker);
- screenshot salvati per controllo visivo.

**Limite noto**: nell'ambiente di sviluppo è disponibile solo Chromium (WebKit
non è installato), quindi i test "iPad" usano Chromium con viewport e touch
emulati. Il comportamento reale di Safari/iPadOS (tastiera virtuale, virgolette
intelligenti, Aggiungi a Home) va verificato su un dispositivo vero. La
configurazione Playwright include già un progetto WebKit, da attivare dove WebKit è installabile.
