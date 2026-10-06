# Formato degli scenari — versione 1

Uno **scenario** è un file JSON (o un testo JSON incollato) che contiene tutto ciò
che serve per esercitarsi su un dominio: il modello ER, il modello logico, gli
statement SQL che creano e popolano il database e gli esercizi con le soluzioni.

Lo scenario viene validato all'importazione. Gli **errori** bloccano l'import
e indicano il campo con un percorso, ad esempio `esercizi[2].soluzioni[0]` (gli
indici partono da 0). Gli **avvisi** non lo bloccano: segnalano problemi che
rendono la verifica meno affidabile.

> Lo schema è **versionato** con il campo `version`. Questa versione dell'app
> legge `"version": 1`; uno scenario con una versione più alta viene rifiutato
> con un messaggio che invita ad aggiornare l'app.

---

## Struttura generale

```text
{
  "version": 1,
  "metadati":  { … },   titolo, descrizione…
  "er":        { … },   entità, relazioni, generalizzazioni
  "logico":    { … },   tabelle, colonne, chiavi primarie ed esterne
  "database":  { … },   statement PostgreSQL (CREATE TABLE, INSERT)
  "esercizi":  [ … ]    tracce e soluzioni
}
```

Tutti i nomi dei campi sono in italiano, senza accenti (`entita`, `cardinalita`,
`difficolta`). Un campo sconosciuto produce un avviso, con un suggerimento se
somiglia a un campo valido (es. `difficoltà` → «forse intendevi `difficolta`?»).

---

## `metadati`

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `titolo` | stringa | sì | Nome dello scenario (si può rinominare dall'app). |
| `descrizione` | stringa | no | Testo mostrato sopra i diagrammi. Utile per dichiarare i casi limite presenti nei dati. |
| `dominio` | stringa | no | Es. "Biblioteca", "Compagnia aerea". |
| `autore` | stringa | no | Chi ha generato lo scenario. |

## `er` — modello Entità-Relazione

Notazione Atzeni–Ceri (quella dei corsi italiani): entità come rettangoli,
relazioni come rombi, attributi "a lecca-lecca" con il cerchio pieno per gli
identificatori, cardinalità `(min,max)`.

### `er.entita[]` (almeno una)

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `nome` | stringa | sì | Unico tra entità e relazioni. Di solito in MAIUSCOLO. |
| `attributi` | array di attributi | sì | Può essere vuoto (es. entità figlie di una generalizzazione). |
| `identificatoreEsterno` | array di stringhe | no | Nomi delle relazioni che partecipano all'identificazione (entità debole). Disegnato con un pallino pieno sul ramo. |

**Attributo**: `{ "nome": "Matricola", "chiave": true, "cardinalita": "(0,1)" }`

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `nome` | stringa | sì | |
| `chiave` | booleano | no | `true` se fa parte dell'identificatore. Più attributi con `chiave: true` formano un identificatore composto. |
| `cardinalita` | stringa | no | `"(0,1)"` per un attributo opzionale, `"(1,N)"` per uno multivalore. Se manca vale `(1,1)`. |

Un'entità con attributi ma senza `chiave: true` (e senza identificatore esterno,
e che non sia figlia di una generalizzazione) genera un avviso.

### `er.relazioni[]`

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `nome` | stringa | sì | |
| `partecipanti` | array (≥ 2) | sì | `{ "entita": "STUDENTE", "cardinalita": "(0,N)", "ruolo": "…" }` |
| `attributi` | array di attributi | no | Attributi della relazione (es. `Voto` di `ESAME`). |

- `cardinalita` ha la forma `"(min,max)"`: min ∈ {0, 1, n}, max ∈ {1, N, n}.
  Esempi: `"(0,1)"`, `"(1,1)"`, `"(0,N)"`, `"(1,N)"`, `"(2,5)"`.
- **Relazione ricorsiva**: la stessa entità compare due volte; indica il `ruolo`
  di ciascun partecipante (altrimenti viene dato un avviso).
- Relazioni ternarie: basta indicare tre partecipanti.

### `er.generalizzazioni[]` (facoltativo)

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `padre` | stringa | sì | Entità genitore. |
| `figlie` | array di stringhe | sì | Entità figlie (devono esistere in `er.entita`). |
| `copertura` | stringa | no | `"(t,e)"`, `"(t,s)"`, `"(p,e)"`, `"(p,s)"`: totale/parziale, esclusiva/sovrapposta. |

