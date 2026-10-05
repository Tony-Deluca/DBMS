// Progetto di esempio «Università»: schema ER con una generalizzazione, un attributo multivalore e uno
// composto, la sua ristrutturazione e la traduzione nello schema logico.
import { copiaSchemaER, nuovoProgetto, schemaVuoto, type Progetto } from './modello';
import {
  aggiungiAttributo,
  aggiungiComponente,
  aggiungiEntita,
  aggiungiFiglia,
  aggiungiPartecipazione,
  aggiungiRelazione,
  elimina,
} from './operazioni';
import { analizzaTesto } from './notazioneLogico';

export const TRACCIA_ESEMPIO = `Si vuole progettare la base di dati di un ateneo.
Di ogni studente interessano la matricola (che lo identifica), il nome, il cognome, un indirizzo e-mail (facoltativo), uno o più numeri di telefono e l'indirizzo di residenza (via, città, CAP).
Dei corsi interessano il codice, il nome e il numero di crediti (CFU). Alcuni corsi sono propedeutici ad altri.
Ogni corso ha un solo docente titolare; un docente può essere titolare di più corsi o di nessuno.
Dei docenti interessano il codice, il nome e il cognome; ogni docente afferisce a un dipartimento (di cui interessano nome e sede). I docenti sono professori ordinari oppure ricercatori: dei ricercatori interessa la data di scadenza del contratto.
Per ogni esame sostenuto interessano la data e il voto.`;

