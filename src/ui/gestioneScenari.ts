// Finestra "Scenari": importazione (file, incolla, trascina) e gestione degli scenari salvati.
import { h, sostituisci, apriDialogo, conferma, toast } from './dom';
import { stato, on } from '../app/stato';
import { apriScenario, assicuraEsempio, azzeraProgressi, caricaScenari, cambiaVista, eliminaScenario, richiediPersistenza, rinominaScenario } from '../app/azioni';
import { progettazione } from '../progettazione/stato';
import { progettoDaScenario } from '../progettazione/daScenario';
import { importaTesto, jsonEsportazione, nomeFile } from '../scenario/importa';
import type { Problema } from '../scenario/validate';
import { archivioSoloInMemoria, nuovoId } from '../storage/idb';
import promptGeneratore from '../../PROMPT_GENERATORE.md?raw';
import { estraiPrompt } from '../scenario/prompt';

function listaProblemi(problemi: Problema[]): HTMLElement {
  const errori = problemi.filter((p) => p.livello === 'errore');
  const avvisi = problemi.filter((p) => p.livello === 'avviso');
  const voce = (p: Problema) =>
    h('li', { class: `problema problema-${p.livello}` }, h('code', { class: 'percorso' }, p.percorso), ' ', p.messaggio);
  const MAX = 30;
  return h(
    'div',
    { class: 'problemi' },
    errori.length
      ? h(
          'div',
          {},
          h('h4', {}, `${errori.length} ${errori.length === 1 ? 'errore' : 'errori'}: lo scenario non è stato importato`),
          h('ul', {}, errori.slice(0, MAX).map(voce)),
          errori.length > MAX ? h('p', {}, `… e altri ${errori.length - MAX}.`) : null,
        )
      : null,
    avvisi.length
      ? h(
          'div',
          {},
          h('h4', {}, `${avvisi.length} ${avvisi.length === 1 ? 'avviso' : 'avvisi'}`),
          h('ul', {}, avvisi.slice(0, MAX).map(voce)),
        )
      : null,
  );
}

