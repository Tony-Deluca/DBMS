# Prompt per generare nuovi scenari

Copia il prompt qui sotto e incollalo in una chat con Claude. Puoi farlo anche
dall'app: **Scenari → «Copia il prompt per generare scenari»**.
Compila (o lascia a Claude) le tre righe tra parentesi quadre all'inizio.
Claude risponderà con **un unico blocco di codice JSON**: toccalo per copiarlo
e incollalo in **Scenari → Importa** nell'app.

Se l'app segnala errori o avvisi all'import, incollali nella stessa chat
chiedendo di correggere lo scenario.

````text
Sei un docente di Basi di Dati di un corso di Ingegneria Informatica italiano. Devi creare uno SCENARIO di esercitazione sulle query SQL, in formato JSON, per un'app che lo importa automaticamente. Lo scenario deve assomigliare a una prova d'esame: schema piccolo e semplice, query di difficoltà da facile a media.

PARAMETRI (se una riga è vuota o dice «scegli tu», decidi tu):
- Dominio: [scegli tu tra: studenti-corsi-esami con voti; hotel con clienti, prenotazioni e tipi di camera; azienda con sedi, dipendenti e ruoli; oppure un altro dominio altrettanto semplice (palestra, officina, cinema, noleggio auto…)]
- Difficoltà: [da 1 a 3, al massimo un esercizio di livello 4]
- Numero di esercizi: [8]

COSA DEVI PRODURRE
1. Un modello ER (notazione Atzeni–Ceri) con 4–6 entità e almeno una relazione molti-a-molti con attributi (es. un esame con voto e data, una prenotazione con date). Almeno una cardinalità (0,1) o (0,N). Niente generalizzazioni né relazioni ricorsive, salvo che il dominio le renda davvero naturali.
2. Il modello logico (4–6 tabelle), coerente con l'ER, con chiavi primarie anche composte come nelle prove d'esame (es. Insegnamento(CF, Codice, AA, Semestre)).
3. Gli statement PostgreSQL che creano le tabelle e le popolano. Tipi: INTEGER, NUMERIC(p,s), VARCHAR(n) o TEXT, DATE, BOOLEAN; vincoli PRIMARY KEY, REFERENCES, NOT NULL e CHECK dove sensato. Nomi di tabelle e colonne SENZA virgolette doppie, senza spazi né accenti (in PostgreSQL un nome tra virgolette distingue le maiuscole). Dati realistici e PICCOLI: in totale circa 40–90 righe, 6–12 righe nelle tabelle principali. Pochi dati, ma scelti con cura, perché devi poter verificare a mano ogni risultato.
4. Gli esercizi, in ordine di difficoltà crescente. Usa questi schemi tipici di una prova d'esame, scegliendone 8 diversi (ognuno applicato al dominio scelto):
   a. selezione semplice con condizione e ordinamento;
   b. join su 2–3 tabelle con una condizione (es. «studenti che hanno preso 30»);
   c. «almeno N» con GROUP BY e HAVING (es. «almeno 4 esami», «più di 5 esami con voto maggiore di 27»);
   d. «mai / sempre» su una condizione (es. «non hanno mai preso meno di 27», «esami per cui non è mai stato assegnato un 18», «docenti che hanno sempre insegnato nel primo semestre»): risolvibile con NOT EXISTS, NOT IN o MIN/MAX in HAVING;
   e. massimo o minimo calcolato su un aggregato (es. «esame con la media più alta», «studente con lo scarto minimo tra voto massimo e minimo»): una soluzione con il confronto quantificato >= ALL / <= ALL, ad es. HAVING AVG(Voto) >= ALL (SELECT AVG(Voto) FROM Esame GROUP BY Studente), e una alternativa con MAX/MIN su una sottoquery nel FROM;
   f. conteggio a zero o anti-join (outer join con 0, NOT EXISTS);
   g. «tutti» / divisione (es. «sedi in cui sono presenti tutti i ruoli», «clienti che hanno prenotato tutti i tipi di camera», «studenti che hanno sostenuto tutti gli insegnamenti di un anno»): doppio NOT EXISTS oppure confronto di conteggi.
   Per ogni esercizio da 1 a 3 soluzioni EQUIVALENTI scritte in modi diversi (es. JOIN vs IN vs EXISTS vs = ANY; NOT EXISTS vs <> ALL solo se la colonna non ammette NULL). Scrivi solo query semplici e leggibili, come le scriverebbe uno studente preparato: niente funzioni di finestra, niente CTE ricorsive.

