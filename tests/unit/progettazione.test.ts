import { describe, expect, it } from 'vitest';
import { copiaSchemaER, nuovoProgetto, normalizzaProgetto, schemaVuoto, type SchemaER } from '../../src/progettazione/modello';
import * as op from '../../src/progettazione/operazioni';
import { Storia } from '../../src/progettazione/storia';
import { analizzaTesto, elencoVincoli, generaTesto } from '../../src/progettazione/notazioneLogico';
import { controllaER, controllaLogico } from '../../src/progettazione/controlli';
import { descriviSchemaER, testoPerIA } from '../../src/progettazione/testoIA';
import { progettoEsempio } from '../../src/progettazione/esempio';
import { progettoDaScenario } from '../../src/progettazione/daScenario';
import { leggiScenario } from './helpers';

function schemaBase(): { s: SchemaER; studente: string; corso: string; esame: string } {
  const s = schemaVuoto();
  const st = op.aggiungiEntita(s, 0, 0, 'STUDENTE');
  const co = op.aggiungiEntita(s, 300, 0, 'CORSO');
  const es = op.collega(s, st.id, co.id);
  if (es.tipo !== 'relazione') throw new Error('atteso relazione');
  op.rinomina(s, es.relazione.id, 'ESAME');
  return { s, studente: st.id, corso: co.id, esame: es.relazione.id };
}