## `logico` — modello logico relazionale

### `logico.tabelle[]` (almeno una)

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `nome` | stringa | sì | Deve coincidere (maiuscole/minuscole a parte) con una tabella creata in `database`. |
| `colonne` | array | sì | `{ "nome": "Voto", "tipo": "INTEGER", "nullable": false }` |
| `chiavePrimaria` | array di stringhe | sì | Colonne della chiave primaria (sottolineate nel diagramma). |
| `chiaviEsterne` | array | no | `{ "colonne": ["Studente"], "tabella": "Studente", "riferimenti": ["Matricola"] }` |
| `unici` | array di array | no | Altri vincoli UNIQUE, es. `[["Email"]]`. |

- `tipo` è testo libero (si consigliano i tipi PostgreSQL: `INTEGER`, `NUMERIC(p,s)`, `VARCHAR(n)`, `TEXT`, `DATE`, `BOOLEAN`).
- `nullable: true` viene mostrato con il simbolo ∅ (ammette NULL).
- Ogni colonna citata in chiavi e vincoli deve esistere; ogni chiave esterna
  deve puntare a una tabella e a colonne esistenti, con lo stesso numero di colonne.

## `database`

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `statements` | array di stringhe | sì | Istruzioni PostgreSQL eseguite in ordine, **una per elemento**: prima i `CREATE TABLE`, poi gli `INSERT`. Un `INSERT` può inserire più righe (`VALUES (…), (…)`). |

- Il database viene **ricreato** da questi statement ogni volta che si apre lo scenario;
  le interrogazioni girano in una transazione in sola lettura (`READ ONLY`) che viene sempre annullata.
- Durante il caricamento le chiavi esterne non vengono imposte (l'ordine degli `INSERT`
  non conta). Le righe che violano le `REFERENCES` dichiarate producono però un avviso.
- Le date si dichiarano di tipo `DATE` e si scrivono `'AAAA-MM-GG'` (es. `'2025-01-31'`).
- I nomi di tabelle e colonne vanno scritti **senza virgolette doppie**: PostgreSQL li tratta senza
  distinguere maiuscole e minuscole (`Studente`, `STUDENTE` e `studente` sono la stessa tabella),
  mentre `"Studente"` tra virgolette sarebbe un nome diverso da `studente`.
- Le soluzioni possono usare tutto l'SQL standard di PostgreSQL: confronti quantificati
  (`>= ALL (…)`, `= ANY (…)`, `SOME`), `EXISTS`, `INTERSECT`/`EXCEPT`, `FULL OUTER JOIN`,
  `EXTRACT(YEAR FROM Data)`, `CASE`, `COALESCE`. Ogni colonna del `SELECT` di una query con
  `GROUP BY` deve stare nel `GROUP BY` o in una funzione aggregata.
- Scenari scritti per la versione precedente (SQLite) di solito funzionano; se uno statement usa
  funzioni proprie di SQLite (`IFNULL`, `strftime`, …) va rigenerato.
- Uno statement che PostgreSQL non riesce a eseguire è un errore: il messaggio
  indica quale (`database.statements[7]`) e mostra l'inizio dell'istruzione.

## `esercizi[]` (almeno uno)

| Campo | Tipo | Obbl. | Descrizione |
|---|---|---|---|
| `id` | stringa | sì | Breve e unico, es. `"E1"`. |
| `titolo` | stringa | no | Titolo breve. |
| `difficolta` | intero 1–5 | sì | 1 = selezione semplice … 5 = divisione / query complesse. |
| `argomento` | stringa | no | Es. "Join", "GROUP BY e HAVING", "NOT EXISTS", "Divisione". |
| `traccia` | stringa | sì | Testo dell'esercizio. Deve dire chiaramente **quali colonne** restituire, **in che ordine** (se conta) e come trattare i casi limite (es. «anche i corsi senza esami, con 0»). |
| `soluzioni` | array di 1–3 stringhe | sì | Query ufficiali **equivalenti** (es. JOIN, sottoquery IN, EXISTS). Solo `SELECT`/`WITH`. |
| `suggerimento` | stringa | no | Mostrato a richiesta, senza rivelare la soluzione. |

All'importazione ogni soluzione viene **eseguita davvero**:
- se non è eseguibile → errore;
- se restituisce un risultato vuoto → avviso (la verifica sarebbe poco significativa);
- se una soluzione alternativa non dà lo stesso risultato della prima → avviso.

