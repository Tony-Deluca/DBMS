import { h, apriDialogo } from './dom';

export function apriGuida(): void {
  const htmlBase = `
  <section class="sezione">
    <h3>Come si usa</h3>
    <ol>
      <li>Scegli uno scenario in alto (c'è già l'esempio «Università»), oppure importane uno nuovo da <strong>Scenari</strong>.</li>
      <li>Studia il <strong>Modello ER</strong> e il <strong>Modello logico</strong>: puoi trascinare, zoomare (pinch o rotellina) e premere <strong>⤢</strong> per adattare il diagramma allo schermo.</li>
      <li>In <strong>Dati</strong> consulti le righe reali di ogni tabella (ricerca, pagine da 100 righe; toccando una chiave esterna salti alla riga referenziata).</li>
      <li>In <strong>Esercizi</strong> scrivi la query. <strong>Esegui</strong> mostra il risultato, <strong>Verifica</strong> lo confronta con la soluzione ufficiale.
      Su schermo largo lo schema resta visibile a destra; su schermo stretto lo apri con il pulsante <strong>Schema</strong>.</li>
    </ol>
  </section>
  <section class="sezione">
    <h3>Progettazione (schemi da disegnare)</h3>
    <p>Per gli esercizi di progettazione: incolli la <strong>Traccia</strong>, disegni lo <strong>schema ER</strong>, crei la <strong>copia per la ristrutturazione</strong>
    (l'originale resta com'è), scrivi le <strong>Note</strong> sulle scelte e poi lo <strong>schema logico</strong>. L'app non traduce nulla da sola: la correzione la chiedi all'IA con <strong>Copia per l'IA</strong>.</p>
    <ul>
      <li><strong>Entità</strong>, <strong>Relazione</strong> e <strong>Attributo</strong> aggiungono elementi; si modificano nel riquadro <strong>Proprietà</strong> (nome, identificatore ●, cardinalità con un tocco, attributi composti e multivalore, identificatore esterno, ruoli).</li>
      <li><strong>Collega</strong>: tocca un'entità e poi una relazione (o due entità: la relazione si crea in mezzo; la stessa entità due volte = relazione ricorsiva). <strong>Generalizza</strong>: prima la figlia, poi il padre.</li>
      <li>Un dito su un elemento lo sposta; un dito sullo sfondo o due dita spostano la vista; pinch per lo zoom. Pressione prolungata (o clic destro) per il menu dell'elemento. <strong>⋯</strong>: duplica, selezione multipla, esporta.</li>
      <li>Schema logico: <strong>Diagramma</strong>, <strong>Notazione</strong> d'esame (chiave sottolineata, <code>*</code> = facoltativo, vincoli sotto) oppure <strong>Scrivi</strong>, dove scrivi ad esempio <code>Studente(_Matricola_, Nome, Città*)</code> e <code>Esame.Studente → Studente.Matricola</code>: se c'è un errore di sintassi il testo resta e il diagramma non cambia.</li>
      <li><strong>Controlli</strong> segnala incoerenze (identificatori mancanti, cardinalità non indicate, chiavi esterne verso colonne inesistenti…) senza correggere nulla.</li>
      <li><strong>Presentazione</strong> mostra tutto pulito su sfondo bianco per lo screenshot; <strong>Esporta</strong> (nel menu ⋯) crea PNG ad alta risoluzione o SVG.</li>
      <li>Su schermo largo scegli cosa vedere nei due pannelli affiancati; su iPad in verticale usi le schede. <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Z</kbd> annulla, con <kbd>⇧</kbd> ripete.</li>
      <li>Da <strong>Scenari → Apri in Progettazione</strong> copi ER e logico di uno scenario in un nuovo progetto (lo scenario non cambia).</li>
    </ul>
  </section>
  <section class="sezione">
    <h3>Come viene verificata la risposta</h3>
    <p>Si confrontano i <em>risultati</em>, non il testo SQL: la tua query è corretta se il risultato coincide con quello di almeno una delle soluzioni ufficiali.</p>
    <ul>
      <li>Deve avere lo stesso numero di colonne. I nomi delle colonne (alias) non contano, e nemmeno il loro ordine (se è diverso dalla traccia ricevi una nota).</li>
      <li>Le righe si confrontano come <strong>multiinsieme</strong>: i duplicati contano, l'ordine no.</li>
      <li>L'ordine conta solo se la soluzione ufficiale ha un <code>ORDER BY</code>; le righe a pari merito possono stare in qualunque ordine.</li>
      <li>I numeri decimali si confrontano con una piccola tolleranza (es. 27.666666 e 27.6666667).</li>
    </ul>
    <p>La risposta viene controllata anche su alcuni <strong>database di prova</strong>: varianti dei dati con righe tolte, righe duplicate e valori NULL.
    Se funziona sui dati attuali ma non in generale, te lo segnala senza mostrarti la soluzione.</p>
    <p class="avviso"><strong>Attenzione:</strong> non è una prova formale di equivalenza ma un controllo pratico: una query con valori scelti a mano può comunque passare.
    Confrontala sempre con le soluzioni ufficiali e chiediti se funzionerebbe con NULL, duplicati o tabelle vuote. Per questo gli scenari vanno generati con dati che contengono casi limite.</p>
  </section>
  <section class="sezione">
    <h3>Note su PostgreSQL</h3>
    <ul>
      <li>Il motore è <strong>PostgreSQL</strong> (eseguito nel browser): si scrive SQL standard. Sono permesse solo interrogazioni <code>SELECT</code> e <code>WITH</code>: il database non si può modificare e viene ricreato ad ogni apertura dello scenario.</li>
      <li>Confronti quantificati: <code>Voto &gt;= ALL (SELECT …)</code>, <code>Matricola = ANY (SELECT …)</code> (o <code>SOME</code>). Attenzione: <code>&gt; ALL</code> su una sottoquery vuota è vero, <code>= ANY</code> è falso, e un NULL nella sottoquery può rendere il confronto sconosciuto.</li>
      <li>Le stringhe vanno tra apici dritti <code>'…'</code>; le virgolette <code>"…"</code> servono per i nomi. I nomi senza virgolette non distinguono maiuscole e minuscole. La concatenazione è <code>||</code>; <code>LIKE</code> distingue le maiuscole (<code>ILIKE</code> no).</li>
      <li>Date di tipo <code>DATE</code>: <code>Data &gt;= '2024-01-01'</code>, <code>EXTRACT(YEAR FROM Data)</code>, <code>CURRENT_DATE</code>.</li>
      <li>Con <code>GROUP BY</code>, ogni colonna del <code>SELECT</code> deve stare nel <code>GROUP BY</code> o in una funzione aggregata.</li>
      <li>Supportati: JOIN (anche FULL OUTER), sottoquery, EXISTS, IN, ALL/ANY/SOME, UNION/INTERSECT/EXCEPT, CTE (WITH), funzioni finestra, <code>LIMIT</code> e <code>FETCH FIRST n ROWS ONLY</code>.</li>
      <li>La divisione tra interi è intera (<code>7/2 = 3</code>): usa <code>7.0/2</code> o <code>AVG</code> se ti serve il decimale.</li>
      <li>Una query che dura più di 8 secondi viene interrotta (es. prodotto cartesiano enorme) e il motore viene riavviato.</li>
    </ul>
  </section>
  <section class="sezione">
    <h3>Scorciatoie</h3>
    <ul>
      <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Invio</kbd>: esegui · <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>Invio</kbd>: verifica</li>
      <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Spazio</kbd>: suggerimenti di completamento (tabelle, colonne, parole chiave)</li>
      <li>Su iPad, la barra con le parole chiave compare sopra la tastiera mentre scrivi.</li>
      <li>Doppio tocco su un diagramma: adatta allo schermo.</li>
    </ul>
  </section>
  <section class="sezione">
    <h3>Dati e offline</h3>
    <p>Tutto resta nel tuo browser (IndexedDB): nessun account, nessun server. Il primo caricamento scarica anche il motore PostgreSQL (circa 8 MB, una volta sola); dopo l'app funziona anche offline.
    Su iPad aggiungila alla schermata Home (Condividi → Aggiungi alla schermata Home) ed esporta ogni tanto gli scenari e i progetti come backup.</p>
  </section>`;
  const html = import.meta.env.VITE_ARTIFACT
    ? htmlBase.replace(/<section class="sezione">\s*<h3>Dati e offline<\/h3>[\s\S]*?<\/section>/, `
  <section class="sezione">
    <h3>Dove restano i dati</h3>
    <p>Gli scenari importati, i progressi e i progetti restano nel browser di questo dispositivo: non arrivano a nessun altro.
    Su iPad Safari può cancellarli se non apri la pagina per alcune settimane: usa ogni tanto <strong>Scenari → Copia JSON</strong>
    e <strong>Progetto ▾ → Copia JSON negli appunti</strong> e salva il testo (per esempio in Note) come backup.</p>
  </section>`)
    : htmlBase;
  apriDialogo('Guida', h('div', { class: 'guida', html }), { classe: 'dialogo-grande' });
}