describe('schema ER: creazione e modifica', () => {
  it('entità, relazioni con nomi univoci, rinomina', () => {
    const s = schemaVuoto();
    const a = op.aggiungiEntita(s, 10, 20);
    const b = op.aggiungiEntita(s, 10, 20);
    const r = op.aggiungiRelazione(s, 0, 0);
    expect([a.nome, b.nome, r.nome]).toEqual(['ENTITA', 'ENTITA2', 'RELAZIONE']);
    op.rinomina(s, a.id, 'STUDENTE');
    expect(op.trovaEntita(s, a.id)!.nome).toBe('STUDENTE');
  });

  it('attributi: identificatore, cardinalità, lato, composti a un livello, ordine', () => {
    const { s, studente } = schemaBase();
    const m = op.aggiungiAttributo(s, studente, 'Matricola', { identificatore: true })!;
    const t = op.aggiungiAttributo(s, studente, 'Telefono')!;
    op.modificaAttributo(s, t.id, { cardinalita: '(1,N)', lato: 'sotto' });
    const ind = op.aggiungiAttributo(s, studente, 'Indirizzo', { lato: 'sopra' })!;
    const via = op.aggiungiComponente(s, ind.id, 'Via')!;
    op.aggiungiComponente(s, ind.id, 'CAP');
    expect(op.aggiungiComponente(s, via.id, 'x')).toBeUndefined(); // un solo livello
    expect(ind.lato).toBe('auto'); // i composti si disegnano di lato
    expect(ind.componenti.map((c) => c.nome)).toEqual(['Via', 'CAP']);
    op.spostaAttributo(s, t.id, -1);
    expect(op.trovaEntita(s, studente)!.attributi.map((a) => a.nome)).toEqual(['Telefono', 'Matricola', 'Indirizzo']);
    op.eliminaAttributo(s, via.id);
    expect(ind.componenti.map((c) => c.nome)).toEqual(['CAP']);
    expect(op.trovaAttributo(s, m.id)!.attributo.identificatore).toBe(true);
  });

  it('collegamenti: partecipazioni, cardinalità, ruoli, ricorsiva, ternaria', () => {
    const { s, studente, corso, esame } = schemaBase();
    const r = op.trovaRelazione(s, esame)!;
    expect(r.partecipazioni.map((p) => p.entita)).toEqual([studente, corso]);
    op.modificaPartecipazione(s, r.partecipazioni[0].id, { cardinalita: '(0,N)' });
    expect(r.partecipazioni[0].cardinalita).toBe('(0,N)');
    // ternaria: trascino una terza entità sulla relazione
    const sem = op.aggiungiEntita(s, 0, 300, 'SEMESTRE');
    const c = op.collega(s, sem.id, esame);
    expect(c.tipo).toBe('partecipazione');
    expect(r.partecipazioni).toHaveLength(3);
    // ricorsiva: da un'entità a se stessa
    const ric = op.collega(s, corso, corso);
    expect(ric.tipo).toBe('relazione');
    if (ric.tipo === 'relazione') expect(ric.relazione.partecipazioni.map((p) => [p.entita, p.ruolo])).toEqual([[corso, 'ruolo1'], [corso, 'ruolo2']]);
    expect(op.collega(s, esame, esame).tipo).toBe('nessuno');
  });

  it('generalizzazioni e identificatore esterno', () => {
    const { s, studente, esame } = schemaBase();
    const persona = op.aggiungiEntita(s, 0, -300, 'PERSONA');
    const g = op.aggiungiFiglia(s, persona.id, studente, '(p,e)')!;
    const doc = op.aggiungiEntita(s, 200, 300, 'DOCENTE');
    op.aggiungiFiglia(s, persona.id, doc.id);
    expect(s.generalizzazioni).toHaveLength(1);
    expect(g.figlie).toEqual([studente, doc.id]);
    op.modificaGeneralizzazione(s, g.id, { copertura: '(t,s)' });
    expect(g.copertura).toBe('(t,s)');
    expect(op.aggiungiFiglia(s, persona.id, persona.id)).toBeUndefined();
    op.trovaEntita(s, studente)!.identificatoreEsterno.push(esame);
    // eliminare la relazione toglie il riferimento dall'identificatore esterno
    op.elimina(s, [esame]);
    expect(op.trovaEntita(s, studente)!.identificatoreEsterno).toEqual([]);
  });

  it('eliminazione a cascata, spostamento, duplicazione', () => {
    const { s, studente, corso, esame } = schemaBase();
    op.sposta(s, [studente, esame], 10, -5);
    expect([op.trovaEntita(s, studente)!.x, op.trovaEntita(s, studente)!.y]).toEqual([10, -5]);
    const copie = op.duplica(s, [studente, esame]);
    expect(copie).toHaveLength(2);
    const rCopia = op.trovaRelazione(s, copie[1])!;
    expect(rCopia.nome).toBe('ESAME2');
    // la relazione copiata collega la copia di STUDENTE e il CORSO originale
    expect(rCopia.partecipazioni.map((p) => p.entita)).toEqual([copie[0], corso]);
    op.elimina(s, [corso]);
    expect(op.trovaRelazione(s, esame)!.partecipazioni.map((p) => p.entita)).toEqual([studente]);
  });
});

describe('annulla / ripeti', () => {
  it('ripristina gli stati in ordine e unisce le modifiche consecutive dello stesso campo', () => {
    let s = schemaVuoto();
    const storia = new Storia<SchemaER>();
    const modifica = (f: (x: SchemaER) => void, unione?: string) => {
      storia.registra(s, unione);
      f(s);
    };
    modifica((x) => op.aggiungiEntita(x, 0, 0, 'A'));
    const id = s.entita[0].id;
    modifica((x) => op.rinomina(x, id, 'AB'), `nome:${id}`);
    modifica((x) => op.rinomina(x, id, 'ABC'), `nome:${id}`); // stessa digitazione: un solo passo
    modifica((x) => op.aggiungiEntita(x, 0, 0, 'B'));
    expect(s.entita.map((e) => e.nome)).toEqual(['ABC', 'B']);
    s = storia.annulla(s)!;
    expect(s.entita.map((e) => e.nome)).toEqual(['ABC']);
    s = storia.annulla(s)!;
    expect(s.entita.map((e) => e.nome)).toEqual(['A']);
    s = storia.ripeti(s)!;
    expect(s.entita.map((e) => e.nome)).toEqual(['ABC']);
    s = storia.annulla(s)!;
    s = storia.annulla(s)!;
    expect(s.entita).toEqual([]);
    expect(storia.annulla(s)).toBeNull();
    // una nuova modifica cancella il «ripeti»
    storia.registra(s);
    op.aggiungiEntita(s, 0, 0, 'Z');
    expect(storia.puoRipetere).toBe(false);
  });
});

