# Prompt per generare nuovi scenari

Copia il prompt qui sotto e incollalo in una chat con Claude. Puoi farlo anche
dall'app: **Scenari → «Copia il prompt per generare scenari»**.
Compila (o lascia a Claude) le tre righe tra parentesi quadre all'inizio.
Claude risponderà con **un unico blocco di codice JSON**: toccalo per copiarlo
e incollalo in **Scenari → Importa** nell'app.

Se l'app segnala errori o avvisi all'import, incollali nella stessa chat
chiedendo di correggere lo scenario.

````text
Sei un docente di Basi di Dati di un corso di Ingegneria Informatica italiano. Devi creare uno SCENARIO di esercitazione sulle query SQL, in formato JSON, per un'app che lo importa automaticamente.

PARAMETRI (se una riga è vuota o dice «scegli tu», decidi tu in modo vario e originale):
- Dominio: [scegli tu — evita università e biblioteca; es. compagnia aerea, ospedale, campionato sportivo, e-commerce, cinema, officina, festival musicale…]
- Difficoltà complessiva: [mista — da 1 a 5]
- Numero di esercizi: [8]

COSA DEVI PRODURRE
1. Un modello ER (notazione Atzeni–Ceri) con 5–8 entità, almeno una relazione molti-a-molti con attributi, almeno una cardinalità (0,1) o (0,N), possibilmente una generalizzazione o una relazione ricorsiva.
2. Il modello logico ottenuto dalla ristrutturazione e traduzione dell'ER (5–10 tabelle), coerente con l'ER.
3. Gli statement SQLite che creano le tabelle (con PRIMARY KEY, REFERENCES, NOT NULL, CHECK dove sensato) e le popolano con dati realistici: in totale circa 60–200 righe, almeno 8–15 righe nelle tabelle principali.
4. Gli esercizi, in ordine di difficoltà crescente, che coprano: selezione con ordinamento, join su 2–3 tabelle, DISTINCT, GROUP BY con funzioni aggregate, HAVING, outer join con conteggio a zero, sottoquery (scalare, IN, correlata), NOT EXISTS / anti-join, divisione (doppio NOT EXISTS oppure confronto di conteggi). Per ogni esercizio da 1 a 3 soluzioni EQUIVALENTI scritte in modi diversi (es. JOIN vs IN vs EXISTS).

