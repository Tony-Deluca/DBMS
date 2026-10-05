// Vista Esercizi: traccia, editor, Esegui/Verifica, feedback, soluzioni e
// pannello di consultazione (laterale su schermo largo, a scomparsa su schermo stretto).
import { h, sostituisci, conferma, toast } from './dom';
import { stato, on } from '../app/stato';
import { aggiornaProgresso, progresso, scegliEsercizio } from '../app/azioni';
import { creaEditor, type EditorSQL } from '../editor/sqlEditor';
import { creaBarraScorciatoie } from './shortcutBar';
import { tabellaRisultati } from './resultsTable';
import { creaVistaER, creaVistaLogico, type Vista } from './vistaModelli';
import { creaVistaDati } from './vistaDati';
import { sql, ErroreTimeout } from '../sql/client';
import { messaggiFeedback, messaggiVarianteFallita, testoDatabaseDiProva } from '../sql/compare';
import { normalizzaVirgolette } from '../sql/guard';
import type { Esercizio } from '../scenario/types';
import { esc } from '../diagram/geometry';

const LARGO = '(min-width: 1024px)';

function pallini(d: number): string {
  return '●'.repeat(d) + '○'.repeat(Math.max(0, 5 - d));
}

/** Evidenziazione minimale per mostrare le soluzioni (sola lettura). */
function sqlEvidenziato(testo: string): string {
  const kw =
    /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|FULL|INNER|OUTER|CROSS|NATURAL|ON|USING|GROUP|BY|HAVING|ORDER|ASC|DESC|AS|AND|OR|NOT|IN|EXISTS|DISTINCT|ALL|ANY|UNION|INTERSECT|EXCEPT|WITH|RECURSIVE|LIMIT|OFFSET|CASE|WHEN|THEN|ELSE|END|IS|NULL|LIKE|BETWEEN|COUNT|SUM|AVG|MIN|MAX)\b/gi;
  return testo
    .split(/('(?:[^']|'')*')/)
    .map((pezzo, i) => (i % 2 === 1 ? `<span class="tok-str">${esc(pezzo)}</span>` : esc(pezzo).replace(kw, (m) => `<span class="tok-kw">${m}</span>`)))
    .join('');
}