async function copiaTesto(testo: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch {
    // ripiego per browser senza Clipboard API
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }) as HTMLTextAreaElement;
    ta.value = testo;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function scarica(nome: string, testo: string) {
  const blob = new Blob([testo], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function apriGestioneScenari(): void {
  const esito = h('div', { class: 'esito-import', 'aria-live': 'polite' });
  const area = h('textarea', {
    class: 'area-json',
    rows: '7',
    placeholder: 'Incolla qui il JSON dello scenario generato in chat (anche con il blocco ```json intorno)…',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-label': 'JSON dello scenario',
  }) as HTMLTextAreaElement;

  const importa = async (testo: string, fonte: string) => {
    sostituisci(esito, h('p', { class: 'messaggio' }, `Controllo dello scenario (${fonte})…`));
    try {
      const r = await importaTesto(testo, stato.scenari.map((s) => s.nome));
      if (!r.ok || !r.salvato) {
        sostituisci(esito, listaProblemi(r.problemi));
        return;
      }
      await caricaScenari();
      await apriScenario(r.salvato.id);
      void richiediPersistenza();
      area.value = '';
      sostituisci(
        esito,
        h('p', { class: 'messaggio messaggio-ok' }, `Scenario «${r.salvato.nome}» importato con ${r.salvato.dati.esercizi.length} esercizi${r.problemi.length ? ' (con avvisi)' : ''}.`),
        r.problemi.length ? listaProblemi(r.problemi) : null,
      );
      toast(`Scenario «${r.salvato.nome}» importato`, 'ok');
    } catch (e) {
      sostituisci(esito, h('p', { class: 'messaggio messaggio-errore' }, `Importazione non riuscita: ${(e as Error).message}`));
    }
  };

  // (a) file picker
  const input = h('input', { type: 'file', accept: '.json,application/json,text/plain', class: 'nascosto', 'aria-hidden': 'true', tabindex: '-1' }) as HTMLInputElement;
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    await importa(await f.text(), `file ${f.name}`);
    input.value = '';
  });
  const btnFile = h('button', { type: 'button', class: 'btn' }, '📂 Scegli file .json');
  btnFile.addEventListener('click', () => input.click());

  // (b) incolla
  const btnImportaTesto = h('button', { type: 'button', class: 'btn btn-primario' }, 'Importa testo incollato');
  btnImportaTesto.addEventListener('click', () => void importa(area.value, 'testo incollato'));
  const btnAppunti = h('button', { type: 'button', class: 'btn' }, '📋 Incolla dagli appunti');
  // nella pagina pubblicata su claude.ai leggere gli appunti non è permesso: si incolla nel riquadro
  btnAppunti.hidden = !navigator.clipboard?.readText || !!import.meta.env.VITE_ARTIFACT;
  btnAppunti.addEventListener('click', async () => {
    try {
      area.value = await navigator.clipboard.readText();
      area.focus();
    } catch {
      toast('Accesso agli appunti non consentito: tieni premuto nel riquadro e scegli «Incolla».', 'errore', 5000);
    }
  });

  // (c) trascina (extra per PC)
  const zona = h('div', { class: 'zona-drop solo-mouse' }, 'Oppure trascina qui un file .json');
  const corpo = h('div', { class: 'gestione' });
  const evidenzia = (on: boolean) => zona.classList.toggle('sopra', on);
  corpo.addEventListener('dragover', (e) => {
    e.preventDefault();
    evidenzia(true);
  });
  corpo.addEventListener('dragleave', (e) => {
    if (e.target === zona) evidenzia(false);
  });
  corpo.addEventListener('drop', async (e) => {
    e.preventDefault();
    evidenzia(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) await importa(await f.text(), `file ${f.name}`);
    else {
      const t = e.dataTransfer?.getData('text/plain');
      if (t) await importa(t, 'testo trascinato');
    }
  });

  const btnPrompt = h('button', { type: 'button', class: 'btn btn-piccolo' }, 'Copia il prompt per generare scenari');
  btnPrompt.addEventListener('click', async () => {
    const ok = await copiaTesto(estraiPrompt(promptGeneratore));
    toast(ok ? 'Prompt copiato: incollalo in una chat con Claude' : 'Copia non riuscita', ok ? 'ok' : 'errore');
  });

  const elenco = h('ul', { class: 'elenco-scenari' });
  const infoArchivio = h('p', { class: 'nota' });

  const disegnaElenco = () => {
    sostituisci(elenco);
    for (const sc of stato.scenari) {
      const corrente = stato.corrente?.id === sc.id;
      const nome = h('div', { class: 'scenario-nome' }, h('strong', {}, sc.nome), corrente ? h('span', { class: 'etichetta' }, 'in uso') : null);
      const dettagli = h(
        'div',
        { class: 'scenario-dettagli' },
        `${sc.dati.logico.tabelle.length} tabelle · ${sc.dati.esercizi.length} esercizi · ${sc.origine === 'esempio' ? 'esempio incluso' : 'importato il ' + new Date(sc.importatoIl).toLocaleDateString('it-IT')}`,
      );
      const btn = (testo: string, azione: () => void, cls = 'btn btn-piccolo') => {
        const b = h('button', { type: 'button', class: cls }, testo);
        b.addEventListener('click', azione);
        return b;
      };
      const comandi = h(
        'div',
        { class: 'scenario-comandi' },
        corrente
          ? null
          : btn('Apri', async () => {
              await apriScenario(sc.id);
              chiudi();
            }, 'btn btn-piccolo btn-primario'),
        btn('Rinomina', () => {
          const campo = h('input', { type: 'text', value: sc.nome, class: 'campo', 'aria-label': 'Nuovo nome', autocapitalize: 'sentences' }) as HTMLInputElement;
          const salva = h('button', { type: 'button', class: 'btn btn-piccolo btn-primario' }, 'Salva');
          const annulla = h('button', { type: 'button', class: 'btn btn-piccolo' }, 'Annulla');
          const forma = h('form', { class: 'rinomina' }, campo, salva, annulla);
          const salvaNome = async () => {
            await rinominaScenario(sc.id, campo.value);
            disegnaElenco();
          };
          forma.addEventListener('submit', (e) => {
            e.preventDefault();
            void salvaNome();
          });
          salva.addEventListener('click', () => void salvaNome());
          annulla.addEventListener('click', disegnaElenco);
          nome.replaceWith(forma);
          campo.focus();
          campo.select();
        }),
        // nella pagina pubblicata i download sono bloccati: resta «Copia JSON»
        import.meta.env.VITE_ARTIFACT ? null : btn('Esporta', () => scarica(nomeFile(sc.nome), jsonEsportazione(sc))),
        btn('Copia JSON', async () => {
          const ok = await copiaTesto(jsonEsportazione(sc));
          toast(ok ? 'JSON copiato negli appunti' : 'Copia non riuscita', ok ? 'ok' : 'errore');
        }),
        btn('Apri in Progettazione', async () => {
          try {
            await progettazione.carica();
            await progettazione.aggiungi(progettoDaScenario(sc.dati, sc.nome, nuovoId()));
            chiudi();
            cambiaVista('progettazione');
            toast('Creato un progetto con ER e logico dello scenario (lo scenario non cambia)', 'ok', 4000);
          } catch (e) {
            toast(`Impossibile creare il progetto: ${(e as Error).message}`, 'errore');
          }
        }),
        btn('Azzera progressi', async () => {
          if (await conferma('Azzerare i progressi?', `Bozze e stato degli esercizi di «${sc.nome}» verranno cancellati.`, 'Azzera', true)) {
            await azzeraProgressi(sc.id);
            toast('Progressi azzerati', 'ok');
          }
        }),
        btn('Elimina', async () => {
          if (await conferma('Eliminare lo scenario?', `«${sc.nome}» e i relativi progressi verranno eliminati da questo browser. Esportalo prima se vuoi conservarlo.`, 'Elimina', true)) {
            await eliminaScenario(sc.id);
            toast('Scenario eliminato', 'info');
            disegnaElenco();
          }
        }, 'btn btn-piccolo btn-pericolo'),
      );
      elenco.appendChild(h('li', { class: `scenario${corrente ? ' corrente' : ''}` }, nome, dettagli, comandi));
    }
    const p = stato.persistenza;
    if (archivioSoloInMemoria()) {
      infoArchivio.textContent = '⚠️ L\'archivio del browser non è disponibile: gli scenari importati restano solo finché la pagina è aperta. Usa «Copia JSON» per conservarli.';
      return;
    }
    infoArchivio.textContent =
      p === 'concessa'
        ? '🔒 Archiviazione persistente concessa: il browser non cancellerà gli scenari automaticamente.'
        : p === 'negata'
          ? '⚠️ Archiviazione persistente non concessa: Safari può cancellare i dati dei siti non usati per qualche settimana. Aggiungi l\'app alla schermata Home ed esporta gli scenari importanti.'
          : '⚠️ Il browser non conferma l\'archiviazione persistente: esporta gli scenari importanti come backup.';
  };

  const btnEsempio = h('button', { type: 'button', class: 'btn btn-piccolo' }, 'Ripristina lo scenario di esempio');
  btnEsempio.addEventListener('click', async () => {
    const s = await assicuraEsempio(true);
    if (s) {
      await apriScenario(s.id);
      toast('Scenario di esempio aggiunto', 'ok');
    }
  });

  corpo.append(
    h(
      'section',
      { class: 'sezione' },
      h('h3', {}, 'Importa uno scenario'),
      h('p', { class: 'nota' }, 'Genera lo scenario in una chat con Claude (usa il prompt qui sotto), poi copia il blocco JSON e incollalo qui.'),
      area,
      h('div', { class: 'riga-pulsanti' }, btnImportaTesto, btnAppunti, btnFile, input),
      zona,
      esito,
      h('div', { class: 'riga-pulsanti' }, btnPrompt),
    ),
    h('section', { class: 'sezione' }, h('h3', {}, 'I tuoi scenari'), elenco, h('div', { class: 'riga-pulsanti' }, btnEsempio), infoArchivio),
  );

  disegnaElenco();
  const chiudi = apriDialogo('Scenari', corpo, { classe: 'dialogo-grande' });
  on('scenari', () => {
    if (corpo.isConnected) disegnaElenco();
  });
}
