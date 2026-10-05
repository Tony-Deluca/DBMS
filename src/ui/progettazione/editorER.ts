// Editor dello schema ER (originale o ristrutturato) della sezione Progettazione.
import { h, sostituisci, toast } from '../dom';
import { creaCanvas, type InfoPuntatore } from './canvas';
import { apriMenu, campoTesto, chips, elencoSegnalazioni, menuAltro, pulsante, selettore, staScrivendo, vociEsportazione, type VoceMenu } from './comuni';
import { progettazione } from '../../progettazione/stato';
import * as op from '../../progettazione/operazioni';
import { calcolaDisegnoER, colpisci, figureNelRettangolo, svgDisegnoER, type Colpo, type DisegnoER } from '../../progettazione/disegnoER';
import { svgAutonomo } from '../../progettazione/esporta';
import { controllaER } from '../../progettazione/controlli';
import {
  CARDINALITA_ATTRIBUTO,
  CARDINALITA_PARTECIPAZIONE,
  COPERTURE,
  LATI,
  type Attributo,
  type CardinalitaAttributo,
  type CardinalitaPartecipazione,
  type Copertura,
  type Lato,
  type Progetto,
  type SchemaER,
} from '../../progettazione/modello';

export type ChiaveSchema = 'er' | 'erRistrutturato';

export interface EditorSchema {
  elemento: HTMLElement;
  aggiorna(): void;
  /** scorciatoie da tastiera quando l'editor è l'ultimo usato */
  tasto(e: KeyboardEvent): boolean;
  /** SVG autonomo per l'esportazione e la Presentazione */
  svgEsportazione(titolo?: string): string;
}

type Strumento = 'seleziona' | 'collega' | 'generalizza';

const ETICHETTA_LATO: Record<Lato, string> = { auto: 'Lato: auto', sopra: 'Sopra', sotto: 'Sotto', sinistra: 'Sinistra', destra: 'Destra' };
const etichettaCardAttr = (c: CardinalitaAttributo) => c ?? '(1,1)';