CASI LIMITE OBBLIGATORI NEI DATI (servono perché l'app verifica le risposte confrontando i RISULTATI delle query: dati troppo "puliti" farebbero passare anche query sbagliate)
- valori NULL in colonne facoltative e in almeno una chiave esterna facoltativa (così NOT IN con NULL e i join dimenticati danno risultati diversi);
- duplicati che rendono necessario DISTINCT (es. omonimi, più righe collegate alla stessa entità);
- righe senza associazioni: entità che non compaiono in un join (es. un cliente senza ordini, un prodotto mai venduto), così INNER JOIN e LEFT JOIN differiscono;
- almeno una tabella o un gruppo che resta vuoto in un join;
- valori esattamente al confine delle condizioni usate negli esercizi (es. media esattamente uguale alla soglia);
- pareggi nei valori usati per ordinamenti o massimi;
- per la divisione: chi soddisfa tutti i requisiti, chi ne soddisfa quasi tutti, chi nessuno.
Descrivi brevemente i casi limite presenti nel campo metadati.descrizione.

REGOLE PER GLI ESERCIZI
- La traccia deve dire con precisione quali colonne restituire e in che ordine (le colonne si confrontano per posizione; i nomi/alias non contano), e come trattare i casi limite (es. «includi anche i reparti senza dipendenti, con 0»).
- Usa ORDER BY nelle soluzioni solo se la traccia chiede un ordinamento; in quel caso ordina per colonne presenti nel risultato oppure rendi l'ordinamento totale (nessun pareggio ambiguo).
- Le soluzioni devono essere solo SELECT o WITH, compatibili con SQLite 3 (stringhe con apici '…', date come testo 'AAAA-MM-GG', niente TOP: usa LIMIT, la divisione tra interi è intera).
- Il campo "suggerimento" aiuta senza rivelare la soluzione.

VERIFICA PRIMA DI RISPONDERE
- Se puoi eseguire codice, crea davvero il database in SQLite ed esegui ogni soluzione. Altrimenti traccia a mano l'esecuzione sui dati.
- Ogni soluzione deve restituire un risultato NON vuoto e coerente con la traccia.
- Le soluzioni alternative dello stesso esercizio devono dare esattamente lo stesso risultato (stesso multiinsieme di righe).
- Per almeno 3 esercizi, controlla che una tipica soluzione sbagliata (JOIN invece di LEFT JOIN, NOT IN con NULL, DISTINCT dimenticato, condizione in WHERE invece che in HAVING) dia un risultato DIVERSO grazie ai casi limite. Se non è così, modifica i dati.
- Ogni INSERT deve rispettare le chiavi primarie, i CHECK e le chiavi esterne dichiarate.

FORMATO JSON (versione 1) — rispetta esattamente nomi e tipi dei campi:
{
  "version": 1,
  "metadati": {
    "titolo": "stringa",
    "descrizione": "stringa: dominio e casi limite presenti",
    "dominio": "stringa",
    "autore": "Claude"
  },
  "er": {
    "entita": [
      { "nome": "CLIENTE",
        "attributi": [
          { "nome": "Codice", "chiave": true },
          { "nome": "Nome" },
          { "nome": "Telefono", "cardinalita": "(0,1)" }
        ] }
    ],
    "relazioni": [
      { "nome": "ORDINE",
        "partecipanti": [
          { "entita": "CLIENTE", "cardinalita": "(0,N)" },
          { "entita": "PRODOTTO", "cardinalita": "(0,N)" }
        ],
        "attributi": [ { "nome": "Data" }, { "nome": "Quantita" } ] },
      { "nome": "SUPERVISIONE",
        "partecipanti": [
          { "entita": "DIPENDENTE", "cardinalita": "(0,N)", "ruolo": "capo" },
          { "entita": "DIPENDENTE", "cardinalita": "(0,1)", "ruolo": "sottoposto" }
        ] }
    ],
    "generalizzazioni": [
      { "padre": "DIPENDENTE", "figlie": ["TECNICO", "IMPIEGATO"], "copertura": "(t,e)" }
    ]
  },
  "logico": {
    "tabelle": [
      { "nome": "Cliente",
        "colonne": [
          { "nome": "Codice", "tipo": "INTEGER" },
          { "nome": "Nome", "tipo": "TEXT" },
          { "nome": "Telefono", "tipo": "TEXT", "nullable": true }
        ],
        "chiavePrimaria": ["Codice"],
        "chiaviEsterne": [],
        "unici": [] },
      { "nome": "Ordine",
        "colonne": [ … ],
        "chiavePrimaria": ["Cliente", "Prodotto", "Data"],
        "chiaviEsterne": [
          { "colonne": ["Cliente"], "tabella": "Cliente", "riferimenti": ["Codice"] }
        ] }
    ]
  },
  "database": {
    "statements": [
      "CREATE TABLE Cliente (Codice INTEGER PRIMARY KEY, Nome TEXT NOT NULL, Telefono TEXT);",
      "INSERT INTO Cliente (Codice, Nome, Telefono) VALUES (1, 'Rossi', NULL), (2, 'Bianchi', '333…');"
    ]
  },
  "esercizi": [
    { "id": "E1",
      "titolo": "stringa breve",
      "difficolta": 1,
      "argomento": "Selezione e ordinamento",
      "traccia": "stringa: cosa restituire, quali colonne e in che ordine",
      "soluzioni": [ "SELECT …;", "SELECT … (forma alternativa equivalente);" ],
      "suggerimento": "stringa facoltativa" }
  ]
}

Vincoli del formato:
- "version" è il numero 1. Tutti i nomi dei campi sono senza accenti: entita, cardinalita, difficolta.
- Entità: "nome" unico (anche rispetto alle relazioni), "attributi" è un array di OGGETTI (può essere vuoto per le entità figlie). Ogni entità non figlia ha almeno un attributo con "chiave": true (più attributi con chiave = identificatore composto). Per le entità deboli puoi aggiungere "identificatoreEsterno": ["NOME_RELAZIONE"].
- Cardinalità sempre come stringa "(min,max)": "(0,1)", "(1,1)", "(0,N)", "(1,N)". Copertura delle generalizzazioni: "(t,e)", "(t,s)", "(p,e)" o "(p,s)".
- Relazioni: almeno 2 partecipanti; nelle relazioni ricorsive indica "ruolo" per ciascuno.
- Logico: ogni tabella ha "nome", "colonne" (oggetti con "nome", "tipo" e facoltativamente "nullable": true), "chiavePrimaria" (array), "chiaviEsterne" (array di oggetti con "colonne", "tabella", "riferimenti" della stessa lunghezza). I nomi delle tabelle devono coincidere con quelli dei CREATE TABLE.
- "database.statements" è un ARRAY di stringhe, una istruzione per elemento: prima tutti i CREATE TABLE, poi gli INSERT (un INSERT può inserire più righe).
- "esercizi": "id" unico (stringa), "difficolta" intero da 1 a 5, "soluzioni" è SEMPRE un array di 1–3 stringhe.
- Nelle stringhe JSON usa \n per andare a capo e raddoppia l'apice nelle stringhe SQL (es. 'L''Aquila').

RISPOSTA
Rispondi SOLO con il JSON completo e valido, in un UNICO blocco di codice ```json … ```, senza testo prima o dopo, senza commenti dentro il JSON e senza puntini di sospensione: ogni parte deve essere scritta per intero.
````

## Consigli

- Per cambiare argomento basta modificare la riga **Dominio** (es. «ospedale»,
  «campionato di calcio», «agenzia di viaggi»).
- Per un ripasso mirato, sostituisci la riga 4 di «COSA DEVI PRODURRE» con ciò
  che vuoi allenare (es. «solo esercizi su NOT EXISTS e divisione»).
- Se lo scenario generato è troppo lungo per una sola risposta, chiedi
  «riduci i dati a circa 80 righe totali mantenendo i casi limite».
- **Ricorda la fragilità della verifica**: un «Corretto» significa che la tua query
  dà lo stesso risultato della soluzione *su questi dati*. I casi limite
  servono proprio a rendere improbabili le coincidenze.