---

## Come viene verificata una risposta

L'app esegue la query dello studente e ogni soluzione ufficiale sullo stesso
database e confronta **i risultati**, non il testo:

1. stesso **numero di colonne**; i nomi delle colonne vengono ignorati e anche il loro **ordine**
   (se coincide solo a meno di una permutazione, la risposta è corretta con una nota);
2. righe confrontate come **multiinsieme**: i duplicati contano, l'ordine no;
3. l'**ordine** conta solo se la soluzione ufficiale contiene un `ORDER BY`
   al livello più esterno. Le righe a pari valore della chiave di ordinamento possono stare in
   qualunque ordine (anche se la chiave non è una colonna del risultato);
4. i **numeri** sono normalizzati (`1` = `1.0`) con una tolleranza relativa di 1e-6;
   `NULL` coincide con `NULL`; i testi si confrontano esattamente;
5. la risposta è corretta se coincide con **una stessa soluzione** sui dati dello scenario **e su 6
   database di prova**.

### Database di prova

Per ridurre le coincidenze fortuite l'app genera, a partire dai dati dello scenario, 6 varianti
riproducibili (seme fisso): righe tolte (a cascata sulle chiavi esterne, o chiave esterna messa a
NULL se facoltativa), righe duplicate con nuova chiave primaria e valori NULL. Valgono queste regole,
che dipendono da come è scritto lo scenario:

- i **NULL** vengono inseriti solo nelle colonne che il database ammette (senza `NOT NULL` né
  `PRIMARY KEY`) **e** che il modello logico dichiara `"nullable": true`: se descrivi una colonna in
  `logico` senza `nullable: true` si considera obbligatoria. Indica quindi `nullable` in modo coerente;
- le **chiavi esterne** usate sono quelle dei `REFERENCES` nei `CREATE TABLE` e quelle di
  `logico.chiaviEsterne`: dichiarale correttamente, altrimenti le righe tolte possono lasciare riferimenti
  orfani;
- vincoli `UNIQUE`, `CHECK` e `NOT NULL` vengono rispettati (le righe che li violerebbero si scartano);
- una soluzione ufficiale che dà errore su una variante fa scartare quella variante;
- le soluzioni con `LIMIT` si verificano solo sui dati originali.

Le soluzioni alternative di un esercizio devono essere equivalenti **anche sulle varianti**: all'import
un avviso segnala quelle che coincidono sui dati attuali ma non su un database di prova (es. una
divisione scritta con `COUNT` che non gestisce il divisore vuoto). Il controllo è pratico, **non una
prova formale di equivalenza**.

## ⚠️ Fragilità della verifica e casi limite obbligatori

Due query diverse possono dare lo stesso risultato **per coincidenza** sui dati
attuali. Ad esempio un `JOIN` invece di un `LEFT JOIN` è indistinguibile se ogni
corso ha almeno un esame. Per ridurre il rischio, **i dati dello scenario devono
contenere casi limite** che distinguano le query giuste da quelle quasi giuste:

- valori **NULL** nelle colonne facoltative e nelle chiavi esterne facoltative
  (fanno fallire `NOT IN` e le condizioni dimenticate);
- **duplicati** utili a scoprire un `DISTINCT` mancante (es. omonimi, più
  righe che soddisfano la condizione per la stessa entità);
- entità **senza associazioni** (righe che restano vuote in un join): uno studente
  senza esami, un corso senza iscritti, un reparto senza dipendenti;
- valori **al confine** delle condizioni (es. media esattamente 27 con `>= 27`);
- **pareggi** nei valori su cui si ordina o si calcola il massimo;
- per la divisione: qualcuno che soddisfa **tutti** i requisiti, qualcuno che ne
  soddisfa **quasi** tutti e qualcuno che non ne soddisfa nessuno.

Se usi `ORDER BY` in una soluzione, rendi l'ordinamento **totale** oppure ordina
per colonne presenti nel risultato (così i pareggi vengono gestiti).

---

## Esempio completo

Uno scenario piccolo ma completo (3 esercizi). Lo scenario d'esempio incluso
nell'app è [`scenari-esempio/universita.json`](scenari-esempio/universita.json)
(7 tabelle, 8 esercizi).