STILE DELLE TRACCE
La traccia è una frase breve e naturale come in una prova d'esame, ad esempio:
- «Trovare nome e cognome degli studenti che non hanno mai preso meno di 27.»
- «Trovare gli esami per i quali non è mai stato assegnato un 18.»
- «Trovare le sedi in cui sono presenti tutti i ruoli.»
Dopo la frase aggiungi sempre una riga «Restituire: …» con le colonne e il loro ordine (le colonne si confrontano per posizione; i nomi/alias non contano). Quando la frase contiene «sempre», «mai», «tutti» o «nessuno», precisa come trattare chi non ha alcuna riga collegata (es. «considerare solo docenti con almeno un insegnamento»): senza questa precisazione le soluzioni non sarebbero equivalenti. Se un esercizio chiede un massimo/minimo, precisa che a pari merito vanno restituite tutte le righe.

CASI LIMITE OBBLIGATORI NEI DATI (l'app verifica le risposte confrontando i RISULTATI su più varianti dei dati: dati troppo «puliti» farebbero passare anche query sbagliate)
- valori NULL in almeno una colonna facoltativa (e, se naturale, in una chiave esterna facoltativa);
- almeno un duplicato che rende necessario DISTINCT (es. omonimi, stesso studente con più esami);
- righe senza associazioni (uno studente senza esami, un cliente senza prenotazioni, un ruolo senza dipendenti), così INNER JOIN e LEFT JOIN differiscono;
- valori esattamente al confine delle condizioni (es. un voto 27 con condizione «meno di 27» o «almeno 27», un conteggio esattamente uguale a N);
- pareggi sui valori usati per massimi, minimi o medie;
- per «tutti»: chi soddisfa tutti i requisiti, chi ne soddisfa quasi tutti, chi nessuno.
Descrivi brevemente i casi limite presenti nel campo metadati.descrizione.

REGOLE PER GLI ESERCIZI
- Usa ORDER BY nelle soluzioni solo se la traccia chiede un ordinamento; in quel caso rendi l'ordinamento totale (nessun pareggio ambiguo). Evita LIMIT.
- Le soluzioni devono essere solo SELECT o WITH in SQL standard eseguibile da PostgreSQL: stringhe con apici '…' (le virgolette doppie sono per i nomi), date di tipo DATE confrontate con '2024-01-31' o DATE '2024-01-31', EXTRACT(YEAR FROM Data) per l'anno, la divisione tra interi è intera (usa 1.0 * a / b se serve il decimale). Sono ammessi ALL, ANY/SOME, EXISTS, IN, INTERSECT/EXCEPT e FULL OUTER JOIN. Ogni colonna nel SELECT di una query con GROUP BY deve stare nel GROUP BY o in una funzione aggregata (in PostgreSQL è un errore). Non usare funzioni proprie di SQLite o MySQL (IFNULL, strftime, DATE_FORMAT, LIMIT a, b).
- Il campo "suggerimento" aiuta senza rivelare la soluzione.

VERIFICA PRIMA DI RISPONDERE
- Se puoi eseguire codice, crea davvero il database in PostgreSQL (o, se non puoi, in un motore SQL standard tenendo conto delle differenze) ed esegui ogni soluzione. Altrimenti traccia a mano l'esecuzione sui dati, riga per riga.
- Ogni soluzione deve restituire un risultato NON vuoto e coerente con la traccia.
- Le soluzioni alternative dello stesso esercizio devono dare esattamente lo stesso risultato (stesso multiinsieme di righe) e devono restare equivalenti anche se nel database mancano righe, ci sono duplicati o NULL nelle colonne facoltative, o una tabella è vuota (l'app controlla anche su varianti dei dati). Esempio da evitare: una divisione con GROUP BY ... HAVING COUNT(*) = (SELECT COUNT(*) ...) non equivale al doppio NOT EXISTS quando il divisore è vuoto; in quel caso restringi la traccia o scegli soluzioni davvero equivalenti.
- Per almeno 3 esercizi, controlla che una tipica soluzione sbagliata (JOIN invece di LEFT JOIN, NOT IN con NULL, DISTINCT dimenticato, condizione in WHERE invece che in HAVING, «mai» scritto come «almeno una volta diverso») dia un risultato DIVERSO grazie ai dati. Se non è così, modifica i dati.
- Ogni INSERT deve rispettare chiavi primarie, chiavi esterne e CHECK dichiarati.

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
          { "nome": "Nome", "tipo": "VARCHAR(50)" },
          { "nome": "Telefono", "tipo": "VARCHAR(20)", "nullable": true },
          { "nome": "DataIscrizione", "tipo": "DATE" },
          { "nome": "Attivo", "tipo": "BOOLEAN" }
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
      "CREATE TABLE Cliente (Codice INTEGER PRIMARY KEY, Nome VARCHAR(50) NOT NULL, Telefono VARCHAR(20), DataIscrizione DATE NOT NULL, Attivo BOOLEAN NOT NULL DEFAULT TRUE);",
      "INSERT INTO Cliente (Codice, Nome, Telefono, DataIscrizione, Attivo) VALUES (1, 'Rossi', NULL, '2024-03-01', TRUE), (2, 'Bianchi', '333…', '2023-11-15', FALSE);"
    ]
  },
  "esercizi": [
    { "id": "E1",
      "titolo": "stringa breve",
      "difficolta": 1,
      "argomento": "Selezione e ordinamento",
      "traccia": "stringa: frase d'esame + riga «Restituire: …»",
      "soluzioni": [ "SELECT …;", "SELECT … (forma alternativa equivalente);" ],
      "suggerimento": "stringa facoltativa" }
  ]
}

