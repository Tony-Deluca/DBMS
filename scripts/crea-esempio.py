# Genera scenari-esempio/universita.json (lo scenario di esempio incluso nell'app).
# Tenuto come script per poter rigenerare il file in modo leggibile. Dialetto: PostgreSQL.
import json, pathlib

def ins(tabella, colonne, righe):
    def lit(v):
        if v is None: return 'NULL'
        if isinstance(v, bool): return 'TRUE' if v else 'FALSE'
        if isinstance(v, (int, float)): return str(v)
        return "'" + str(v).replace("'", "''") + "'"
    vals = ',\n  '.join('(' + ', '.join(lit(x) for x in r) + ')' for r in righe)
    return f"INSERT INTO {tabella} ({', '.join(colonne)}) VALUES\n  {vals};"

create = [
"""CREATE TABLE Dipartimento (
  Codice TEXT PRIMARY KEY,
  Nome   TEXT NOT NULL,
  Sede   TEXT
);""",
"""CREATE TABLE Docente (
  Matricola         TEXT PRIMARY KEY,
  Nome              TEXT NOT NULL,
  Cognome           TEXT NOT NULL,
  Email             TEXT,
  Ruolo             TEXT NOT NULL CHECK (Ruolo IN ('Ordinario', 'Associato', 'Ricercatore')),
  ScadenzaContratto DATE,
  Dipartimento      TEXT REFERENCES Dipartimento(Codice)
);""",
"""CREATE TABLE CorsoDiLaurea (
  Codice       TEXT PRIMARY KEY,
  Nome         TEXT NOT NULL,
  Livello      TEXT NOT NULL CHECK (Livello IN ('Triennale', 'Magistrale')),
  Dipartimento TEXT NOT NULL REFERENCES Dipartimento(Codice)
);""",
"""CREATE TABLE Studente (
  Matricola      INTEGER PRIMARY KEY,
  Nome           TEXT NOT NULL,
  Cognome        TEXT NOT NULL,
  DataNascita    DATE NOT NULL,
  Citta          TEXT NOT NULL,
  AnnoIscrizione INTEGER NOT NULL,
  Email          TEXT,
  CorsoDiLaurea  TEXT NOT NULL REFERENCES CorsoDiLaurea(Codice)
);""",
"""CREATE TABLE Corso (
  Codice        TEXT PRIMARY KEY,
  Nome          TEXT NOT NULL,
  CFU           INTEGER NOT NULL CHECK (CFU > 0),
  Anno          INTEGER NOT NULL CHECK (Anno BETWEEN 1 AND 3),
  Docente       TEXT REFERENCES Docente(Matricola),
  CorsoDiLaurea TEXT NOT NULL REFERENCES CorsoDiLaurea(Codice)
);""",
"""CREATE TABLE Esame (
  Studente INTEGER NOT NULL REFERENCES Studente(Matricola),
  Corso    TEXT    NOT NULL REFERENCES Corso(Codice),
  Data     DATE    NOT NULL,
  Voto     INTEGER NOT NULL CHECK (Voto BETWEEN 18 AND 30),
  Lode     BOOLEAN NOT NULL DEFAULT FALSE CHECK (NOT Lode OR Voto = 30),
  PRIMARY KEY (Studente, Corso)
);""",
"""CREATE TABLE Propedeuticita (
  Corso        TEXT NOT NULL REFERENCES Corso(Codice),
  Propedeutico TEXT NOT NULL REFERENCES Corso(Codice),
  PRIMARY KEY (Corso, Propedeutico),
  CHECK (Corso <> Propedeutico)
);""",
]

dip = [('DIN', "Ingegneria dell'Informazione", 'Via Ingegneria 1'),
       ('DMA', 'Matematica', 'Via Archimede 5'),
       ('DFI', 'Fisica', 'Via Galilei 2'),
       ('DEC', 'Economia', None)]