describe('copia per la ristrutturazione', () => {
  it('è indipendente dall\'originale e mantiene i collegamenti', () => {
    const p = progettoEsempio('x');
    const copia = copiaSchemaER(p.er);
    const idsOrig = new Set([...p.er.entita, ...p.er.relazioni].map((x) => x.id));
    expect([...copia.entita, ...copia.relazioni].some((x) => idsOrig.has(x.id))).toBe(false);
    // collegamenti rimappati sulle copie
    const ids = new Set(copia.entita.map((e) => e.id));
    expect(copia.relazioni.every((r) => r.partecipazioni.every((x) => ids.has(x.entita)))).toBe(true);
    expect(copia.generalizzazioni.every((g) => ids.has(g.padre) && g.figlie.every((f) => ids.has(f)))).toBe(true);
    // modifiche alla copia non toccano l'originale
    const prima = JSON.stringify(p.er);
    op.rinomina(copia, copia.entita[0].id, 'CAMBIATO');
    op.elimina(copia, [copia.entita[1].id]);
    op.aggiungiAttributo(copia, copia.entita[0].id, 'Nuovo');
    op.aggiungiComponente(copia, copia.entita[0].attributi[0].id, 'Sotto');
    expect(JSON.stringify(p.er)).toBe(prima);
    expect(descriviSchemaER(copia)).not.toBe(descriviSchemaER(p.er));
  });
});