Vincoli del formato:
- "version" è il numero 1. Tutti i nomi dei campi sono senza accenti: entita, cardinalita, difficolta.
- Entità: "nome" unico (anche rispetto alle relazioni), "attributi" è un array di OGGETTI (può essere vuoto per le entità figlie). Ogni entità non figlia ha almeno un attributo con "chiave": true (più attributi con chiave = identificatore composto). Per le entità deboli puoi aggiungere "identificatoreEsterno": ["NOME_RELAZIONE"].
- Cardinalità sempre come stringa "(min,max)": "(0,1)", "(1,1)", "(0,N)", "(1,N)". Copertura delle generalizzazioni: "(t,e)", "(t,s)", "(p,e)" o "(p,s)". Se non usi generalizzazioni, ometti il campo "generalizzazioni" o lascia l'array vuoto.
- Relazioni: almeno 2 partecipanti; nelle relazioni ricorsive indica "ruolo" per ciascuno.
- Logico: ogni tabella ha "nome", "colonne" (oggetti con "nome", "tipo" e "nullable": true SOLO per le colonne facoltative, coerente con l'assenza di NOT NULL nei CREATE TABLE), "chiavePrimaria" (array), "chiaviEsterne" (array di oggetti con "colonne", "tabella", "riferimenti" della stessa lunghezza). I nomi delle tabelle devono coincidere con quelli dei CREATE TABLE.
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
- **Ricorda i limiti della verifica**: un «Corretto» significa che la tua query
  dà lo stesso risultato della soluzione sui dati dello scenario e su alcune varianti. I casi limite
  servono proprio a rendere improbabili le coincidenze.