```json
{
  "version": 1,
  "metadati": {
    "titolo": "Biblioteca (mini)",
    "descrizione": "Autori, libri, utenti e prestiti. Casi limite: un autore senza libri, un libro senza autore (NULL), un utente senza prestiti, prestiti ripetuti dello stesso libro, prestiti ancora aperti (DataFine NULL).",
    "dominio": "Biblioteca",
    "autore": "Palestra SQL"
  },
  "er": {
    "entita": [
      { "nome": "AUTORE", "attributi": [ { "nome": "Id", "chiave": true }, { "nome": "Nome" }, { "nome": "Nazione", "cardinalita": "(0,1)" } ] },
      { "nome": "LIBRO", "attributi": [ { "nome": "Isbn", "chiave": true }, { "nome": "Titolo" }, { "nome": "Anno" } ] },
      { "nome": "UTENTE", "attributi": [ { "nome": "Tessera", "chiave": true }, { "nome": "Nome" } ] }
    ],
    "relazioni": [
      { "nome": "SCRITTURA", "partecipanti": [ { "entita": "LIBRO", "cardinalita": "(0,1)" }, { "entita": "AUTORE", "cardinalita": "(0,N)" } ] },
      { "nome": "PRESTITO",
        "partecipanti": [ { "entita": "UTENTE", "cardinalita": "(0,N)" }, { "entita": "LIBRO", "cardinalita": "(0,N)" } ],
        "attributi": [ { "nome": "DataInizio" }, { "nome": "DataFine", "cardinalita": "(0,1)" } ] }
    ],
    "generalizzazioni": []
  },
  "logico": {
    "tabelle": [
      { "nome": "Autore",
        "colonne": [ { "nome": "Id", "tipo": "INTEGER" }, { "nome": "Nome", "tipo": "TEXT" }, { "nome": "Nazione", "tipo": "TEXT", "nullable": true } ],
        "chiavePrimaria": ["Id"] },
      { "nome": "Libro",
        "colonne": [ { "nome": "Isbn", "tipo": "TEXT" }, { "nome": "Titolo", "tipo": "TEXT" }, { "nome": "Anno", "tipo": "INTEGER" }, { "nome": "Autore", "tipo": "INTEGER", "nullable": true } ],
        "chiavePrimaria": ["Isbn"],
        "chiaviEsterne": [ { "colonne": ["Autore"], "tabella": "Autore", "riferimenti": ["Id"] } ] },
      { "nome": "Utente",
        "colonne": [ { "nome": "Tessera", "tipo": "INTEGER" }, { "nome": "Nome", "tipo": "TEXT" } ],
        "chiavePrimaria": ["Tessera"] },
      { "nome": "Prestito",
        "colonne": [ { "nome": "Utente", "tipo": "INTEGER" }, { "nome": "Libro", "tipo": "TEXT" }, { "nome": "DataInizio", "tipo": "DATE" }, { "nome": "DataFine", "tipo": "DATE", "nullable": true } ],
        "chiavePrimaria": ["Utente", "Libro", "DataInizio"],
        "chiaviEsterne": [
          { "colonne": ["Utente"], "tabella": "Utente", "riferimenti": ["Tessera"] },
          { "colonne": ["Libro"], "tabella": "Libro", "riferimenti": ["Isbn"] }
        ] }
    ]
  },
  "database": {
    "statements": [
      "CREATE TABLE Autore (Id INTEGER PRIMARY KEY, Nome TEXT NOT NULL, Nazione TEXT);",
      "CREATE TABLE Libro (Isbn TEXT PRIMARY KEY, Titolo TEXT NOT NULL, Anno INTEGER NOT NULL, Autore INTEGER REFERENCES Autore(Id));",
      "CREATE TABLE Utente (Tessera INTEGER PRIMARY KEY, Nome TEXT NOT NULL);",
      "CREATE TABLE Prestito (Utente INTEGER NOT NULL REFERENCES Utente(Tessera), Libro TEXT NOT NULL REFERENCES Libro(Isbn), DataInizio DATE NOT NULL, DataFine DATE, PRIMARY KEY (Utente, Libro, DataInizio));",
      "INSERT INTO Autore (Id, Nome, Nazione) VALUES (1, 'Italo Calvino', 'Italia'), (2, 'Umberto Eco', 'Italia'), (3, 'George Orwell', 'Regno Unito'), (4, 'Elena Ferrante', NULL), (5, 'Primo Levi', 'Italia');",
      "INSERT INTO Libro (Isbn, Titolo, Anno, Autore) VALUES ('L1', 'Il barone rampante', 1957, 1), ('L2', 'Le città invisibili', 1972, 1), ('L3', 'Il nome della rosa', 1980, 2), ('L4', '1984', 1949, 3), ('L5', 'L''amica geniale', 2011, 4), ('L6', 'Antologia di racconti', 1990, NULL);",
      "INSERT INTO Utente (Tessera, Nome) VALUES (100, 'Anna'), (101, 'Bruno'), (102, 'Carla'), (103, 'Dario');",
      "INSERT INTO Prestito (Utente, Libro, DataInizio, DataFine) VALUES (100, 'L1', '2025-01-10', '2025-02-01'), (100, 'L1', '2025-05-03', NULL), (100, 'L3', '2025-02-15', '2025-03-01'), (101, 'L4', '2025-03-01', '2025-03-20'), (101, 'L2', '2025-04-11', NULL), (102, 'L4', '2025-01-05', '2025-01-25'), (102, 'L6', '2025-06-01', '2025-06-20');"
    ]
  },
  "esercizi": [
    {
      "id": "E1",
      "titolo": "Classici",
      "difficolta": 1,
      "argomento": "Selezione e ordinamento",
      "traccia": "Titolo e anno dei libri pubblicati prima del 1980, dal più vecchio al più recente.",
      "soluzioni": [ "SELECT Titolo, Anno FROM Libro WHERE Anno < 1980 ORDER BY Anno;" ]
    },
    {
      "id": "E2",
      "titolo": "Libri per autore",
      "difficolta": 3,
      "argomento": "GROUP BY e outer join",
      "traccia": "Per ogni autore mostra il nome e il numero di libri scritti, includendo gli autori senza libri (con 0).",
      "soluzioni": [
        "SELECT a.Nome, COUNT(l.Isbn) AS NumeroLibri FROM Autore a LEFT JOIN Libro l ON l.Autore = a.Id GROUP BY a.Id, a.Nome;",
        "SELECT a.Nome, (SELECT COUNT(*) FROM Libro l WHERE l.Autore = a.Id) FROM Autore a;"
      ],
      "suggerimento": "COUNT(*) con un LEFT JOIN conta anche la riga vuota: conta una colonna del libro."
    },
    {
      "id": "E3",
      "titolo": "Utenti fedeli a Calvino",
      "difficolta": 4,
      "argomento": "Sottoquery ed EXISTS",
      "traccia": "Nome degli utenti che hanno preso in prestito almeno un libro di Italo Calvino. Ogni utente una sola volta.",
      "soluzioni": [
        "SELECT u.Nome FROM Utente u WHERE EXISTS (SELECT * FROM Prestito p JOIN Libro l ON l.Isbn = p.Libro JOIN Autore a ON a.Id = l.Autore WHERE p.Utente = u.Tessera AND a.Nome = 'Italo Calvino');",
        "SELECT DISTINCT u.Nome FROM Utente u JOIN Prestito p ON p.Utente = u.Tessera JOIN Libro l ON l.Isbn = p.Libro JOIN Autore a ON a.Id = l.Autore WHERE a.Nome = 'Italo Calvino';"
      ]
    }
  ]
}
```

### Errori frequenti e messaggi

| Problema | Messaggio (esempio) |
|---|---|
| Manca `version` | `version: campo obbligatorio mancante: aggiungi "version": 1.` |
| Cardinalità scritta male | `er.relazioni[0].partecipanti[1].cardinalita: "(1;N)" non è una cardinalità valida: usa la forma "(min,max)"…` |
| Entità inesistente | `er.relazioni[2].partecipanti[0].entita: l'entità «CORSI» non esiste in er.entita.` |
| FK verso colonna inesistente | `logico.tabelle[3].chiaviEsterne[0].riferimenti[0]: la colonna «Cod» non esiste nella tabella «Corso».` |
| Soluzione come stringa singola | `esercizi[1].soluzioni: deve essere un array di stringhe (da 1 a 3 query)…` |
| Soluzione non SELECT | `esercizi[4].soluzioni[0]: Istruzione DELETE non consentita…` |
| SQL del database errato | `database.statements[9]: l'istruzione non viene eseguita da PostgreSQL: relation "esami" does not exist — «INSERT INTO Esami …»` |
| JSON non valido | `JSON non valido alla riga 41, colonna 7: virgola di troppo prima di «]».` |