doc = [('D01', 'Laura', 'Bianchi', 'laura.bianchi@uni.example', 'Ordinario', None, 'DIN'),
       ('D02', 'Paolo', 'Verdi', 'paolo.verdi@uni.example', 'Associato', None, 'DIN'),
       ('D03', 'Giulia', 'Esposito', None, 'Ricercatore', '2027-09-30', 'DIN'),
       ('D04', 'Marco', 'Ferrari', 'marco.ferrari@uni.example', 'Ordinario', None, 'DMA'),
       ('D05', 'Sara', 'Romano', 'sara.romano@uni.example', 'Associato', None, 'DMA'),
       ('D06', 'Luca', 'Colombo', None, 'Ricercatore', '2026-12-31', 'DMA'),
       ('D07', 'Anna', 'Ricci', 'anna.ricci@uni.example', 'Associato', None, 'DIN'),
       ('D08', 'Franco', 'Gallo', 'franco.gallo@uni.example', 'Ordinario', None, 'DEC'),
       ('D09', 'Elena', 'Bianchi', 'elena.bianchi@uni.example', 'Ricercatore', '2027-03-31', None)]
cdl = [('ING-INF', 'Ingegneria Informatica', 'Triennale', 'DIN'),
       ('ING-GES', 'Ingegneria Gestionale', 'Triennale', 'DIN'),
       ('MAT', 'Matematica', 'Triennale', 'DMA'),
       ('ING-INF-M', 'Ingegneria Informatica', 'Magistrale', 'DIN')]
stu = [(100001, 'Marco', 'Rossi', '2003-04-12', 'Bari', 2023, 'marco.rossi@studenti.uni.example', 'ING-INF'),
       (100002, 'Giulia', 'Bruno', '2003-09-03', 'Lecce', 2022, None, 'ING-INF'),
       (100003, 'Andrea', 'Conti', '2002-12-20', 'Bari', 2022, 'andrea.conti@studenti.uni.example', 'ING-INF'),
       (100004, 'Francesca', 'Greco', '2004-01-15', 'Taranto', 2023, 'francesca.greco@studenti.uni.example', 'ING-INF'),
       (100005, 'Marco', 'Rossi', '2004-07-30', 'Foggia', 2023, 'marco.rossi2@studenti.uni.example', 'ING-INF'),
       (100006, 'Chiara', 'Marino', '2004-03-08', 'Bari', 2023, None, 'ING-GES'),
       (100007, 'Luca', 'De Luca', '2003-11-11', 'Brindisi', 2022, 'luca.deluca@studenti.uni.example', 'ING-GES'),
       (100008, 'Sofia', 'Galli', '2005-02-14', 'Bari', 2024, 'sofia.galli@studenti.uni.example', 'ING-INF'),
       (100009, 'Matteo', 'Lombardi', '2002-06-01', 'Matera', 2021, None, 'MAT'),
       (100010, 'Elisa', 'Moretti', '2003-05-22', 'Bari', 2022, 'elisa.moretti@studenti.uni.example', 'MAT'),
       (100011, 'Davide', 'Barbieri', '2005-08-09', 'Lecce', 2024, 'davide.barbieri@studenti.uni.example', 'ING-GES'),
       (100012, 'Alessia', 'Fontana', '2004-10-10', 'Bari', 2023, 'alessia.fontana@studenti.uni.example', 'MAT'),
       (100013, 'Simone', 'Rizzo', '2005-01-01', 'Bari', 2024, None, 'ING-INF'),
       (100014, 'Giorgio', 'Caruso', '2001-03-03', 'Bari', 2021, 'giorgio.caruso@studenti.uni.example', 'ING-INF')]