export function progettoEsempio(id: string): Progetto {
  const p = nuovoProgetto('Università (esempio)', id);
  p.traccia = TRACCIA_ESEMPIO;
  const s = schemaVuoto();

  const studente = aggiungiEntita(s, 140, 300, 'STUDENTE');
  aggiungiAttributo(s, studente.id, 'Matricola', { identificatore: true });
  aggiungiAttributo(s, studente.id, 'Nome');
  aggiungiAttributo(s, studente.id, 'Cognome');
  aggiungiAttributo(s, studente.id, 'Email', { cardinalita: '(0,1)' });
  aggiungiAttributo(s, studente.id, 'Telefono', { cardinalita: '(1,N)' });
  const indirizzo = aggiungiAttributo(s, studente.id, 'Indirizzo', { lato: 'sinistra' })!;
  for (const c of ['Via', 'Città', 'CAP']) aggiungiComponente(s, indirizzo.id, c);

  const corso = aggiungiEntita(s, 640, 300, 'CORSO');
  aggiungiAttributo(s, corso.id, 'Codice', { identificatore: true });
  aggiungiAttributo(s, corso.id, 'Nome');
  aggiungiAttributo(s, corso.id, 'CFU');

  const docente = aggiungiEntita(s, 640, 640, 'DOCENTE');
  aggiungiAttributo(s, docente.id, 'Codice', { identificatore: true });
  aggiungiAttributo(s, docente.id, 'Nome');
  aggiungiAttributo(s, docente.id, 'Cognome');

  const dip = aggiungiEntita(s, 140, 640, 'DIPARTIMENTO');
  aggiungiAttributo(s, dip.id, 'Nome', { identificatore: true });
  aggiungiAttributo(s, dip.id, 'Sede');

  const ordinario = aggiungiEntita(s, 520, 900, 'ORDINARIO');
  const ricercatore = aggiungiEntita(s, 780, 900, 'RICERCATORE');
  aggiungiAttributo(s, ricercatore.id, 'ScadenzaContratto', { lato: 'destra' });
  aggiungiFiglia(s, docente.id, ordinario.id, '(t,e)');
  aggiungiFiglia(s, docente.id, ricercatore.id, '(t,e)');

  const esame = aggiungiRelazione(s, 390, 300, 'ESAME');
  aggiungiPartecipazione(s, esame.id, studente.id, '(0,N)');
  aggiungiPartecipazione(s, esame.id, corso.id, '(0,N)');
  aggiungiAttributo(s, esame.id, 'Data');
  aggiungiAttributo(s, esame.id, 'Voto');

  const titolarita = aggiungiRelazione(s, 640, 470, 'TITOLARITA');
  aggiungiPartecipazione(s, titolarita.id, corso.id, '(1,1)');
  aggiungiPartecipazione(s, titolarita.id, docente.id, '(0,N)');

  const afferenza = aggiungiRelazione(s, 390, 640, 'AFFERENZA');
  aggiungiPartecipazione(s, afferenza.id, docente.id, '(1,1)');
  aggiungiPartecipazione(s, afferenza.id, dip.id, '(0,N)');

  const prop = aggiungiRelazione(s, 960, 300, 'PROPEDEUTICITA');
  aggiungiPartecipazione(s, prop.id, corso.id, '(0,N)', 'successivo');
  aggiungiPartecipazione(s, prop.id, corso.id, '(0,N)', 'propedeutico');
  p.er = s;

  // --- ristrutturazione ---
  const r = copiaSchemaER(s);
  const doc = r.entita.find((e) => e.nome === 'DOCENTE')!;
  const ric = r.entita.find((e) => e.nome === 'RICERCATORE')!;
  const ord = r.entita.find((e) => e.nome === 'ORDINARIO')!;
  aggiungiAttributo(r, doc.id, 'Ruolo');
  aggiungiAttributo(r, doc.id, 'ScadenzaContratto', { cardinalita: '(0,1)', lato: 'destra' });
  elimina(r, [ric.id, ord.id]);
  const stud = r.entita.find((e) => e.nome === 'STUDENTE')!;
  const tel = stud.attributi.find((a) => a.nome === 'Telefono')!;
  const ind = stud.attributi.find((a) => a.nome === 'Indirizzo')!;
  elimina(r, [tel.id, ind.id]);
  for (const c of ['Via', 'Città', 'CAP']) aggiungiAttributo(r, stud.id, c);
  const telefono = aggiungiEntita(r, 140, 80, 'TELEFONO');
  aggiungiAttributo(r, telefono.id, 'Numero', { identificatore: true, lato: 'destra' });
  const recapito = aggiungiRelazione(r, 140, 190, 'RECAPITO');
  aggiungiPartecipazione(r, recapito.id, stud.id, '(1,N)');
  aggiungiPartecipazione(r, recapito.id, telefono.id, '(1,1)');
  p.erRistrutturato = r;
  p.noteRistrutturazione = [
    '- Generalizzazione DOCENTE → ORDINARIO, RICERCATORE (t,e): accorpata nel padre. Aggiunto l\'attributo Ruolo; ScadenzaContratto diventa facoltativo (0,1).',
    '- Attributo multivalore Telefono (1,N): diventa l\'entità TELEFONO identificata da Numero, legata a STUDENTE dalla relazione RECAPITO.',
    '- Attributo composto Indirizzo: sostituito dai suoi componenti Via, Città, CAP.',
    '- Identificatori principali: Matricola, Codice (CORSO), Codice (DOCENTE), Nome (DIPARTIMENTO), Numero (TELEFONO).',
  ].join('\n');

  // --- traduzione ---
  const testo = `Studente(_Matricola_, Nome, Cognome, Email*, Via, Città, CAP)
Telefono(_Numero_, Studente)
Corso(_Codice_, Nome, CFU, Docente)
Docente(_Codice_, Nome, Cognome, Ruolo, ScadenzaContratto*, Dipartimento)
Dipartimento(_Nome_, Sede)
Esame(_Studente_, _Corso_, Data, Voto)
Propedeuticita(_Corso_, _Propedeutico_)

Telefono.Studente → Studente.Matricola
Corso.Docente → Docente.Codice
Docente.Dipartimento → Dipartimento.Nome
Esame.Studente → Studente.Matricola
Esame.Corso → Corso.Codice
Propedeuticita.Corso → Corso.Codice
Propedeuticita.Propedeutico → Corso.Codice
`;
  const esito = analizzaTesto(testo);
  if (esito.ok) {
    const pos: Record<string, [number, number]> = {
      Studente: [40, 40], Telefono: [40, 300], Esame: [330, 40], Corso: [600, 40],
      Propedeuticita: [880, 40], Docente: [600, 280], Dipartimento: [330, 330],
    };
    for (const t of esito.schema.tabelle) [t.x, t.y] = pos[t.nome] ?? [t.x, t.y];
    p.logico = esito.schema;
  }
  p.pannelli = ['er', 'logico'];
  return p;
}