export function creaVistaEsercizi(): Vista {
  // --- pannello di consultazione ---
  const vER = creaVistaER(true);
  const vLog = creaVistaLogico(true, 'diagramma');
  const vTesto = creaVistaLogico(true, 'testo');
  const vDati = creaVistaDati(true);
  const schede: { id: string; nome: string; vista: Vista }[] = [
    { id: 'er', nome: 'ER', vista: vER },
    { id: 'logico', nome: 'Logico', vista: vLog },
    { id: 'testo', nome: 'Schema testuale', vista: vTesto },
    { id: 'dati', nome: 'Dati', vista: vDati },
  ];
  let schedaPannello = 'testo';
  const tabPannello = h('div', { class: 'schede-pannello', role: 'tablist' });
  const corpoPannello = h('div', { class: 'corpo-pannello' });
  const chiudiPannello = h('button', { type: 'button', class: 'btn-icona solo-stretto', 'aria-label': 'Chiudi pannello', title: 'Chiudi' }, '✕');
  const pannello = h(
    'aside',
    { class: 'pannello-schema', 'aria-label': 'Consultazione schema' },
    h('div', { class: 'testa-pannello' }, tabPannello, chiudiPannello),
    corpoPannello,
  );
  for (const s of schede) {
    const b = h('button', { type: 'button', role: 'tab', class: 'scheda-pannello', 'data-id': s.id }, s.nome);
    b.addEventListener('click', () => {
      schedaPannello = s.id;
      disegnaPannello();
    });
    tabPannello.appendChild(b);
    s.vista.elemento.dataset.id = s.id;
    corpoPannello.appendChild(s.vista.elemento);
  }
  const disegnaPannello = () => {
    for (const b of tabPannello.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-selected', String(b.dataset.id === schedaPannello));
    for (const s of schede) {
      s.vista.elemento.hidden = s.id !== schedaPannello;
      if (s.id === schedaPannello) s.vista.aggiorna();
    }
  };

  const sfondo = h('div', { class: 'sfondo-pannello' });
  const apriPannello = (aperto: boolean) => {
    pannello.classList.toggle('aperto', aperto);
    sfondo.classList.toggle('visibile', aperto);
    btnSchema.setAttribute('aria-expanded', String(aperto));
    if (aperto) disegnaPannello();
  };
  chiudiPannello.addEventListener('click', () => apriPannello(false));
  sfondo.addEventListener('click', () => apriPannello(false));

  // --- colonna esercizio ---
  const chips = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Esercizi' });
  const btnPrec = h('button', { type: 'button', class: 'btn-icona', 'aria-label': 'Esercizio precedente', title: 'Precedente' }, '‹');
  const btnSucc = h('button', { type: 'button', class: 'btn-icona', 'aria-label': 'Esercizio successivo', title: 'Successivo' }, '›');
  const btnSchema = h('button', { type: 'button', class: 'btn solo-stretto', 'aria-expanded': 'false' }, 'Schema');
  btnSchema.addEventListener('click', () => apriPannello(!pannello.classList.contains('aperto')));
  const nav = h('div', { class: 'nav-esercizi' }, btnPrec, chips, btnSucc, btnSchema);

  const traccia = h('article', { class: 'traccia' });
  const contenitoreEditor = h('div', { class: 'contenitore-editor' });
  let editor: EditorSQL | null = null;
  const barra = creaBarraScorciatoie(() => editor, contenitoreEditor);

  const btnEsegui = h('button', { type: 'button', class: 'btn btn-primario', title: 'Esegui (Ctrl/Cmd+Invio)' }, '▶ Esegui');
  const btnVerifica = h('button', { type: 'button', class: 'btn btn-successo', title: 'Verifica (Ctrl/Cmd+Maiusc+Invio)' }, '✓ Verifica');
  const btnSoluzione = h('button', { type: 'button', class: 'btn' }, 'Mostra soluzione');
  const btnPulisci = h('button', { type: 'button', class: 'btn btn-discreto', title: 'Svuota l\'editor' }, 'Svuota');
  const scorciatoia = h('span', { class: 'nota-tasti solo-mouse' }, 'Ctrl/⌘+Invio esegue · Ctrl/⌘+⇧+Invio verifica');
  const azioni = h('div', { class: 'azioni' }, btnEsegui, btnVerifica, btnSoluzione, btnPulisci, scorciatoia);

  const esito = h('div', { class: 'esito', 'aria-live': 'polite' });
  const risultati = h('div', { class: 'area-risultati' });
  const soluzioni = h('div', { class: 'area-soluzioni' });

  const colonna = h('div', { class: 'colonna-esercizio' }, nav, traccia, contenitoreEditor, barra, azioni, esito, risultati, soluzioni);
  const divisore = h('div', { class: 'divisore', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Ridimensiona pannello', tabindex: '0' });
  const elemento = h('div', { class: 'layout-esercizi' }, colonna, divisore, pannello, sfondo);

  // divisore trascinabile (mouse e touch)
  let larghezzaPannello = 0.42;
  try {
    larghezzaPannello = Number(localStorage.getItem('larghezzaPannello')) || 0.42;
  } catch {
    /* storage non disponibile */
  }
  const applicaLarghezza = () => elemento.style.setProperty('--larghezza-pannello', `${Math.round(larghezzaPannello * 100)}%`);
  applicaLarghezza();
  divisore.addEventListener('pointerdown', (e) => {
    divisore.setPointerCapture(e.pointerId);
    divisore.classList.add('attivo');
  });
  divisore.addEventListener('pointermove', (e) => {
    if (!divisore.hasPointerCapture(e.pointerId)) return;
    const r = elemento.getBoundingClientRect();
    larghezzaPannello = Math.min(0.7, Math.max(0.25, (r.right - e.clientX) / r.width));
    applicaLarghezza();
  });
  const fineTrascina = () => {
    divisore.classList.remove('attivo');
    try {
      localStorage.setItem('larghezzaPannello', String(larghezzaPannello));
    } catch {
      /* ignora */
    }
  };
  divisore.addEventListener('pointerup', fineTrascina);
  divisore.addEventListener('pointercancel', fineTrascina);
  divisore.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      larghezzaPannello = Math.min(0.7, Math.max(0.25, larghezzaPannello + (e.key === 'ArrowLeft' ? 0.03 : -0.03)));
      applicaLarghezza();
    }
  });

  const mqLargo = window.matchMedia(LARGO);
  mqLargo.addEventListener('change', () => {
    apriPannello(false);
    if (mqLargo.matches) disegnaPannello();
  });

  // --- stato per esercizio ---
  let esercizioMostrato: string | null = null;
  let salvataggio: ReturnType<typeof setTimeout> | null = null;
  let occupato = false;
  let impostando = false;

  const esercizio = (): Esercizio | undefined => stato.corrente?.dati.esercizi.find((e) => e.id === stato.esercizioId);

  const assicuraEditor = () => {
    if (editor) return editor;
    editor = creaEditor(contenitoreEditor, {
      onEsegui: () => void esegui(),
      onVerifica: () => void verifica(),
      onCambio: (testo) => {
        const id = esercizioMostrato;
        const scenarioId = stato.corrente?.id;
        if (!id || impostando) return;
        if (salvataggio) clearTimeout(salvataggio);
        salvataggio = setTimeout(() => {
          salvataggio = null;
          if (stato.corrente?.id === scenarioId) aggiornaProgresso(id, { bozza: testo }, false);
        }, 400);
      },
    });
    return editor;
  };

  const disegnaChips = () => {
    const sc = stato.corrente;
    sostituisci(chips);
    if (!sc) return;
    sc.dati.esercizi.forEach((e, i) => {
      const p = progresso(e.id);
      const st = p?.stato ?? 'nuovo';
      const etich = { nuovo: 'da svolgere', tentato: 'tentato', risolto: 'risolto' }[st] + (p?.soluzioneVista ? ', soluzione vista' : '');
      const b = h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: `chip stato-${st}${p?.soluzioneVista ? ' vista' : ''}`,
          'aria-selected': String(e.id === stato.esercizioId),
          title: `${e.id}${e.titolo ? ' — ' + e.titolo : ''} (${etich})`,
          'aria-label': `Esercizio ${e.id}, ${etich}`,
        },
        st === 'risolto' ? `✓ ${e.id}` : e.id,
      );
      b.addEventListener('click', () => scegliEsercizio(e.id));
      chips.appendChild(b);
      if (e.id === stato.esercizioId) queueMicrotask(() => b.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
      void i;
    });
    const es = sc.dati.esercizi;
    const idx = es.findIndex((e) => e.id === stato.esercizioId);
    btnPrec.disabled = idx <= 0;
    btnSucc.disabled = idx < 0 || idx >= es.length - 1;
  };
  const sposta = (d: number) => {
    const es = stato.corrente?.dati.esercizi ?? [];
    const idx = es.findIndex((e) => e.id === stato.esercizioId);
    const n = es[idx + d];
    if (n) scegliEsercizio(n.id);
  };
  btnPrec.addEventListener('click', () => sposta(-1));
  btnSucc.addEventListener('click', () => sposta(1));

  const disegnaTraccia = () => {
    const e = esercizio();
    sostituisci(traccia);
    if (!e) {
      traccia.appendChild(h('p', { class: 'vuoto' }, stato.corrente ? 'Questo scenario non contiene esercizi.' : 'Nessuno scenario: importane uno da «Scenari».'));
      return;
    }
    const sugg = h('p', { class: 'suggerimento', hidden: true }, '💡 ', e.suggerimento ?? '');
    const btnSugg = e.suggerimento
      ? h('button', { type: 'button', class: 'btn btn-piccolo btn-discreto', 'aria-expanded': 'false' }, 'Suggerimento')
      : null;
    btnSugg?.addEventListener('click', () => {
      sugg.hidden = !sugg.hidden;
      btnSugg.setAttribute('aria-expanded', String(!sugg.hidden));
    });
    traccia.append(
      h(
        'div',
        { class: 'traccia-testa' },
        h('span', { class: 'traccia-id' }, e.id),
        e.titolo ? h('h2', { class: 'traccia-titolo' }, e.titolo) : null,
        h('span', { class: 'difficolta', title: `Difficoltà ${e.difficolta} su 5`, 'aria-label': `Difficoltà ${e.difficolta} su 5` }, pallini(e.difficolta)),
        e.argomento ? h('span', { class: 'etichetta' }, e.argomento) : null,
        btnSugg,
      ),
      h('p', { class: 'traccia-testo' }, e.traccia),
      sugg,
    );
  };

  const disegnaEsercizio = () => {
    const e = esercizio();
    const id = e?.id ?? null;
    if (id === esercizioMostrato && stato.corrente) return;
    // salva la bozza dell'esercizio che si lascia
    if (salvataggio && esercizioMostrato && editor) {
      clearTimeout(salvataggio);
      salvataggio = null;
      aggiornaProgresso(esercizioMostrato, { bozza: editor.testo() }, false);
    }
    esercizioMostrato = id;
    disegnaTraccia();
    disegnaChips();
    sostituisci(esito);
    sostituisci(risultati);
    sostituisci(soluzioni);
    const ed = assicuraEditor();
    impostando = true;
    ed.imposta(e ? progresso(e.id)?.bozza ?? '' : '');
    impostando = false;
    const abilitato = !!e;
    btnEsegui.disabled = btnVerifica.disabled = btnSoluzione.disabled = btnPulisci.disabled = !abilitato;
    btnSoluzione.textContent = progresso(id ?? '')?.soluzioneVista ? 'Rivedi soluzione' : 'Mostra soluzione';
  };

  const mostraErrore = (titolo: string, msg: string) => {
    sostituisci(esito, h('div', { class: 'messaggio messaggio-errore', role: 'alert' }, h('strong', {}, titolo), h('p', {}, msg)));
  };

  const testoQuery = () => {
    const ed = assicuraEditor();
    const t = ed.testo();
    const n = normalizzaVirgolette(t);
    if (n !== t) ed.imposta(n);
    return n;
  };

  const bloccaPulsanti = (b: boolean) => {
    occupato = b;
    btnEsegui.disabled = btnVerifica.disabled = b;
    elemento.classList.toggle('in-esecuzione', b);
  };

  const esegui = async () => {
    const e = esercizio();
    if (!e || occupato) return;
    if (stato.erroreDb) return mostraErrore('Database non disponibile', stato.erroreDb);
    const q = testoQuery();
    bloccaPulsanti(true);
    sostituisci(esito, h('div', { class: 'messaggio' }, 'Esecuzione in corso…'));
    try {
      const r = await sql.esegui(q);
      sostituisci(esito);
      sostituisci(risultati, tabellaRisultati(r.colonne, r.righe, { totale: r.totaleRighe, troncato: r.troncato, ms: r.millisecondi }));
      if (progresso(e.id)?.stato !== 'risolto') aggiornaProgresso(e.id, { stato: 'tentato', bozza: q });
    } catch (err) {
      sostituisci(risultati);
      mostraErrore(err instanceof ErroreTimeout ? 'Query interrotta' : 'La query non è valida', (err as Error).message);
    } finally {
      bloccaPulsanti(false);
    }
  };

  const verifica = async () => {
    const e = esercizio();
    if (!e || occupato) return;
    if (stato.erroreDb) return mostraErrore('Database non disponibile', stato.erroreDb);
    const q = testoQuery();
    bloccaPulsanti(true);
    sostituisci(esito, h('div', { class: 'messaggio' }, 'Verifica in corso…'));
    try {
      const { esito: v, risultato: r } = await sql.verifica(q, e.soluzioni);
      const prec = progresso(e.id);
      aggiornaProgresso(e.id, { stato: v.corretta ? 'risolto' : 'tentato', bozza: q, tentativi: (prec?.tentativi ?? 0) + 1 });
      if (v.corretta) {
        const prova = testoDatabaseDiProva(v);
        sostituisci(
          esito,
          h(
            'div',
            { class: 'messaggio messaggio-ok', role: 'status' },
            h('strong', {}, '✓ Corretto!'),
            h(
              'p',
              {},
              v.ordinato ? 'Il risultato coincide con quello atteso, ordine compreso.' : 'Il risultato coincide con quello atteso (l\'ordine delle righe non conta per questo esercizio).',
            ),
            v.colonnePermutate ? h('p', { class: 'nota-colonne' }, 'Nota: colonne in ordine diverso dalla traccia. Per l\'esame rispetta l\'ordine richiesto.') : null,
            prova ? h('p', { class: 'nota' }, prova) : null,
            h('p', { class: 'nota' }, 'Il controllo è pratico, non una prova formale di equivalenza: puoi sempre confrontare la tua query con le soluzioni ufficiali.'),
          ),
        );
      } else if (v.fallitaSuVariante) {
        sostituisci(
          esito,
          h(
            'div',
            { class: 'messaggio messaggio-errore', role: 'alert' },
            h('strong', {}, '✗ Non ancora'),
            h('ul', {}, messaggiVarianteFallita(v.fallitaSuVariante).map((m) => h('li', {}, m))),
            h('p', { class: 'nota' }, `Verificata su ${v.databaseDiProva ?? 0} database di prova prima di trovare la differenza.`),
          ),
        );
      } else {
        const msgs = v.differenza ? messaggiFeedback(v.differenza) : ['Il risultato non coincide con quello atteso.'];
        sostituisci(
          esito,
          h('div', { class: 'messaggio messaggio-errore', role: 'alert' }, h('strong', {}, '✗ Non ancora'), h('ul', {}, msgs.map((m) => h('li', {}, m)))),
        );
      }
      sostituisci(risultati, tabellaRisultati(r.colonne, r.righe, { totale: r.totaleRighe, troncato: r.troncato, ms: r.millisecondi }));
    } catch (err) {
      sostituisci(risultati);
      mostraErrore(err instanceof ErroreTimeout ? 'Query interrotta' : 'La query non è valida', (err as Error).message);
    } finally {
      bloccaPulsanti(false);
    }
  };

  const mostraSoluzioni = async () => {
    const e = esercizio();
    if (!e) return;
    const p = progresso(e.id);
    if (soluzioni.childElementCount > 0) {
      sostituisci(soluzioni);
      btnSoluzione.textContent = p?.soluzioneVista ? 'Rivedi soluzione' : 'Mostra soluzione';
      return;
    }
    if (!p || (p.stato === 'nuovo' && !p.soluzioneVista)) {
      const ok = await conferma('Vuoi arrenderti?', 'Non hai ancora provato questo esercizio. Vuoi davvero vedere la soluzione?', 'Mostra soluzione');
      if (!ok) return;
    }
    aggiornaProgresso(e.id, { soluzioneVista: true });
    btnSoluzione.textContent = 'Nascondi soluzione';
    sostituisci(
      soluzioni,
      h('h3', {}, e.soluzioni.length > 1 ? `Soluzioni ufficiali (${e.soluzioni.length} forme equivalenti)` : 'Soluzione ufficiale'),
      e.soluzioni.map((s, i) => {
        const copia = h('button', { type: 'button', class: 'btn btn-piccolo' }, 'Copia nell\'editor');
        copia.addEventListener('click', async () => {
          const ed = assicuraEditor();
          if (ed.testo().trim() && ed.testo().trim() !== s.trim()) {
            const ok = await conferma('Sostituire la tua query?', 'Il testo attuale dell\'editor verrà sostituito dalla soluzione.', 'Sostituisci');
            if (!ok) return;
          }
          ed.imposta(s);
          toast('Soluzione copiata nell\'editor', 'ok');
        });
        return h(
          'div',
          { class: 'soluzione' },
          h('div', { class: 'soluzione-testa' }, h('span', {}, e.soluzioni.length > 1 ? `Forma ${i + 1}` : 'Soluzione'), copia),
          h('pre', { class: 'codice', html: sqlEvidenziato(s) }),
        );
      }),
    );
    soluzioni.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  btnEsegui.addEventListener('click', () => void esegui());
  btnVerifica.addEventListener('click', () => void verifica());
  btnSoluzione.addEventListener('click', () => void mostraSoluzioni());
  btnPulisci.addEventListener('click', async () => {
    const ed = assicuraEditor();
    if (!ed.testo().trim()) return;
    if (await conferma('Svuotare l\'editor?', 'La query scritta per questo esercizio verrà cancellata.', 'Svuota', true)) {
      ed.imposta('');
      ed.focus();
    }
  });

  on('esercizio', disegnaEsercizio);
  on('progressi', () => {
    disegnaChips();
  });
  on('scenario', () => {
    if (salvataggio) clearTimeout(salvataggio);
    salvataggio = null;
    esercizioMostrato = null;
    disegnaEsercizio();
    apriPannello(false);
    if (mqLargo.matches || pannello.classList.contains('aperto')) disegnaPannello();
  });
  on('db', () => {
    editor?.schema(stato.schemaDb);
    if (stato.erroreDb) mostraErrore('Impossibile creare il database dello scenario', stato.erroreDb);
  });

  return {
    elemento,
    aggiorna() {
      disegnaEsercizio();
      if (mqLargo.matches) disegnaPannello();
    },
  };
}