describe('notazione testuale del logico', () => {
  const testo = `Studente(_Matricola_, Nome, Cognome, Città*)
Corso(_Codice_, Nome)
Esame(_Studente_, _Corso_, Data, Voto)
Iscrizione(_Studente_, _Corso_, Anno)
Appello(_Id_, Studente, Corso, Aula*)

Esame.Studente → Studente.Matricola
Esame.Corso → Corso.Codice
Appello(Studente, Corso) → Iscrizione(Studente, Corso)
`;

  it('andata e ritorno senza perdite (PK composte, facoltativi, FK semplici e composte, accenti)', () => {
    const a = analizzaTesto(testo);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(generaTesto(a.schema)).toBe(testo);
    const studente = a.schema.tabelle[0];
    expect(studente.colonne.map((c) => [c.nome, c.pk, c.facoltativa])).toEqual([
      ['Matricola', true, false], ['Nome', false, false], ['Cognome', false, false], ['Città', false, true],
    ]);
    expect(a.schema.tabelle[2].colonne.filter((c) => c.pk).map((c) => c.nome)).toEqual(['Studente', 'Corso']);
    expect(a.schema.tabelle[4].chiaviEsterne).toMatchObject([{ colonne: ['Studente', 'Corso'], tabella: 'Iscrizione', riferimenti: ['Studente', 'Corso'] }]);
    // seconda andata e ritorno identica
    const b = analizzaTesto(generaTesto(a.schema));
    expect(b.ok && generaTesto(b.schema)).toBe(testo);
  });

  it('accetta ->, elenchi puntati, commenti, intestazioni e nomi con underscore', () => {
    const a = analizzaTesto(`-- schema
Persona(_Codice_Fiscale_, Data_Nascita*)
Auto(_Targa_, Proprietario);

Vincoli di integrità referenziale:
- Auto.Proprietario -> Persona.Codice_Fiscale`);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.schema.tabelle[0].colonne.map((c) => [c.nome, c.pk, c.facoltativa])).toEqual([['Codice_Fiscale', true, false], ['Data_Nascita', false, true]]);
    expect(elencoVincoli(a.schema)).toEqual(['Auto.Proprietario → Persona.Codice_Fiscale']);
  });

  it('errori di sintassi con riga e colonna; lo schema precedente non cambia', () => {
    const casi: [string, number, RegExp][] = [
      ['Studente(Matricola, Nome', 1, /parentesi di chiusura/],
      ['Studente Matricola', 1, /manca «\(»/],
      ['A(_x_)\nB(_y_, , z)', 2, /virgola di troppo/],
      ['A(_x_*)', 1, /non può essere facoltativa/],
      ['A(_x_)\nA.x → B', 2, /Tabella.Colonna/],
      ['A(_x_, y)\nA(x, y) → B.k', 2, /2 colonne a 1/],
      ['A(_x_)\nC.x → A.x', 2, /«C» del vincolo non è definita/],
      ['A(_x_)\nA.z → A.x', 2, /non ha la colonna «z»/],
      ['Nome Tabella(_x_)', 1, /riga non riconosciuta|non è un nome di tabella/],
      ['A(Codice Fiscale)', 1, /non è un nome di colonna valido/],
    ];
    for (const [t, riga, re] of casi) {
      const e = analizzaTesto(t);
      expect(e.ok, t).toBe(false);
      if (!e.ok) {
        expect(e.errori[0].riga, t).toBe(riga);
        expect(e.errori[0].messaggio, t).toMatch(re);
        expect(e.errori[0].colonna).toBeGreaterThan(0);
      }
    }
    const c = analizzaTesto('A(_x_)\nB(_y_, , z)');
    if (!c.ok) expect(c.errori[0].colonna).toBe(8);
  });

  it('mantiene id e posizioni delle tabelle già disegnate', () => {
    const a = analizzaTesto('A(_x_, y)\nB(_k_)');
    if (!a.ok) throw new Error();
    a.schema.tabelle[0].x = 500;
    a.schema.tabelle[0].y = 70;
    const b = analizzaTesto('A(_x_, y, z*)\nB(_k_)\nC(_w_)', a.schema);
    if (!b.ok) throw new Error();
    expect(b.schema.tabelle[0]).toMatchObject({ id: a.schema.tabelle[0].id, x: 500, y: 70 });
    expect(b.schema.tabelle[0].colonne[0].id).toBe(a.schema.tabelle[0].colonne[0].id);
    expect(b.schema.tabelle[2].id).not.toBe(a.schema.tabelle[1].id);
  });

  it('rinomina di tabelle e colonne aggiorna i vincoli', () => {
    const a = analizzaTesto(testo);
    if (!a.ok) throw new Error();
    const l = a.schema;
    op.rinominaTabella(l, l.tabelle[0].id, 'Allievo');
    op.modificaColonna(l, l.tabelle[0].colonne[0].id, { nome: 'Matr' });
    op.modificaColonna(l, l.tabelle[2].colonne[0].id, { nome: 'Allievo' });
    expect(elencoVincoli(l)[0]).toBe('Esame.Allievo → Allievo.Matr');
    op.impostaChiaveEsternaSemplice(l, l.tabelle[2].colonne[2].id, { tabella: 'Corso', colonna: 'Nome' });
    expect(elencoVincoli(l)).toContain('Esame.Data → Corso.Nome');
    op.eliminaLogico(l, [l.tabelle[1].id]);
    expect(elencoVincoli(l).some((v) => v.includes('→ Corso.'))).toBe(false);
    expect(elencoVincoli(l)).toContain('Appello(Studente, Corso) → Iscrizione(Studente, Corso)');
  });
});

