// Editor dello schema logico della Progettazione: diagramma (tabelle trascinabili, FK con frecce),
// notazione d'esame (PK sottolineata, facoltativi con *) e scrittura diretta in testo.
import { h, sostituisci, toast } from '../dom';
import { creaCanvas, type InfoPuntatore } from './canvas';
import { apriMenu, campoTesto, elencoSegnalazioni, menuAltro, pulsante, selettore, staScrivendo, vociEsportazione } from './comuni';
import type { EditorSchema } from './editorER';
import { progettazione } from '../../progettazione/stato';
import * as op from '../../progettazione/operazioni';
import { calcolaDisegnoLogico, colpisciLogico, svgDisegnoLogico, tabelleNelRettangolo, type DisegnoLogico } from '../../progettazione/disegnoLogico';
import { analizzaTesto, elencoVincoli, generaTesto } from '../../progettazione/notazioneLogico';
import { controllaLogico } from '../../progettazione/controlli';
import { svgAutonomo } from '../../progettazione/esporta';
import { esc } from '../../diagram/geometry';
import type { SchemaLogicoP } from '../../progettazione/modello';

type Modo = 'diagramma' | 'notazione' | 'scrivi';

/** HTML della notazione d'esame: PK sottolineata, facoltativi con asterisco, vincoli sotto. */
export function htmlNotazione(l: SchemaLogicoP): string {
  if (l.tabelle.length === 0) return '<p class="nota">Schema logico vuoto.</p>';
  const righe = l.tabelle
    .map((t) => {
      const cols = t.colonne.map((c) => `${c.pk ? `<u>${esc(c.nome)}</u>` : esc(c.nome)}${c.facoltativa ? '*' : ''}`).join(', ');
      return `<div class="pg-not-riga"><strong>${esc(t.nome)}</strong>(${cols})</div>`;
    })
    .join('');
  const vincoli = elencoVincoli(l);
  return `<div class="pg-notazione-tabelle">${righe}</div>${vincoli.length ? `<h4>Vincoli di integrità referenziale</h4><ul class="pg-vincoli">${vincoli.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}`;
}

export function creaEditorLogico(alUso: (e: EditorSchema) => void): EditorSchema {
  const logico = () => progettazione.corrente?.logico ?? null;
  const modifica = (f: (l: SchemaLogicoP) => void, unione?: string) =>
    progettazione.modifica((p) => f(p.logico), unione);

  let modo: Modo = 'diagramma';
  let selezione = new Set<string>();
  let colonnaFocus: string | null = null;
  let disegno: DisegnoLogico | null = null;
  let segnalati = new Set<string>();
  let mostraControlli = false;
  let multipla = false;

  const canvas = creaCanvas('Schema logico', {
    disegna() {
      const l = logico();
      if (!l) return { markup: '', box: { x: 0, y: 0, w: 400, h: 300 } };
      disegno = calcolaDisegnoLogico(l);
      const sel = new Set(selezione);
      if (colonnaFocus) sel.add(colonnaFocus);
      return { markup: svgDisegnoLogico(disegno, { selezionati: sel, segnalati }), box: disegno.box };
    },
    inizio(info) {
      alUso(editor);
      const c = colpo(info);
      if (c?.tipo === 'tabella') {
        if (!selezione.has(c.id)) seleziona([c.id], info.maiusc || info.meta || multipla, null);
        progettazione.modifica(() => undefined, `trascina:${Date.now()}`);
        return 'sposta';
      }
      return multipla || info.maiusc ? 'rettangolo' : 'pan';
    },
    muovi(m, _info, dx, dy) {
      const l = logico();
      if (m === 'sposta' && l) {
        op.spostaTabelle(l, [...selezione], dx, dy);
        canvas.aggiorna();
      }
    },
    fine(m, _info, rett) {
      if (m === 'sposta') progettazione.notifica();
      else if (m === 'rettangolo' && rett && disegno) seleziona(tabelleNelRettangolo(disegno, rett), true, null);
    },
    tocco(info) {
      alUso(editor);
      const c = colpo(info);
      if (!c) {
        if (!multipla && !info.maiusc) seleziona([], false, null);
        return;
      }
      seleziona([c.tipo === 'tabella' ? c.id : c.tabella], info.maiusc || info.meta || multipla, c.tipo === 'tabella' ? c.colonna ?? null : null);
    },
    doppioTocco(info) {
      const c = colpo(info);
      if (!c) {
        aggiungiTabella(info.punto);
        return;
      }
      if (c.tipo !== 'tabella') return;
      seleziona([c.id], false, c.colonna ?? null);
      requestAnimationFrame(() => {
        const campo = proprieta.querySelector<HTMLInputElement>(c.colonna ? `[data-col="${c.colonna}"] input` : 'input.pg-nome');
        campo?.focus();
        campo?.select();
      });
    },
    menu(info) {
      alUso(editor);
      const c = colpo(info);
      const x = info.client.x;
      const y = info.client.y;
      if (!c) {
        apriMenu([{ etichetta: 'Nuova tabella qui', azione: () => aggiungiTabella(info.punto) }, { etichetta: 'Adatta allo schermo', azione: () => canvas.adatta() }], x, y);
        return;
      }
      const idT = c.tipo === 'tabella' ? c.id : c.tabella;
      if (!selezione.has(idT)) seleziona([idT], false, null);
      if (c.tipo === 'fk') {
        apriMenu([{ etichetta: 'Elimina vincolo', azione: () => modifica((l) => op.eliminaChiaveEsterna(l, c.id)), pericolosa: true }], x, y, 'Vincolo di integrità referenziale');
        return;
      }
      apriMenu(
        [
          { etichetta: 'Aggiungi colonna', azione: aggiungiColonna },
          { etichetta: 'Duplica', azione: duplica },
          { etichetta: 'Elimina tabella', azione: eliminaSelezione, pericolosa: true },
        ],
        x,
        y,
        op.trovaTabella(logico()!, idT)?.nome,
      );
    },
  });
  const colpo = (info: InfoPuntatore) => (disegno ? colpisciLogico(disegno, info.punto, info.tocco ? 12 : 6) : null);

  function seleziona(ids: string[], aggiungi: boolean, colonna: string | null) {
    if (aggiungi) for (const id of ids) selezione.has(id) && ids.length === 1 ? selezione.delete(id) : selezione.add(id);
    else selezione = new Set(ids);
    colonnaFocus = colonna;
    canvas.aggiorna();
    disegnaProprieta();
  }

  function aggiungiTabella(p = canvas.vistaCentrale()) {
    let id = '';
    modifica((l) => {
      const t = op.aggiungiTabella(l, Math.round(p.x - 70), Math.round(p.y - 30));
      op.aggiungiColonna(l, t.id, 'Id', { pk: true });
      id = t.id;
    });
    seleziona([id], false, null);
    requestAnimationFrame(() => {
      const campo = proprieta.querySelector<HTMLInputElement>('input.pg-nome');
      campo?.focus();
      campo?.select();
    });
  }
  function aggiungiColonna() {
    const id = [...selezione][0];
    if (!id) {
      toast('Seleziona prima una tabella.', 'errore');
      return;
    }
    let nuova = '';
    modifica((l) => {
      nuova = op.aggiungiColonna(l, id)?.id ?? '';
    });
    colonnaFocus = nuova;
    disegnaProprieta();
    requestAnimationFrame(() => {
      const campo = proprieta.querySelector<HTMLInputElement>(`[data-col="${nuova}"] input`);
      campo?.focus();
      campo?.select();
    });
  }
  function eliminaSelezione() {
    if (!selezione.size) return;
    modifica((l) => op.eliminaLogico(l, [...selezione]));
    seleziona([], false, null);
  }
  function duplica() {
    let copie: string[] = [];
    modifica((l) => {
      copie = op.duplicaTabelle(l, [...selezione]);
    });
    seleziona(copie, false, null);
  }

  // ---------- barra ----------
  const segmenti = (['diagramma', 'notazione', 'scrivi'] as Modo[]).map((m) => {
    const b = h('button', { type: 'button', class: 'segmento' }, { diagramma: 'Diagramma', notazione: 'Notazione', scrivi: 'Scrivi' }[m]);
    b.addEventListener('click', () => impostaModo(m));
    return b;
  });
  const btnAnnulla = pulsante('↶', 'Annulla (Ctrl/⌘+Z)', () => progettazione.annulla(), 'btn-icona');
  const btnRipeti = pulsante('↷', 'Ripeti', () => progettazione.ripeti(), 'btn-icona');
  const cambiaMultipla = () => {
    multipla = !multipla;
    btnMultipla.hidden = !multipla;
  };
  const btnMultipla = pulsante('☑ Multipla', 'Selezione multipla attiva: tocca per disattivarla', cambiaMultipla);
  btnMultipla.setAttribute('aria-pressed', 'true');
  btnMultipla.hidden = true;
  const btnControlli = pulsante('Controlli', 'Controlli di coerenza', () => {
    mostraControlli = !mostraControlli;
    btnControlli.setAttribute('aria-pressed', String(mostraControlli));
    disegnaControlli();
  });
  btnControlli.setAttribute('aria-pressed', 'false');
  const strumentiDiagramma = h(
    'span',
    { class: 'pg-gruppo' },
    pulsante('▦ Tabella', 'Nuova tabella', () => aggiungiTabella()),
    pulsante('+ Colonna', 'Nuova colonna nella tabella selezionata', aggiungiColonna),
    pulsante('🗑', 'Elimina la selezione (Canc)', eliminaSelezione, 'btn-icona'),
  );
  const barra = h(
    'div',
    { class: 'pg-barra', role: 'toolbar', 'aria-label': 'Strumenti dello schema logico' },
    h('div', { class: 'segmentato', role: 'group', 'aria-label': 'Modalità' }, segmenti),
    btnAnnulla,
    btnRipeti,
    strumentiDiagramma,
    btnControlli,
    menuAltro(() => [
      ...(modo === 'diagramma'
        ? [
            { etichetta: 'Duplica le tabelle selezionate (Ctrl/⌘+D)', azione: duplica },
            { etichetta: multipla ? '✓ Selezione multipla (attiva)' : 'Selezione multipla', attiva: multipla, azione: cambiaMultipla },
          ]
        : []),
      ...vociEsportazione(() => `${progettazione.corrente?.nome ?? 'schema'} logico`, () => svgEsportazione()),
    ]),
    btnMultipla,
  );

  // ---------- notazione e scrittura ----------
  const notazione = h('div', { class: 'pg-notazione' });
  const area = h('textarea', {
    class: 'pg-testo-logico',
    'aria-label': 'Schema logico in notazione testuale',
    autocorrect: 'off',
    autocapitalize: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
    rows: '14',
  }) as HTMLTextAreaElement;
  const erroriTesto = h('div', { class: 'pg-errori-testo', 'aria-live': 'polite' });
  const btnApplica = pulsante('Aggiorna il diagramma', 'Converte il testo nel diagramma', () => applicaTesto(true), 'btn btn-piccolo btn-primario');
  const scrivi = h(
    'div',
    { class: 'pg-scrivi' },
    h('p', { class: 'nota' }, 'Una tabella per riga: Studente(_Matricola_, Nome, Città*). _Nome_ = chiave primaria (sottolineata), Nome* = facoltativo. Vincoli: Esame.Studente → Studente.Matricola (anche ->), oppure Esame(A, B) → Tab(X, Y).'),
    area,
    h('div', { class: 'riga-pulsanti' }, btnApplica),
    erroriTesto,
  );
  let timerTesto: ReturnType<typeof setTimeout> | null = null;

  /** Controlla il testo; se è corretto e `applica` è vero aggiorna lo schema. Il testo resta sempre salvato. */
  function applicaTesto(applica: boolean): boolean {
    const l = logico();
    if (!l) return false;
    const testo = area.value;
    const esito = analizzaTesto(testo, l);
    if (!esito.ok) {
      progettazione.modificaTesto((p) => {
        p.bozzaTestoLogico = testo;
      });
      sostituisci(
        erroriTesto,
        h('p', { class: 'messaggio messaggio-errore' }, h('strong', {}, 'Errori di sintassi: il diagramma non è stato aggiornato e il testo è conservato.'), h('ul', {}, esito.errori.slice(0, 8).map((e) => h('li', {}, `Riga ${e.riga}, colonna ${e.colonna}: ${e.messaggio}`)))),
      );
      return false;
    }
    if (applica) {
      if (generaTesto(esito.schema) !== generaTesto(l) || JSON.stringify(esito.schema.tabelle.map((t) => t.id)) !== JSON.stringify(l.tabelle.map((t) => t.id))) {
        modifica((x) => {
          x.tabelle = esito.schema.tabelle;
        }, 'testo-logico');
      }
      progettazione.modificaTesto((p) => {
        p.bozzaTestoLogico = null;
      });
      sostituisci(erroriTesto, h('p', { class: 'pg-ok' }, '✓ Testo corretto: diagramma aggiornato.'));
    } else {
      progettazione.modificaTesto((p) => {
        p.bozzaTestoLogico = testo;
      });
      sostituisci(erroriTesto, h('p', { class: 'pg-ok' }, '✓ Nessun errore di sintassi.'));
    }
    return true;
  }
  area.addEventListener('input', () => {
    if (timerTesto) clearTimeout(timerTesto);
    timerTesto = setTimeout(() => applicaTesto(false), 500);
  });
  area.addEventListener('blur', () => {
    if (modo === 'scrivi') applicaTesto(true);
  });
  area.addEventListener('keydown', (e) => e.stopPropagation());

  function impostaModo(m: Modo) {
    if (modo === 'scrivi' && m !== 'scrivi') applicaTesto(true);
    modo = m;
    segmenti.forEach((b, i) => b.setAttribute('aria-pressed', String(['diagramma', 'notazione', 'scrivi'][i] === m)));
    corpo.hidden = m !== 'diagramma';
    strumentiDiagramma.hidden = m !== 'diagramma';
    notazione.hidden = m !== 'notazione';
    scrivi.hidden = m !== 'scrivi';
    if (m === 'scrivi') {
      const p = progettazione.corrente;
      area.value = p?.bozzaTestoLogico ?? (p ? generaTesto(p.logico) : '');
      sostituisci(erroriTesto);
      if (p?.bozzaTestoLogico) applicaTesto(false);
    }
    if (m === 'notazione') notazione.innerHTML = htmlNotazione(logico() ?? { tabelle: [] });
    if (m === 'diagramma') requestAnimationFrame(() => canvas.aggiorna());
  }

  // ---------- proprietà ----------
  const proprieta = h('div', { class: 'pg-proprieta', 'aria-label': 'Proprietà' });
  const controlli = h('div', { class: 'pg-controlli', hidden: true });

  function disegnaProprieta() {
    if (staScrivendo(proprieta)) return;
    const l = logico();
    if (!l) return;
    const sel = [...selezione].filter((id) => op.trovaTabella(l, id));
    if (sel.length === 0) {
      sostituisci(proprieta, h('h3', {}, 'Proprietà'), h('p', { class: 'nota' }, 'Tocca una tabella per modificarla. Doppio tocco sullo sfondo: nuova tabella. Puoi anche scrivere lo schema in testo con «Scrivi».'), h('p', { class: 'nota' }, `${l.tabelle.length} tabelle`));
      return;
    }
    if (sel.length > 1) {
      sostituisci(proprieta, h('h3', {}, `${sel.length} tabelle selezionate`), h('div', { class: 'riga-pulsanti' }, pulsante('Duplica', 'Duplica', duplica), pulsante('Elimina', 'Elimina', eliminaSelezione, 'btn btn-piccolo btn-pericolo')));
      return;
    }
    const t = op.trovaTabella(l, sel[0])!;
    const altre = l.tabelle.flatMap((u) => u.colonne.map((c) => ({ valore: `${u.nome}\u0001${c.nome}`, etichetta: `→ ${u.nome}.${c.nome}${c.pk ? ' (PK)' : ''}` })));
    const fkDi = (nome: string) => t.chiaviEsterne.find((f) => f.colonne.length === 1 && f.colonne[0].toLowerCase() === nome.toLowerCase());
    const composte = t.chiaviEsterne.filter((f) => f.colonne.length > 1);
    sostituisci(
      proprieta,
      h('h3', {}, 'Tabella'),
      h('label', { class: 'pg-etichetta' }, 'Nome', campoTesto(t.nome, 'Nome della tabella', (v) => modifica((x) => op.rinominaTabella(x, t.id, v), `tab:${t.id}`), { classe: 'pg-nome' })),
      h(
        'section',
        { class: 'pg-sezione' },
        h('h4', {}, 'Colonne'),
        t.colonne.map((c) => {
          const fk = fkDi(c.nome);
          const pk = h('button', { type: 'button', class: 'pg-chip', 'aria-pressed': String(c.pk), title: 'Chiave primaria' }, c.pk ? '● PK' : '○ PK');
          pk.addEventListener('click', () => modifica((x) => op.modificaColonna(x, c.id, { pk: !c.pk, facoltativa: !c.pk ? false : c.facoltativa })));
          const fac = h('button', { type: 'button', class: 'pg-chip', 'aria-pressed': String(c.facoltativa), title: 'Facoltativa (ammette NULL)' }, c.facoltativa ? '✱ facolt.' : 'obblig.');
          fac.addEventListener('click', () => modifica((x) => op.modificaColonna(x, c.id, { facoltativa: !c.facoltativa })));
          return h(
            'div',
            { class: `pg-attr${colonnaFocus === c.id ? ' evidenziato' : ''}`, 'data-col': c.id },
            campoTesto(c.nome, 'Nome della colonna', (v) => modifica((x) => op.modificaColonna(x, c.id, { nome: v }), `col:${c.id}`)),
            h(
              'div',
              { class: 'pg-attr-comandi' },
              pk,
              fac,
              selettore(
                [{ valore: '', etichetta: 'Nessuna FK' }, ...altre.filter((o) => !o.valore.startsWith(`${t.nome}\u0001${c.nome}`))],
                fk ? `${fk.tabella}\u0001${fk.riferimenti[0]}` : '',
                'Chiave esterna verso',
                (v) =>
                  modifica((x) => {
                    const [tab, col] = v.split('\u0001');
                    op.impostaChiaveEsternaSemplice(x, c.id, v ? { tabella: tab, colonna: col } : null);
                  }),
              ),
              pulsante('↑', 'Sposta su', () => modifica((x) => op.spostaColonna(x, c.id, -1)), 'btn-icona'),
              pulsante('↓', 'Sposta giù', () => modifica((x) => op.spostaColonna(x, c.id, 1)), 'btn-icona'),
              pulsante('✕', 'Elimina colonna', () => modifica((x) => op.eliminaColonna(x, c.id)), 'btn-icona pg-elimina'),
            ),
          );
        }),
        pulsante('+ Colonna', 'Aggiungi colonna', aggiungiColonna),
      ),
      composte.length
        ? h(
            'section',
            { class: 'pg-sezione' },
            h('h4', {}, 'Chiavi esterne composte'),
            composte.map((f) => h('div', { class: 'pg-riga' }, h('code', {}, `(${f.colonne.join(', ')}) → ${f.tabella}(${f.riferimenti.join(', ')})`), pulsante('✕', 'Elimina vincolo', () => modifica((x) => op.eliminaChiaveEsterna(x, f.id)), 'btn-icona pg-elimina'))),
            h('p', { class: 'nota' }, 'Le chiavi esterne su più colonne si scrivono in «Scrivi».'),
          )
        : null,
    );
  }

  function disegnaControlli() {
    controlli.hidden = !mostraControlli;
    const l = logico();
    if (!mostraControlli || !l) {
      segnalati = new Set();
      canvas.aggiorna();
      return;
    }
    const lista = controllaLogico(l);
    segnalati = new Set(lista.flatMap((x) => x.elementi));
    sostituisci(controlli, h('h4', {}, 'Controlli di coerenza (segnalazioni, nessuna correzione automatica)'), elencoSegnalazioni(lista, (ids) => seleziona(ids.filter((x) => op.trovaTabella(l, x)), false, null)));
    canvas.aggiorna();
  }

  function svgEsportazione(titolo = ''): string {
    const l = logico() ?? { tabelle: [] };
    const d = calcolaDisegnoLogico(l);
    return svgAutonomo(svgDisegnoLogico(d), d.box, titolo);
  }

  const corpo = h('div', { class: 'pg-corpo' }, canvas.elemento, h('div', { class: 'pg-laterale' }, controlli, proprieta));
  const elemento = h('div', { class: 'pg-editor pg-editor-logico' }, barra, corpo, notazione, scrivi);
  elemento.addEventListener('pointerdown', () => alUso(editor), true);
  impostaModo('diagramma');

  const aggiornaStoria = () => {
    btnAnnulla.disabled = !progettazione.puoAnnullare;
    btnRipeti.disabled = !progettazione.puoRipetere;
  };
  progettazione.on('schema', () => {
    if (!elemento.isConnected) return;
    canvas.aggiorna();
    disegnaProprieta();
    if (modo === 'notazione') notazione.innerHTML = htmlNotazione(logico() ?? { tabelle: [] });
    if (mostraControlli) disegnaControlli();
  });
  progettazione.on('storia', aggiornaStoria);
  progettazione.on('progetto', () => {
    selezione = new Set();
    colonnaFocus = null;
    if (modo === 'scrivi') impostaModo('scrivi');
    if (elemento.isConnected) requestAnimationFrame(() => canvas.adatta());
  });

  const editor: EditorSchema = {
    elemento,
    aggiorna() {
      aggiornaStoria();
      if (modo === 'diagramma') canvas.aggiorna();
      if (modo === 'notazione') notazione.innerHTML = htmlNotazione(logico() ?? { tabelle: [] });
      disegnaProprieta();
    },
    tasto(e) {
      if (modo !== 'diagramma') return false;
      const mod = e.metaKey || e.ctrlKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selezione.size) {
        eliminaSelezione();
        return true;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        duplica();
        return true;
      }
      if (e.key === 'Escape') {
        seleziona([], false, null);
        return true;
      }
      return false;
    },
    svgEsportazione,
  };
  return editor;
}