cor = [('INF01', 'Analisi Matematica I', 9, 1, 'D04', 'ING-INF'),
       ('INF02', 'Fondamenti di Informatica', 9, 1, 'D01', 'ING-INF'),
       ('INF03', 'Geometria e Algebra', 6, 1, 'D05', 'ING-INF'),
       ('INF04', 'Basi di Dati', 9, 2, 'D01', 'ING-INF'),
       ('INF05', 'Sistemi Operativi', 9, 2, 'D02', 'ING-INF'),
       ('INF06', 'Reti di Calcolatori', 6, 3, 'D03', 'ING-INF'),
       ('INF07', 'Ingegneria del Software', 6, 3, None, 'ING-INF'),
       ('GES01', 'Analisi Matematica I', 9, 1, 'D04', 'ING-GES'),
       ('GES02', 'Economia e Organizzazione Aziendale', 6, 1, 'D08', 'ING-GES'),
       ('GES03', 'Ricerca Operativa', 9, 2, 'D09', 'ING-GES'),
       ('MAT01', 'Algebra Lineare', 12, 1, 'D05', 'MAT'),
       ('MAT02', 'Analisi Reale', 12, 1, 'D04', 'MAT'),
       ('MAG01', 'Sistemi Distribuiti', 6, 1, 'D02', 'ING-INF-M')]
esa = [(100001, 'INF01', '2024-01-20', 28, 0), (100001, 'INF02', '2024-02-10', 30, 1), (100001, 'INF03', '2024-06-15', 27, 0), (100001, 'INF04', '2025-01-25', 30, 0),
       (100002, 'INF01', '2023-02-01', 22, 0), (100002, 'INF02', '2023-06-20', 25, 0), (100002, 'INF03', '2023-09-12', 24, 0),
       (100003, 'INF01', '2023-01-30', 30, 0), (100003, 'INF02', '2023-02-15', 29, 0), (100003, 'INF04', '2024-02-05', 28, 0), (100003, 'INF05', '2024-07-01', 30, 0),
       (100004, 'INF02', '2024-02-12', 30, 0), (100004, 'INF03', '2024-07-03', 26, 0),
       (100005, 'INF01', '2024-06-28', 18, 0),
       (100006, 'GES01', '2024-01-18', 27, 0), (100006, 'GES02', '2024-02-20', 30, 1),
       (100007, 'GES01', '2023-02-10', 24, 0), (100007, 'GES02', '2023-06-14', 21, 0), (100007, 'GES03', '2024-01-22', 26, 0),
       (100008, 'INF02', '2025-02-11', 19, 0),
       (100009, 'MAT01', '2022-02-03', 30, 0), (100009, 'MAT02', '2022-06-25', 30, 1), (100009, 'INF01', '2023-01-31', 28, 0),
       (100010, 'MAT01', '2023-02-07', 25, 0), (100010, 'MAT02', '2023-07-10', 27, 0), (100010, 'GES02', '2024-02-21', 28, 0),
       (100012, 'MAT01', '2024-02-06', 30, 0),
       (100014, 'INF01', '2022-01-25', 26, 0), (100014, 'INF02', '2022-02-14', 27, 0), (100014, 'INF03', '2022-06-20', 27, 0),
       (100014, 'INF04', '2023-01-27', 27, 0), (100014, 'INF05', '2023-06-30', 28, 0), (100014, 'INF06', '2024-01-29', 30, 0)]
esa = [(a, b, c, d, bool(l)) for (a, b, c, d, l) in esa]
prop = [('INF04', 'INF02'), ('INF04', 'INF03'), ('INF05', 'INF02'), ('INF06', 'INF05'), ('MAT02', 'MAT01'), ('GES03', 'GES01')]