describe('controlli di coerenza (segnalazioni, nessuna correzione)', () => {
  it('ER: identificatore mancante, un solo partecipante, nomi duplicati, cardinalità mancanti, ruoli', () => {
    const { s, studente, esame } = schemaBase();
    op.aggiungiEntita(s, 0, 0, 'studente');
    const r = op.aggiungiRelazione(s, 0, 0, 'SOLA');
    op.aggiungiPartecipazione(s, r.id, studente, '(0,1)');
    op.collega(s, studente, studente);
    const msg = controllaER(s).map((x) => x.messaggio).join('\n');
    expect(msg).toMatch(/Nome duplicato: «STUDENTE»/);
    expect(msg).toMatch(/«STUDENTE» non ha un identificatore/);
    expect(msg).toMatch(/«SOLA» ha un solo partecipante/);
    expect(msg).toMatch(/Manca la cardinalità di «STUDENTE» in «ESAME»/);
    const prima = JSON.stringify(s);
    controllaER(s);
    expect(JSON.stringify(s)).toBe(prima);
    void esame;
  });

  it('le figlie di una generalizzazione ereditano l\'identificatore; esempio senza errori', () => {
    const p = progettoEsempio('x');
    expect(controllaER(p.er).filter((x) => x.livello === 'errore')).toEqual([]);
    expect(controllaER(p.er).map((x) => x.messaggio).join()).not.toMatch(/ORDINARIO/);
    expect(controllaER(p.erRistrutturato!).filter((x) => x.livello === 'errore')).toEqual([]);
    expect(controllaLogico(p.logico)).toEqual([]);
  });

  it('logico: FK verso tabelle/colonne inesistenti, tabella senza chiave, duplicati', () => {
    const a = analizzaTesto('A(_x_, y)\nA(_z_)\nB(k, w*)\nC(_c_, d)\nB.k → Z.x\nC.d → A.q\nC.d → A.y');
    if (!a.ok) throw new Error(JSON.stringify(a.errori));
    const msg = controllaLogico(a.schema).map((x) => x.messaggio).join('\n');
    expect(msg).toMatch(/Nome di tabella duplicato: «A»/);
    expect(msg).toMatch(/«B» non ha una chiave primaria/);
    expect(msg).toMatch(/tabella «Z», che non esiste/);
    expect(msg).toMatch(/colonna «q», che non esiste in «A»/);
    expect(msg).toMatch(/non punta alla chiave primaria/);
  });
});

