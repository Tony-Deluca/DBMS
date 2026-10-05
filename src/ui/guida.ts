import { h, apriDialogo } from './dom';

export function apriGuida(): void {
  const html = `
  <section class="sezione">
    <h3>Come si usa</h3>
    <ol>
      <li>Scegli uno scenario in alto (c'è già l'esempio «Università»), oppure importane uno nuovo da <strong>Scenari</strong>.</li>
      <li>Studia il <strong>Modello ER</strong> e il <strong>Modello logico</strong>: puoi trascinare, zoomare (pinch o rotellina) e premere <strong>⤢</strong> per adattare il diagramma allo schermo.</li>
      <li>In <strong>Esercizi</strong> scrivi la query. <strong>Esegui</strong> mostra il risultato, <strong>Verifica</strong> lo confronta con la soluzione ufficiale.
      Su schermo largo lo schema resta visibile a destra; su schermo stretto lo apri con il pulsante <strong>Schema</strong>.</li>
    </ol>
  </section>
  <section class="sezione">
    <h3>Come viene verificata la risposta</h3>
    <p>Si confrontano i <em>risultati</em>, non il testo SQL: la tua query è corretta se il risultato coincide con quello di almeno una delle soluzioni ufficiali.</p>
    <ul>
      <li>Deve avere lo stesso numero di colonne. I nomi delle colonne (alias) non contano.</li>
      <li>Le righe si confrontano come <strong>multiinsieme</strong>: i duplicati contano, l'ordine no.</li>
      <li>L'ordine conta solo se la soluzione ufficiale ha un <code>ORDER BY</code>; le righe a pari merito possono stare in qualunque ordine.</li>
      <li>I numeri decimali si confrontano con una piccola tolleranza (es. 27.666666 e 27.6666667).</li>
    </ul>
    <p class="avviso"><strong>Attenzione:</strong> due query diverse possono dare lo stesso risultato <em>per coincidenza</em> sui dati di questo scenario.
    Un «Corretto» non dimostra che la query sia giusta in generale: confrontala sempre con le soluzioni ufficiali e chiediti se funzionerebbe
    anche con NULL, duplicati o tabelle vuote. Per questo gli scenari vanno generati con dati che contengono casi limite.</p>
  </section>
  <section class="sezione">
    <h3>Note su SQLite</h3>
    <ul>
      <li>Sono permesse solo interrogazioni <code>SELECT</code> e <code>WITH</code>: il database non si può modificare. Ad ogni apertura dello scenario viene ricreato da zero.</li>
      <li>Le stringhe vanno tra apici dritti <code>'…'</code>; la concatenazione è <code>||</code>. Le date sono testi nel formato <code>AAAA-MM-GG</code> (si confrontano come stringhe).</li>
      <li>Supportati: JOIN (anche LEFT/RIGHT/FULL), sottoquery, EXISTS, UNION/INTERSECT/EXCEPT, CTE (WITH), funzioni finestra. Non c'è <code>TOP</code>: usa <code>LIMIT</code>.</li>
      <li>La divisione tra interi è intera (<code>7/2 = 3</code>): usa <code>7.0/2</code> o <code>AVG</code> se ti serve il decimale.</li>
      <li>Una query che dura più di 8 secondi viene interrotta (es. prodotto cartesiano enorme).</li>
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
    <p>Tutto resta nel tuo browser (IndexedDB): nessun account, nessun server. Dopo il primo caricamento l'app funziona anche offline.
    Su iPad aggiungila alla schermata Home (Condividi → Aggiungi alla schermata Home) ed esporta ogni tanto gli scenari come backup.</p>
  </section>`;
  apriDialogo('Guida', h('div', { class: 'guida', html }), { classe: 'dialogo-grande' });
}