statements = create + [
    ins('Dipartimento', ['Codice', 'Nome', 'Sede'], dip),
    ins('Docente', ['Matricola', 'Nome', 'Cognome', 'Email', 'Ruolo', 'ScadenzaContratto', 'Dipartimento'], doc),
    ins('CorsoDiLaurea', ['Codice', 'Nome', 'Livello', 'Dipartimento'], cdl),
    ins('Studente', ['Matricola', 'Nome', 'Cognome', 'DataNascita', 'Citta', 'AnnoIscrizione', 'Email', 'CorsoDiLaurea'], stu),
    ins('Corso', ['Codice', 'Nome', 'CFU', 'Anno', 'Docente', 'CorsoDiLaurea'], cor),
    ins('Esame', ['Studente', 'Corso', 'Data', 'Voto', 'Lode'], esa),
    ins('Propedeuticita', ['Corso', 'Propedeutico'], prop),
]

def A(nome, chiave=False, card=None):
    a = {'nome': nome}
    if chiave: a['chiave'] = True
    if card: a['cardinalita'] = card
    return a

def C(nome, tipo, nullable=False):
    return {'nome': nome, 'tipo': tipo, 'nullable': nullable}

scenario = {
  'version': 1,
  'metadati': {
    'titolo': 'Università (esempio)',
    'descrizione': "Gestione di un ateneo: dipartimenti, docenti, corsi di laurea, corsi, studenti ed esami superati. "
                   "I dati contengono casi limite voluti: studenti omonimi, studenti senza esami, corsi senza titolare (NULL) e senza esami, "
                   "un dipartimento senza docenti, un docente senza dipartimento, email mancanti, due corsi con lo stesso nome.",
    'dominio': 'Università',
    'autore': 'Palestra SQL',
  },
  'er': {
    'entita': [
      {'nome': 'DIPARTIMENTO', 'attributi': [A('Codice', True), A('Nome'), A('Sede', card='(0,1)')]},
      {'nome': 'DOCENTE', 'attributi': [A('Matricola', True), A('Nome'), A('Cognome'), A('Email', card='(0,1)')]},
      {'nome': 'ORDINARIO', 'attributi': []},
      {'nome': 'ASSOCIATO', 'attributi': []},
      {'nome': 'RICERCATORE', 'attributi': [A('ScadenzaContratto')]},
      {'nome': 'CORSO_DI_LAUREA', 'attributi': [A('Codice', True), A('Nome'), A('Livello')]},
      {'nome': 'STUDENTE', 'attributi': [A('Matricola', True), A('Nome'), A('Cognome'), A('DataNascita'), A('Citta'), A('AnnoIscrizione'), A('Email', card='(0,1)')]},
      {'nome': 'CORSO', 'attributi': [A('Codice', True), A('Nome'), A('CFU'), A('Anno')]},
    ],
    'relazioni': [
      {'nome': 'AFFERENZA', 'partecipanti': [{'entita': 'DOCENTE', 'cardinalita': '(0,1)'}, {'entita': 'DIPARTIMENTO', 'cardinalita': '(0,N)'}]},
      {'nome': 'GESTIONE', 'partecipanti': [{'entita': 'CORSO_DI_LAUREA', 'cardinalita': '(1,1)'}, {'entita': 'DIPARTIMENTO', 'cardinalita': '(0,N)'}]},
      {'nome': 'ISCRIZIONE', 'partecipanti': [{'entita': 'STUDENTE', 'cardinalita': '(1,1)'}, {'entita': 'CORSO_DI_LAUREA', 'cardinalita': '(0,N)'}]},
      {'nome': 'OFFERTA', 'partecipanti': [{'entita': 'CORSO', 'cardinalita': '(1,1)'}, {'entita': 'CORSO_DI_LAUREA', 'cardinalita': '(1,N)'}]},
      {'nome': 'TITOLARITA', 'partecipanti': [{'entita': 'CORSO', 'cardinalita': '(0,1)'}, {'entita': 'DOCENTE', 'cardinalita': '(0,N)'}]},
      {'nome': 'ESAME', 'partecipanti': [{'entita': 'STUDENTE', 'cardinalita': '(0,N)'}, {'entita': 'CORSO', 'cardinalita': '(0,N)'}],
       'attributi': [A('Data'), A('Voto'), A('Lode')]},
      {'nome': 'PROPEDEUTICITA', 'partecipanti': [{'entita': 'CORSO', 'cardinalita': '(0,N)', 'ruolo': 'successivo'}, {'entita': 'CORSO', 'cardinalita': '(0,N)', 'ruolo': 'propedeutico'}]},
    ],
    'generalizzazioni': [
      {'padre': 'DOCENTE', 'figlie': ['ORDINARIO', 'ASSOCIATO', 'RICERCATORE'], 'copertura': '(t,e)'},
    ],
  },
  'logico': {
    'tabelle': [
      {'nome': 'Dipartimento', 'colonne': [C('Codice', 'TEXT'), C('Nome', 'TEXT'), C('Sede', 'TEXT', True)], 'chiavePrimaria': ['Codice']},
      {'nome': 'Docente', 'colonne': [C('Matricola', 'TEXT'), C('Nome', 'TEXT'), C('Cognome', 'TEXT'), C('Email', 'TEXT', True), C('Ruolo', 'TEXT'), C('ScadenzaContratto', 'DATE', True), C('Dipartimento', 'TEXT', True)],
       'chiavePrimaria': ['Matricola'], 'chiaviEsterne': [{'colonne': ['Dipartimento'], 'tabella': 'Dipartimento', 'riferimenti': ['Codice']}]},
      {'nome': 'CorsoDiLaurea', 'colonne': [C('Codice', 'TEXT'), C('Nome', 'TEXT'), C('Livello', 'TEXT'), C('Dipartimento', 'TEXT')],
       'chiavePrimaria': ['Codice'], 'chiaviEsterne': [{'colonne': ['Dipartimento'], 'tabella': 'Dipartimento', 'riferimenti': ['Codice']}]},
      {'nome': 'Studente', 'colonne': [C('Matricola', 'INTEGER'), C('Nome', 'TEXT'), C('Cognome', 'TEXT'), C('DataNascita', 'DATE'), C('Citta', 'TEXT'), C('AnnoIscrizione', 'INTEGER'), C('Email', 'TEXT', True), C('CorsoDiLaurea', 'TEXT')],
       'chiavePrimaria': ['Matricola'], 'chiaviEsterne': [{'colonne': ['CorsoDiLaurea'], 'tabella': 'CorsoDiLaurea', 'riferimenti': ['Codice']}]},
      {'nome': 'Corso', 'colonne': [C('Codice', 'TEXT'), C('Nome', 'TEXT'), C('CFU', 'INTEGER'), C('Anno', 'INTEGER'), C('Docente', 'TEXT', True), C('CorsoDiLaurea', 'TEXT')],
       'chiavePrimaria': ['Codice'], 'chiaviEsterne': [{'colonne': ['Docente'], 'tabella': 'Docente', 'riferimenti': ['Matricola']}, {'colonne': ['CorsoDiLaurea'], 'tabella': 'CorsoDiLaurea', 'riferimenti': ['Codice']}]},
      {'nome': 'Esame', 'colonne': [C('Studente', 'INTEGER'), C('Corso', 'TEXT'), C('Data', 'DATE'), C('Voto', 'INTEGER'), C('Lode', 'BOOLEAN')],
       'chiavePrimaria': ['Studente', 'Corso'], 'chiaviEsterne': [{'colonne': ['Studente'], 'tabella': 'Studente', 'riferimenti': ['Matricola']}, {'colonne': ['Corso'], 'tabella': 'Corso', 'riferimenti': ['Codice']}]},
      {'nome': 'Propedeuticita', 'colonne': [C('Corso', 'TEXT'), C('Propedeutico', 'TEXT')],
       'chiavePrimaria': ['Corso', 'Propedeutico'], 'chiaviEsterne': [{'colonne': ['Corso'], 'tabella': 'Corso', 'riferimenti': ['Codice']}, {'colonne': ['Propedeutico'], 'tabella': 'Corso', 'riferimenti': ['Codice']}]},
    ],
  },
  'database': {'statements': statements},
  'esercizi': [
    {'id': 'E1', 'titolo': 'Immatricolati recenti', 'difficolta': 1, 'argomento': 'Selezione e ordinamento',
     'traccia': "Elenca matricola, cognome e nome degli studenti immatricolati dal 2023 in poi (AnnoIscrizione ≥ 2023), in ordine alfabetico di cognome e, a parità di cognome, di nome.",
     'soluzioni': ["SELECT Matricola, Cognome, Nome\nFROM Studente\nWHERE AnnoIscrizione >= 2023\nORDER BY Cognome, Nome;"],
     'suggerimento': "Un ORDER BY può avere più criteri separati da virgola."},
    {'id': 'E2', 'titolo': 'Corsi e titolari', 'difficolta': 2, 'argomento': 'Join',
     'traccia': "Per ogni corso del corso di laurea «Ingegneria Informatica» di livello Triennale, mostra il nome del corso e il cognome e il nome del docente titolare. I corsi senza titolare non vanno mostrati.",
     'soluzioni': [
       "SELECT c.Nome, d.Cognome, d.Nome\nFROM Corso c\n  JOIN Docente d ON d.Matricola = c.Docente\n  JOIN CorsoDiLaurea l ON l.Codice = c.CorsoDiLaurea\nWHERE l.Nome = 'Ingegneria Informatica' AND l.Livello = 'Triennale';",
       "SELECT c.Nome, d.Cognome, d.Nome\nFROM Corso c, Docente d, CorsoDiLaurea l\nWHERE d.Matricola = c.Docente\n  AND l.Codice = c.CorsoDiLaurea\n  AND l.Nome = 'Ingegneria Informatica'\n  AND l.Livello = 'Triennale';"],
     'suggerimento': "Esistono due corsi di laurea che si chiamano «Ingegneria Informatica»: serve anche il livello."},
    {'id': 'E3', 'titolo': 'Trenta al primo anno', 'difficolta': 2, 'argomento': 'Join e DISTINCT',
     'traccia': "Trova matricola, cognome e nome degli studenti che hanno preso almeno un 30 (con o senza lode) in un esame di un corso del primo anno. Ogni studente deve comparire una sola volta.",
     'soluzioni': [
       "SELECT DISTINCT s.Matricola, s.Cognome, s.Nome\nFROM Studente s\n  JOIN Esame e ON e.Studente = s.Matricola\n  JOIN Corso c ON c.Codice = e.Corso\nWHERE e.Voto = 30 AND c.Anno = 1;",
       "SELECT s.Matricola, s.Cognome, s.Nome\nFROM Studente s\nWHERE s.Matricola IN (\n  SELECT e.Studente\n  FROM Esame e JOIN Corso c ON c.Codice = e.Corso\n  WHERE e.Voto = 30 AND c.Anno = 1\n);",
       "SELECT s.Matricola, s.Cognome, s.Nome\nFROM Studente s\nWHERE s.Matricola = ANY (\n  SELECT e.Studente\n  FROM Esame e JOIN Corso c ON c.Codice = e.Corso\n  WHERE e.Voto = 30 AND c.Anno = 1\n);"],
     'suggerimento': "Uno studente può avere più di un 30: come eviti i duplicati? Attenzione anche agli studenti omonimi."},
    {'id': 'E4', 'titolo': 'Statistiche per corso', 'difficolta': 3, 'argomento': 'GROUP BY e outer join',
     'traccia': "Per ogni corso mostra codice, nome, numero di esami superati e voto medio. Devono comparire anche i corsi senza esami, con 0 esami e voto medio NULL.",
     'soluzioni': [
       "SELECT c.Codice, c.Nome, COUNT(e.Voto) AS NumeroEsami, AVG(e.Voto) AS VotoMedio\nFROM Corso c\n  LEFT JOIN Esame e ON e.Corso = c.Codice\nGROUP BY c.Codice, c.Nome;",
       "SELECT c.Codice, c.Nome,\n  (SELECT COUNT(*) FROM Esame e WHERE e.Corso = c.Codice) AS NumeroEsami,\n  (SELECT AVG(e.Voto) FROM Esame e WHERE e.Corso = c.Codice) AS VotoMedio\nFROM Corso c;"],
     'suggerimento': "Con un LEFT JOIN, COUNT(*) conta anche la riga «vuota» del corso senza esami: cosa conviene contare?"},
    {'id': 'E5', 'titolo': 'Studenti brillanti', 'difficolta': 3, 'argomento': 'GROUP BY e HAVING',
     'traccia': "Elenca matricola, cognome, numero di esami superati e media dei voti degli studenti che hanno superato almeno 3 esami con media maggiore o uguale a 27. Ordina per media decrescente.",
     'soluzioni': [
       "SELECT s.Matricola, s.Cognome, COUNT(*) AS NumeroEsami, AVG(e.Voto) AS Media\nFROM Studente s\n  JOIN Esame e ON e.Studente = s.Matricola\nGROUP BY s.Matricola, s.Cognome\nHAVING COUNT(*) >= 3 AND AVG(e.Voto) >= 27\nORDER BY Media DESC;"],
     'suggerimento': "Le condizioni sui gruppi (conteggi, medie) vanno in HAVING, non in WHERE."},
    {'id': 'E6', 'titolo': 'Corsi pesanti', 'difficolta': 3, 'argomento': 'Sottoquery',
     'traccia': "Trova matricola, cognome e nome dei docenti titolari di almeno un corso che vale più CFU della media dei CFU di tutti i corsi.",
     'soluzioni': [
       "SELECT d.Matricola, d.Cognome, d.Nome\nFROM Docente d\nWHERE d.Matricola IN (\n  SELECT c.Docente FROM Corso c\n  WHERE c.CFU > (SELECT AVG(CFU) FROM Corso)\n);",
       "SELECT DISTINCT d.Matricola, d.Cognome, d.Nome\nFROM Docente d JOIN Corso c ON c.Docente = d.Matricola\nWHERE c.CFU > (SELECT AVG(CFU) FROM Corso);",
       "SELECT d.Matricola, d.Cognome, d.Nome\nFROM Docente d\nWHERE EXISTS (\n  SELECT * FROM Corso c\n  WHERE c.Docente = d.Matricola\n    AND c.CFU > (SELECT AVG(CFU) FROM Corso)\n);"],
     'suggerimento': "La media dei CFU si calcola con una sottoquery scalare: (SELECT AVG(CFU) FROM Corso)."},
    {'id': 'E7', 'titolo': 'Docenti senza corsi', 'difficolta': 4, 'argomento': 'NOT EXISTS e valori NULL',
     'traccia': "Trova matricola, cognome e nome dei docenti che non sono titolari di nessun corso.",
     'soluzioni': [
       "SELECT d.Matricola, d.Cognome, d.Nome\nFROM Docente d\nWHERE NOT EXISTS (\n  SELECT * FROM Corso c WHERE c.Docente = d.Matricola\n);",
       "SELECT d.Matricola, d.Cognome, d.Nome\nFROM Docente d\nWHERE d.Matricola NOT IN (\n  SELECT c.Docente FROM Corso c WHERE c.Docente IS NOT NULL\n);",
       "SELECT d.Matricola, d.Cognome, d.Nome\nFROM Docente d\n  LEFT JOIN Corso c ON c.Docente = d.Matricola\nWHERE c.Codice IS NULL;"],
     'suggerimento': "Se usi NOT IN, ricorda che un corso ha Docente NULL: x NOT IN (…, NULL) non è mai vero."},
    {'id': 'E8', 'titolo': 'Primo anno completato', 'difficolta': 5, 'argomento': 'Divisione',
     'traccia': "Trova matricola, cognome e nome degli studenti che hanno superato TUTTI i corsi del primo anno del proprio corso di laurea.",
     'soluzioni': [
       "SELECT s.Matricola, s.Cognome, s.Nome\nFROM Studente s\nWHERE NOT EXISTS (\n  SELECT * FROM Corso c\n  WHERE c.CorsoDiLaurea = s.CorsoDiLaurea AND c.Anno = 1\n    AND NOT EXISTS (\n      SELECT * FROM Esame e\n      WHERE e.Studente = s.Matricola AND e.Corso = c.Codice\n    )\n);",
       "SELECT s.Matricola, s.Cognome, s.Nome\nFROM Studente s\nWHERE (\n  SELECT COUNT(*) FROM Corso c\n  WHERE c.CorsoDiLaurea = s.CorsoDiLaurea AND c.Anno = 1\n) = (\n  SELECT COUNT(*) FROM Esame e JOIN Corso c ON c.Codice = e.Corso\n  WHERE e.Studente = s.Matricola AND c.CorsoDiLaurea = s.CorsoDiLaurea AND c.Anno = 1\n);"],
     'suggerimento': "Divisione: «non esiste un corso del primo anno del suo CdL che lo studente non abbia superato». In alternativa confronta due conteggi."},
    {'id': 'E9', 'titolo': 'La media più alta', 'difficolta': 5, 'argomento': 'Confronti quantificati (ALL)',
     'traccia': "Trova matricola, cognome e media dei voti dello studente (o degli studenti, a pari merito) con la media più alta. Considera solo gli studenti che hanno superato almeno un esame.",
     'soluzioni': [
       "SELECT s.Matricola, s.Cognome, AVG(e.Voto) AS Media\nFROM Studente s\n  JOIN Esame e ON e.Studente = s.Matricola\nGROUP BY s.Matricola, s.Cognome\nHAVING AVG(e.Voto) >= ALL (\n  SELECT AVG(Voto) FROM Esame GROUP BY Studente\n);",
       "SELECT s.Matricola, s.Cognome, AVG(e.Voto) AS Media\nFROM Studente s\n  JOIN Esame e ON e.Studente = s.Matricola\nGROUP BY s.Matricola, s.Cognome\nHAVING AVG(e.Voto) = (\n  SELECT MAX(m.Media)\n  FROM (SELECT AVG(Voto) AS Media FROM Esame GROUP BY Studente) m\n);"],
     'suggerimento': "Il massimo di una media: confronta la media di ogni studente con TUTTE le medie (>= ALL), oppure con la massima ottenuta da una sottoquery nel FROM."},
    {'id': 'E10', 'titolo': 'Più CFU di tutti', 'difficolta': 5, 'argomento': 'Confronti quantificati e insiemi vuoti',
     'traccia': "Trova codice, nome e CFU dei corsi che valgono più CFU di ciascuno dei corsi del secondo anno. Se non ci fossero corsi del secondo anno, la condizione sarebbe vera per tutti i corsi.",
     'soluzioni': [
       "SELECT c.Codice, c.Nome, c.CFU\nFROM Corso c\nWHERE c.CFU > ALL (\n  SELECT CFU FROM Corso WHERE Anno = 2\n);",
       "SELECT c.Codice, c.Nome, c.CFU\nFROM Corso c\nWHERE NOT EXISTS (\n  SELECT * FROM Corso c2\n  WHERE c2.Anno = 2 AND c2.CFU >= c.CFU\n);"],
     'suggerimento': "x > ALL (sottoquery) è vero quando la sottoquery è vuota; x > (SELECT MAX(…)) invece no, perché il massimo di un insieme vuoto è NULL."},
  ],
}

out = pathlib.Path(__file__).resolve().parent.parent / 'scenari-esempio' / 'universita.json'
out.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('scritto', out)