describe('Copia per l\'IA', () => {
  it('descrive tutto il progetto d\'esempio in modo completo e leggibile', () => {
    const t = testoPerIA(progettoEsempio('x'));
    for (const atteso of [
      'PROGETTO: Università (esempio)',
      '=== TRACCIA ===',
      'Si vuole progettare la base di dati di un ateneo.',
      '- STUDENTE\n    attributi: Matricola [identificatore]; Nome; Cognome; Email (0,1) facoltativo; Telefono (1,N) multivalore; Indirizzo [composto da: Via, Città, CAP]\n    identificatore: Matricola',
      '- ORDINARIO\n    attributi: nessuno\n    identificatore: ereditato da DOCENTE (generalizzazione)',
      '- ESAME tra STUDENTE (0,N) e CORSO (0,N)\n    attributi: Data; Voto',
      '- PROPEDEUTICITA (ricorsiva) tra CORSO [ruolo: successivo] (0,N) e CORSO [ruolo: propedeutico] (0,N)',
      '- padre DOCENTE, figlie ORDINARIO, RICERCATORE; copertura (t,e) = totale ed esclusiva',
      '=== 2. SCHEMA ER RISTRUTTURATO ===',
      '- RECAPITO tra STUDENTE (1,N) e TELEFONO (1,1)',
      'Generalizzazioni (0):\n- nessuna',
      '=== NOTE SULLA RISTRUTTURAZIONE ===\n- Generalizzazione DOCENTE',
      'Studente(_Matricola_, Nome, Cognome, Email*, Via, Città, CAP)',
      'Esame(_Studente_, _Corso_, Data, Voto)',
      '- Esame: Studente, Corso',
      'Attributi facoltativi: Studente.Email, Docente.ScadenzaContratto',
      '- Esame.Studente → Studente.Matricola',
    ]) {
      expect(t, atteso).toContain(atteso);
    }
    expect(t).not.toContain('{');
    expect(t).not.toMatch(/undefined|null|\[object/);
  });

  it('segnala in chiaro cardinalità e identificatori mancanti', () => {
    const p = nuovoProgetto('Vuoto', 'v');
    const { s } = schemaBase();
    p.er = s;
    const t = testoPerIA(p);
    expect(t).toContain('STUDENTE (cardinalità non indicata) e CORSO (cardinalità non indicata)');
    expect(t).toContain('identificatore: NON INDICATO');
    expect(t).toContain('(non ancora fatto)');
  });
});

describe('import da scenario e normalizzazione', () => {
  it('«Apri in Progettazione» converte ER e logico dello scenario d\'esempio', () => {
    const sc = leggiScenario();
    const p = progettoDaScenario(sc, 'Da scenario', 'id1');
    expect(p.er.entita).toHaveLength(sc.er.entita.length);
    expect(p.er.relazioni).toHaveLength(sc.er.relazioni.length);
    expect(p.er.generalizzazioni[0].figlie).toHaveLength(3);
    expect(p.logico.tabelle.map((t) => t.nome)).toEqual(sc.logico.tabelle.map((t) => t.nome));
    expect(controllaLogico(p.logico).filter((x) => x.livello === 'errore')).toEqual([]);
    const esame = p.logico.tabelle.find((t) => t.nome === 'Esame')!;
    expect(esame.colonne.filter((c) => c.pk).map((c) => c.nome)).toEqual(['Studente', 'Corso']);
    // posizioni diverse per ogni elemento (layout automatico)
    expect(new Set(p.er.entita.map((e) => `${e.x},${e.y}`)).size).toBe(p.er.entita.length);
  });

  it('un progetto parziale (es. file vecchio) viene completato', () => {
    const p = normalizzaProgetto({ id: 'a', nome: 'X', er: { entita: [{ id: 'e', nome: 'E', x: 0, y: 0 } as never], relazioni: [], generalizzazioni: [] } });
    expect(p.er.entita[0].attributi).toEqual([]);
    expect(p.logico.tabelle).toEqual([]);
    expect(p.pannelli).toEqual(['er', 'logico']);
  });
});

describe('prestazioni della Progettazione (15 entità, 10 tabelle)', () => {
  it('ridisegna in pochi millisecondi (fluido durante il trascinamento)', async () => {
    const { calcolaDisegnoER, svgDisegnoER } = await import('../../src/progettazione/disegnoER');
    const { calcolaDisegnoLogico, svgDisegnoLogico } = await import('../../src/progettazione/disegnoLogico');
    const s = schemaVuoto();
    const ent = Array.from({ length: 15 }, (_, i) => {
      const e = op.aggiungiEntita(s, (i % 5) * 260, Math.floor(i / 5) * 240, `ENTITA${i}`);
      for (let j = 0; j < 5; j++) op.aggiungiAttributo(s, e.id, `Attr${j}`, { identificatore: j === 0 });
      return e;
    });
    for (let i = 0; i < 14; i++) op.collega(s, ent[i].id, ent[i + 1].id);
    const l = analizzaTesto(
      Array.from({ length: 10 }, (_, t) => `T${t}(_Id_, Nome, Valore*, Rif)`).join('\n') +
        '\n\n' +
        Array.from({ length: 9 }, (_, t) => `T${t + 1}.Rif → T${t}.Id`).join('\n'),
    );
    if (!l.ok) throw new Error(JSON.stringify(l.errori));
    const t0 = performance.now();
    for (let k = 0; k < 60; k++) {
      op.sposta(s, [ent[3].id], 2, 1);
      svgDisegnoER(calcolaDisegnoER(s), { selezionati: new Set([ent[3].id]) });
      svgDisegnoLogico(calcolaDisegnoLogico(l.schema));
    }
    const perFotogramma = (performance.now() - t0) / 60;
    expect(perFotogramma).toBeLessThan(8);
  });
});