export function creaEditorER(chiave: ChiaveSchema, alUso: (e: EditorSchema) => void): EditorSchema {
  const schema = (p: Progetto | null = progettazione.corrente): SchemaER | null => (p ? (chiave === 'er' ? p.er : p.erRistrutturato) : null);
  const modifica = (f: (s: SchemaER) => void, unione?: string) =>
    progettazione.modifica((p) => {
      const s = schema(p);
      if (s) f(s);
    }, unione);

  let selezione = new Set<string>();
  let principale: Colpo | null = null;
  let strumento: Strumento = 'seleziona';
  let multipla = false;
  let sorgente: string | null = null; // per collega / generalizza con due tocchi
  let segnalati = new Set<string>();
  let disegno: DisegnoER | null = null;
  let mostraControlli = false;

  // ---------- canvas ----------
  const canvas = creaCanvas(chiave === 'er' ? 'Schema ER' : 'Schema ER ristrutturato', {
    disegna() {
      const s = schema();
      if (!s) return { markup: '', box: { x: 0, y: 0, w: 400, h: 300 } };
      disegno = calcolaDisegnoER(s);
      const sel = new Set(selezione);
      if (sorgente) sel.add(sorgente);
      return { markup: svgDisegnoER(disegno, { selezionati: sel, segnalati }), box: disegno.box };
    },
    inizio(info) {
      alUso(editor);
      const c = colpo(info);
      if ((strumento === 'collega' || strumento === 'generalizza') && c?.tipo === 'figura') {
        sorgente = c.id;
        return 'collega';
      }
      if (c && (c.tipo === 'figura' || c.tipo === 'attributo')) {
        const id = c.tipo === 'figura' ? c.id : c.proprietario;
        if (!selezione.has(id)) seleziona([id], info.maiusc || info.meta || multipla, c);
        // un passo di annulla per tutto il trascinamento
        progettazione.modifica(() => undefined, `trascina:${Date.now()}`);
        return 'sposta';
      }
      if (multipla || info.maiusc) return 'rettangolo';
      return 'pan';
    },
    muovi(modo, info, dx, dy) {
      const s = schema();
      if (!s) return;
      if (modo === 'sposta') {
        op.sposta(s, [...selezione], dx, dy);
        canvas.aggiorna();
      } else if (modo === 'collega' && sorgente) {
        const f = disegno?.figure.find((x) => x.id === sorgente);
        if (f) canvas.sovrapposizione(`<line x1="${f.cx}" y1="${f.cy}" x2="${info.punto.x}" y2="${info.punto.y}" class="pg-linea-collega"/>`);
      }
    },
    fine(modo, info, rett) {
      if (modo === 'sposta') {
        progettazione.notifica();
      } else if (modo === 'collega') {
        canvas.sovrapposizione('');
        const c = colpo(info);
        if (sorgente && c?.tipo === 'figura') collegaFigure(sorgente, c.id);
        sorgente = null;
        canvas.aggiorna();
      } else if (modo === 'rettangolo' && rett && disegno) {
        const ids = figureNelRettangolo(disegno, rett);
        seleziona(ids, true, ids.length ? { tipo: 'figura', id: ids[0] } : null);
      }
    },
    tocco(info) {
      alUso(editor);
      const c = colpo(info);
      if (strumento !== 'seleziona') {
        if (c?.tipo !== 'figura') {
          sorgente = null;
          canvas.aggiorna();
          return;
        }
        if (!sorgente) {
          sorgente = c.id;
          toast(strumento === 'collega' ? 'Ora tocca l\'elemento da collegare' : 'Ora tocca l\'entità padre', 'info', 2000);
        } else {
          collegaFigure(sorgente, c.id);
          sorgente = null;
        }
        canvas.aggiorna();
        return;
      }
      if (!c) {
        if (!multipla && !info.maiusc) seleziona([], false, null);
        return;
      }
      const id = c.tipo === 'figura' ? c.id : c.tipo === 'attributo' ? c.proprietario : c.id;
      seleziona([id], info.maiusc || info.meta || multipla, c);
    },
    doppioTocco(info) {
      const c = colpo(info);
      if (!c) {
        // doppio tocco sullo sfondo: nuova entità
        aggiungiFigura('entita', info.punto);
        return;
      }
      seleziona([c.tipo === 'attributo' ? c.proprietario : c.id], false, c);
      requestAnimationFrame(() => {
        const campo = proprieta.querySelector<HTMLInputElement>(c.tipo === 'attributo' ? `[data-attr="${c.id}"] input` : 'input.pg-nome');
        campo?.focus();
        campo?.select();
      });
    },
    menu(info) {
      alUso(editor);
      apriMenuContestuale(colpo(info), info);
    },
  });

  const colpo = (info: InfoPuntatore): Colpo | null => (disegno ? colpisci(disegno, info.punto, info.tocco ? 12 : 6) : null);

  function collegaFigure(da: string, a: string) {
    const s = schema();
    if (!s) return;
    if (strumento === 'generalizza') {
      if (!op.trovaEntita(s, da) || !op.trovaEntita(s, a) || da === a) {
        toast('Una generalizzazione collega due entità: prima la figlia, poi il padre.', 'errore');
        return;
      }
      modifica((x) => op.aggiungiFiglia(x, a, da));
      return;
    }
    const tipoDa = op.trovaEntita(s, da) ? 'e' : 'r';
    const tipoA = op.trovaEntita(s, a) ? 'e' : 'r';
    if (tipoDa === 'r' && tipoA === 'r') {
      toast('Si collegano entità e relazioni (o due entità, che crea una relazione in mezzo).', 'errore');
      return;
    }
    let nuovoId: string | null = null;
    modifica((x) => {
      const esito = op.collega(x, da, a);
      if (esito.tipo !== 'nessuno') nuovoId = esito.relazione.id;
    });
    if (nuovoId) seleziona([nuovoId], false, { tipo: 'figura', id: nuovoId });
  }

  function seleziona(ids: string[], aggiungi: boolean, focus: Colpo | null) {
    if (aggiungi) {
      for (const id of ids) {
        if (selezione.has(id) && ids.length === 1) selezione.delete(id);
        else selezione.add(id);
      }
    } else selezione = new Set(ids);
    principale = focus;
    canvas.aggiorna();
    disegnaProprieta();
  }

  function aggiungiFigura(tipo: 'entita' | 'relazione', punto = canvas.vistaCentrale()) {
    let id = '';
    modifica((s) => {
      id = (tipo === 'entita' ? op.aggiungiEntita(s, Math.round(punto.x), Math.round(punto.y)) : op.aggiungiRelazione(s, Math.round(punto.x), Math.round(punto.y))).id;
    });
    seleziona([id], false, { tipo: 'figura', id });
    requestAnimationFrame(() => {
      const campo = proprieta.querySelector<HTMLInputElement>('input.pg-nome');
      campo?.focus();
      campo?.select();
    });
  }

  function aggiungiAttributoSelezionato() {
    const s = schema();
    const id = [...selezione].find((x) => s && op.proprietario(s, x));
    if (!id) {
      toast('Seleziona prima un\'entità o una relazione.', 'errore');
      return;
    }
    let nuovo = '';
    modifica((x) => {
      nuovo = op.aggiungiAttributo(x, id)?.id ?? '';
    });
    principale = { tipo: 'attributo', id: nuovo, proprietario: id };
    disegnaProprieta();
    requestAnimationFrame(() => {
      const campo = proprieta.querySelector<HTMLInputElement>(`[data-attr="${nuovo}"] input`);
      campo?.focus();
      campo?.select();
    });
  }

  function eliminaSelezione() {
    if (selezione.size === 0) return;
    modifica((s) => op.elimina(s, [...selezione]));
    seleziona([], false, null);
  }

  function duplicaSelezione() {
    let copie: string[] = [];
    modifica((s) => {
      copie = op.duplica(s, [...selezione]);
    });
    if (copie.length) seleziona(copie, false, { tipo: 'figura', id: copie[0] });
  }

  function apriMenuContestuale(c: Colpo | null, info: InfoPuntatore) {
    const s = schema();
    if (!s) return;
    const x = info.client.x;
    const y = info.client.y;
    if (!c) {
      apriMenu(
        [
          { etichetta: 'Nuova entità qui', azione: () => aggiungiFigura('entita', info.punto) },
          { etichetta: 'Nuova relazione qui', azione: () => aggiungiFigura('relazione', info.punto) },
          { etichetta: 'Adatta allo schermo', azione: () => canvas.adatta() },
        ],
        x,
        y,
      );
      return;
    }
    if (c.tipo === 'figura') {
      if (!selezione.has(c.id)) seleziona([c.id], false, c);
      const el = op.proprietario(s, c.id)!;
      apriMenu(
        [
          { etichetta: 'Rinomina', azione: focusNome },
          { etichetta: 'Aggiungi attributo', azione: aggiungiAttributoSelezionato },
          { etichetta: 'Collega a…', azione: () => impostaStrumento('collega', c.id) },
          ...(op.trovaEntita(s, c.id) ? [{ etichetta: 'Rendi figlia di… (generalizzazione)', azione: () => impostaStrumento('generalizza', c.id) }] : []),
          { etichetta: 'Duplica', azione: duplicaSelezione },
          { etichetta: 'Elimina', azione: eliminaSelezione, pericolosa: true },
        ],
        x,
        y,
        el.nome,
      );
      return;
    }
    if (c.tipo === 'partecipazione') {
      const t = op.trovaPartecipazione(s, c.id)!;
      seleziona([c.id], false, c);
      apriMenu(
        [
          ...CARDINALITA_PARTECIPAZIONE.map((card): VoceMenu => ({
            etichetta: `Cardinalità ${card}`,
            attiva: t.partecipazione.cardinalita === card,
            azione: () => modifica((x) => op.modificaPartecipazione(x, c.id, { cardinalita: card })),
          })),
          { etichetta: 'Elimina collegamento', azione: () => modifica((x) => op.eliminaPartecipazione(x, c.id)), pericolosa: true },
        ],
        x,
        y,
        `${t.relazione.nome} – ${op.trovaEntita(s, t.partecipazione.entita)?.nome ?? ''}`,
      );
      return;
    }
    if (c.tipo === 'attributo') {
      const a = op.trovaAttributo(s, c.id)!.attributo;
      seleziona([c.proprietario], false, c);
      apriMenu(
        [
          { etichetta: a.identificatore ? 'Togli dall\'identificatore' : 'Fa parte dell\'identificatore', azione: () => modifica((x) => op.modificaAttributo(x, c.id, { identificatore: !a.identificatore })) },
          ...CARDINALITA_ATTRIBUTO.map((card): VoceMenu => ({
            etichetta: `Cardinalità ${etichettaCardAttr(card)}`,
            attiva: a.cardinalita === card,
            azione: () => modifica((x) => op.modificaAttributo(x, c.id, { cardinalita: card })),
          })),
          { etichetta: 'Elimina attributo', azione: () => modifica((x) => op.eliminaAttributo(x, c.id)), pericolosa: true },
        ],
        x,
        y,
        a.nome,
      );
      return;
    }
    const g = op.trovaGeneralizzazione(s, c.id)!;
    seleziona([c.id], false, c);
    apriMenu(
      [
        ...COPERTURE.map((cop): VoceMenu => ({ etichetta: `Copertura ${cop}`, attiva: g.copertura === cop, azione: () => modifica((x) => op.modificaGeneralizzazione(x, c.id, { copertura: cop })) })),
        { etichetta: 'Elimina generalizzazione', azione: () => modifica((x) => op.elimina(x, [c.id])), pericolosa: true },
      ],
      x,
      y,
      'Generalizzazione',
    );
  }

  function focusNome() {
    requestAnimationFrame(() => {
      const campo = proprieta.querySelector<HTMLInputElement>('input.pg-nome');
      campo?.focus();
      campo?.select();
    });
  }

  // ---------- barra strumenti ----------
  const btnStrumenti = {
    seleziona: pulsante('↖ Seleziona', 'Seleziona e sposta', () => impostaStrumento('seleziona'), 'btn btn-piccolo pg-strumento'),
    collega: pulsante('⟷ Collega', 'Collega: trascina (o tocca) da un elemento all\'altro', () => impostaStrumento('collega'), 'btn btn-piccolo pg-strumento'),
    generalizza: pulsante('△ Generalizza', 'Generalizzazione: dalla figlia al padre', () => impostaStrumento('generalizza'), 'btn btn-piccolo pg-strumento'),
  };
  function impostaStrumento(s: Strumento, da: string | null = null) {
    strumento = s;
    sorgente = da;
    for (const [k, b] of Object.entries(btnStrumenti)) b.setAttribute('aria-pressed', String(k === s));
    elemento.dataset.strumento = s;
    if (da) toast(s === 'collega' ? 'Tocca l\'elemento da collegare' : 'Tocca l\'entità padre', 'info', 2200);
    canvas.aggiorna();
  }
  const btnAnnulla = pulsante('↶', 'Annulla (Ctrl/⌘+Z)', () => progettazione.annulla(), 'btn-icona');
  const btnRipeti = pulsante('↷', 'Ripeti (Ctrl/⌘+Maiusc+Z)', () => progettazione.ripeti(), 'btn-icona');
  const cambiaMultipla = () => {
    multipla = !multipla;
    btnMultipla.hidden = !multipla;
  };
  // visibile solo quando è attiva (si attiva dal menu «⋯»): un tocco la disattiva
  const btnMultipla = pulsante('☑ Multipla', 'Selezione multipla attiva: tocca per disattivarla', cambiaMultipla);
  btnMultipla.setAttribute('aria-pressed', 'true');
  btnMultipla.hidden = true;
  const btnControlli = pulsante('Controlli', 'Controlli di coerenza', () => {
    mostraControlli = !mostraControlli;
    btnControlli.setAttribute('aria-pressed', String(mostraControlli));
    disegnaControlli();
  });
  btnControlli.setAttribute('aria-pressed', 'false');

  const barra = h(
    'div',
    { class: 'pg-barra', role: 'toolbar', 'aria-label': 'Strumenti dello schema ER' },
    btnStrumenti.seleziona,
    btnStrumenti.collega,
    btnStrumenti.generalizza,
    h('span', { class: 'pg-separatore' }),
    pulsante('▭ Entità', 'Nuova entità', () => aggiungiFigura('entita')),
    pulsante('◇ Relazione', 'Nuova relazione', () => aggiungiFigura('relazione')),
    pulsante('○ Attributo', 'Nuovo attributo dell\'elemento selezionato', aggiungiAttributoSelezionato),
    h('span', { class: 'pg-separatore' }),
    btnAnnulla,
    btnRipeti,
    pulsante('🗑', 'Elimina la selezione (Canc)', eliminaSelezione, 'btn-icona'),
    btnControlli,
    menuAltro(() => [
      { etichetta: 'Duplica la selezione (Ctrl/⌘+D)', azione: duplicaSelezione },
      { etichetta: multipla ? '✓ Selezione multipla (attiva)' : 'Selezione multipla', attiva: multipla, azione: cambiaMultipla },
      ...vociEsportazione(
        () => `${progettazione.corrente?.nome ?? 'schema'} ${chiave === 'er' ? 'ER' : 'ER ristrutturato'}`,
        () => svgEsportazione(),
      ),
    ]),
    btnMultipla,
  );

  // ---------- pannello proprietà ----------
  const proprieta = h('div', { class: 'pg-proprieta', 'aria-label': 'Proprietà' });
  const controlli = h('div', { class: 'pg-controlli', hidden: true });

  function rigaAttributo(s: SchemaER, a: Attributo, perEntita: boolean, livello: 0 | 1): HTMLElement {
    const evidenziato = principale?.tipo === 'attributo' && principale.id === a.id;
    const riga = h('div', { class: `pg-attr${evidenziato ? ' evidenziato' : ''}${livello ? ' componente' : ''}`, 'data-attr': a.id });
    const nome = campoTesto(a.nome, 'Nome dell\'attributo', (v) => modifica((x) => op.modificaAttributo(x, a.id, { nome: v }), `attr:${a.id}`));
    const comandi = h('div', { class: 'pg-attr-comandi' });
    if (perEntita) {
      const id = h('button', { type: 'button', class: 'pg-chip', 'aria-pressed': String(a.identificatore), title: 'Fa parte dell\'identificatore' }, a.identificatore ? '● Id' : '○ Id');
      id.addEventListener('click', () => modifica((x) => op.modificaAttributo(x, a.id, { identificatore: !a.identificatore })));
      comandi.appendChild(id);
    }
    comandi.appendChild(
      selettore(
        CARDINALITA_ATTRIBUTO.map((c) => ({ valore: (c ?? '(1,1)') as string, etichetta: etichettaCardAttr(c) })),
        a.cardinalita ?? '(1,1)',
        'Cardinalità dell\'attributo',
        (v) => modifica((x) => op.modificaAttributo(x, a.id, { cardinalita: v === '(1,1)' ? null : (v as CardinalitaAttributo) })),
      ),
    );
    if (livello === 0) {
      const lati = a.componenti.length ? LATI.filter((l) => l !== 'sopra' && l !== 'sotto') : LATI;
      comandi.appendChild(selettore(lati.map((l) => ({ valore: l, etichetta: ETICHETTA_LATO[l] })), a.lato, 'Lato del disegno', (v) => modifica((x) => op.modificaAttributo(x, a.id, { lato: v }))));
      comandi.appendChild(pulsante('+ comp.', 'Aggiungi un componente (attributo composto)', () => modifica((x) => op.aggiungiComponente(x, a.id))));
    }
    comandi.appendChild(pulsante('↑', 'Sposta su', () => modifica((x) => op.spostaAttributo(x, a.id, -1)), 'btn-icona'));
    comandi.appendChild(pulsante('↓', 'Sposta giù', () => modifica((x) => op.spostaAttributo(x, a.id, 1)), 'btn-icona'));
    comandi.appendChild(pulsante('✕', 'Elimina attributo', () => modifica((x) => op.eliminaAttributo(x, a.id)), 'btn-icona pg-elimina'));
    riga.append(nome, comandi);
    for (const c of a.componenti) riga.appendChild(rigaAttributo(s, c, false, 1));
    return riga;
  }

  function sezioneAttributi(s: SchemaER, idProp: string, attributi: Attributo[], perEntita: boolean): HTMLElement {
    return h(
      'section',
      { class: 'pg-sezione' },
      h('h4', {}, 'Attributi'),
      attributi.length ? attributi.map((a) => rigaAttributo(s, a, perEntita, 0)) : h('p', { class: 'nota' }, 'Nessun attributo.'),
      pulsante('+ Attributo', 'Aggiungi attributo', () => {
        seleziona([idProp], false, { tipo: 'figura', id: idProp });
        aggiungiAttributoSelezionato();
      }),
    );
  }

  function disegnaProprieta() {
    if (staScrivendo(proprieta)) return;
    const s = schema();
    if (!s) {
      sostituisci(proprieta);
      return;
    }
    const sel = [...selezione].filter((id) => op.proprietario(s, id) || op.trovaGeneralizzazione(s, id) || op.trovaPartecipazione(s, id));
    if (sel.length === 0) {
      sostituisci(
        proprieta,
        h('h3', {}, 'Proprietà'),
        h(
          'p',
          { class: 'nota' },
          'Tocca un elemento per modificarlo. Doppio tocco sullo sfondo: nuova entità. Tieni premuto (o clic destro) per il menu. ',
          'Con «Collega» trascina o tocca un elemento e poi l\'altro.',
        ),
        h('p', { class: 'nota' }, `${s.entita.length} entità · ${s.relazioni.length} relazioni · ${s.generalizzazioni.length} generalizzazioni`),
      );
      return;
    }
    if (sel.length > 1) {
      sostituisci(proprieta, h('h3', {}, `${sel.length} elementi selezionati`), h('div', { class: 'riga-pulsanti' }, pulsante('Duplica', 'Duplica', duplicaSelezione), pulsante('Elimina', 'Elimina', eliminaSelezione, 'btn btn-piccolo btn-pericolo')));
      return;
    }
    const id = sel[0];
    const ent = op.trovaEntita(s, id);
    const rel = op.trovaRelazione(s, id) ?? op.trovaPartecipazione(s, id)?.relazione;
    const gen = op.trovaGeneralizzazione(s, id);
    const nomeEnt = (x: string) => op.trovaEntita(s, x)?.nome ?? '?';
    const opzioniEntita = s.entita.map((e) => ({ valore: e.id, etichetta: e.nome || '(senza nome)' }));

    if (ent) {
      const nome = campoTesto(ent.nome, 'Nome dell\'entità', (v) => modifica((x) => op.rinomina(x, ent.id, v), `nome:${ent.id}`), { classe: 'pg-nome' });
      const relazioni = s.relazioni.filter((r) => r.partecipazioni.some((p) => p.entita === ent.id));
      const padre = s.generalizzazioni.find((g) => g.figlie.includes(ent.id));
      const figlie = s.generalizzazioni.find((g) => g.padre === ent.id);
      const altre = s.entita.filter((e) => e.id !== ent.id && !(figlie?.figlie.includes(e.id)));
      const aggiungiFiglia = selettore(
        [{ valore: '', etichetta: '+ Aggiungi entità figlia…' }, ...altre.map((e) => ({ valore: e.id, etichetta: e.nome }))],
        '',
        'Aggiungi entità figlia',
        (v) => v && modifica((x) => op.aggiungiFiglia(x, ent.id, v)),
      );
      sostituisci(
        proprieta,
        h('h3', {}, 'Entità'),
        h('label', { class: 'pg-etichetta' }, 'Nome', nome),
        sezioneAttributi(s, ent.id, ent.attributi, true),
        h(
          'section',
          { class: 'pg-sezione' },
          h('h4', {}, 'Identificatore esterno (entità debole)'),
          relazioni.length
            ? relazioni.map((r) => {
                const attivo = ent.identificatoreEsterno.includes(r.id);
                const b = h('button', { type: 'button', class: 'pg-chip', 'aria-pressed': String(attivo) }, `${attivo ? '●' : '○'} tramite ${r.nome}`);
                b.addEventListener('click', () =>
                  modifica((x) => {
                    const e = op.trovaEntita(x, ent.id)!;
                    e.identificatoreEsterno = attivo ? e.identificatoreEsterno.filter((y) => y !== r.id) : [...e.identificatoreEsterno, r.id];
                  }),
                );
                return b;
              })
            : h('p', { class: 'nota' }, 'L\'entità non partecipa ad alcuna relazione.'),
        ),
        h(
          'section',
          { class: 'pg-sezione' },
          h('h4', {}, 'Generalizzazione'),
          padre ? h('p', {}, `Figlia di ${nomeEnt(padre.padre)}`) : null,
          figlie ? h('p', {}, `Padre di ${figlie.figlie.map(nomeEnt).join(', ')}`) : null,
          aggiungiFiglia,
        ),
      );
      return;
    }
    if (rel) {
      const nome = campoTesto(rel.nome, 'Nome della relazione', (v) => modifica((x) => op.rinomina(x, rel.id, v), `nome:${rel.id}`), { classe: 'pg-nome' });
      const evidenziata = principale?.tipo === 'partecipazione' ? principale.id : null;
      sostituisci(
        proprieta,
        h('h3', {}, 'Relazione'),
        h('label', { class: 'pg-etichetta' }, 'Nome', nome),
        h(
          'section',
          { class: 'pg-sezione' },
          h('h4', {}, 'Partecipazioni'),
          rel.partecipazioni.length === 0 ? h('p', { class: 'nota' }, 'Collega delle entità (strumento «Collega» o qui sotto).') : null,
          rel.partecipazioni.map((p) =>
            h(
              'div',
              { class: `pg-partecipazione${evidenziata === p.id ? ' evidenziato' : ''}` },
              h(
                'div',
                { class: 'pg-riga' },
                selettore(opzioniEntita, p.entita, 'Entità', (v) => modifica((x) => op.modificaPartecipazione(x, p.id, { entita: v }))),
                pulsante('✕', 'Elimina partecipazione', () => modifica((x) => op.eliminaPartecipazione(x, p.id)), 'btn-icona pg-elimina'),
              ),
              chips<CardinalitaPartecipazione | null>(CARDINALITA_PARTECIPAZIONE, p.cardinalita, (c) => c ?? '', (c) => modifica((x) => op.modificaPartecipazione(x, p.id, { cardinalita: c })), 'Cardinalità'),
              campoTesto(p.ruolo, 'Ruolo (relazioni ricorsive)', (v) => modifica((x) => op.modificaPartecipazione(x, p.id, { ruolo: v }), `ruolo:${p.id}`), { segnaposto: 'Ruolo (facoltativo)' }),
            ),
          ),
          s.entita.length
            ? selettore([{ valore: '', etichetta: '+ Aggiungi partecipante…' }, ...opzioniEntita], '', 'Aggiungi partecipante', (v) => v && modifica((x) => op.aggiungiPartecipazione(x, rel.id, v)))
            : null,
        ),
        sezioneAttributi(s, rel.id, rel.attributi, false),
      );
      return;
    }
    if (gen) {
      const altre = s.entita.filter((e) => e.id !== gen.padre && !gen.figlie.includes(e.id));
      sostituisci(
        proprieta,
        h('h3', {}, 'Generalizzazione'),
        h('label', { class: 'pg-etichetta' }, 'Padre', selettore(opzioniEntita, gen.padre, 'Entità padre', (v) => modifica((x) => op.modificaGeneralizzazione(x, gen.id, { padre: v })))),
        h(
          'section',
          { class: 'pg-sezione' },
          h('h4', {}, 'Figlie'),
          gen.figlie.map((f) =>
            h('div', { class: 'pg-riga' }, h('span', { class: 'pg-nome-figlia' }, nomeEnt(f)), pulsante('✕', 'Togli figlia', () => modifica((x) => {
              const g = op.trovaGeneralizzazione(x, gen.id)!;
              g.figlie = g.figlie.filter((y) => y !== f);
              if (g.figlie.length === 0) op.elimina(x, [g.id]);
            }), 'btn-icona pg-elimina')),
          ),
          altre.length ? selettore([{ valore: '', etichetta: '+ Aggiungi figlia…' }, ...altre.map((e) => ({ valore: e.id, etichetta: e.nome }))], '', 'Aggiungi figlia', (v) => v && modifica((x) => op.aggiungiFiglia(x, gen.padre, v))) : null,
        ),
        h('section', { class: 'pg-sezione' }, h('h4', {}, 'Copertura'), chips<Copertura>(COPERTURE, gen.copertura, (c) => c, (c) => modifica((x) => op.modificaGeneralizzazione(x, gen.id, { copertura: c })), 'Copertura'), h('p', { class: 'nota' }, 't = totale, p = parziale; e = esclusiva, s = sovrapposta.')),
        pulsante('Elimina generalizzazione', 'Elimina', () => modifica((x) => op.elimina(x, [gen.id])), 'btn btn-piccolo btn-pericolo'),
      );
    }
  }

  function disegnaControlli() {
    controlli.hidden = !mostraControlli;
    const s = schema();
    if (!mostraControlli || !s) {
      segnalati = new Set();
      canvas.aggiorna();
      return;
    }
    const lista = controllaER(s);
    segnalati = new Set(lista.flatMap((x) => x.elementi));
    sostituisci(controlli, h('h4', {}, 'Controlli di coerenza (segnalazioni, nessuna correzione automatica)'), elencoSegnalazioni(lista, (ids) => {
      const figure = ids.filter((x) => op.proprietario(s, x) || op.trovaGeneralizzazione(s, x));
      seleziona(figure, false, figure.length ? { tipo: 'figura', id: figure[0] } : null);
    }));
    canvas.aggiorna();
  }

  function svgEsportazione(titolo = ''): string {
    const s = schema();
    if (!s) return svgAutonomo('', { x: 0, y: 0, w: 300, h: 100 }, titolo);
    const d = calcolaDisegnoER(s);
    return svgAutonomo(svgDisegnoER(d), d.box, titolo);
  }

  const corpo = h('div', { class: 'pg-corpo' }, canvas.elemento, h('div', { class: 'pg-laterale' }, controlli, proprieta));
  const elemento = h('div', { class: 'pg-editor', 'data-strumento': 'seleziona' }, barra, corpo);
  impostaStrumento('seleziona');
  elemento.addEventListener('pointerdown', () => alUso(editor), true);

  const aggiornaStoria = () => {
    btnAnnulla.disabled = !progettazione.puoAnnullare;
    btnRipeti.disabled = !progettazione.puoRipetere;
  };
  progettazione.on('schema', () => {
    if (!elemento.isConnected) return;
    canvas.aggiorna();
    disegnaProprieta();
    if (mostraControlli) disegnaControlli();
  });
  progettazione.on('storia', aggiornaStoria);
  progettazione.on('progetto', () => {
    selezione = new Set();
    principale = null;
    sorgente = null;
    if (elemento.isConnected) requestAnimationFrame(() => canvas.adatta());
  });

  const editor: EditorSchema = {
    elemento,
    aggiorna() {
      aggiornaStoria();
      canvas.aggiorna();
      disegnaProprieta();
    },
    tasto(e) {
      const mod = e.metaKey || e.ctrlKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selezione.size) {
        eliminaSelezione();
        return true;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        duplicaSelezione();
        return true;
      }
      if (e.key === 'Escape') {
        impostaStrumento('seleziona');
        seleziona([], false, null);
        return true;
      }
      return false;
    },
    svgEsportazione,
  };
  return editor;
}
