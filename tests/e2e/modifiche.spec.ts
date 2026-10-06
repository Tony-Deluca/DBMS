import { test, expect, type Page, type Locator } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const cartella = fileURLToPath(new URL('../../test-results/screenshot/', import.meta.url));
const largo = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

async function apri(page: Page) {
  await page.goto('./');
  await expect(page.locator('.chip')).toHaveCount(10);
  await page.waitForFunction(() => !!window.__palestra?.stato.schemaDb);
}

async function scriviQuery(page: Page, sql: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(sql);
}

async function vaiAEsercizio(page: Page, id: string) {
  await page.locator('.chip', { hasText: new RegExp(`^(✓ )?${id}$`) }).click();
  await expect(page.locator('.traccia-id')).toHaveText(id);
}

/** Apre la scheda indicata nel pannello di consultazione (laterale su schermo largo, a scomparsa su iPad verticale). */
async function apriPannello(page: Page, scheda: string): Promise<Locator> {
  const pannello = page.locator('.pannello-schema');
  if (!largo(page) && !(await pannello.isVisible())) await page.getByRole('button', { name: 'Schema', exact: true }).click();
  await expect(pannello).toBeVisible();
  await pannello.getByRole('tab', { name: scheda, exact: true }).click();
  return pannello;
}

/** Sceglie il suggerimento dell'autocompletamento con tastiera (PC) o toccandolo (iPad). */
async function scegliSuggerimento(page: Page, nome: string) {
  const voce = page.locator('.cm-tooltip-autocomplete li', { hasText: new RegExp(`^${nome}`) }).first();
  await expect(voce).toBeVisible();
  if (page.viewportSize()!.width < 1200 && (await page.evaluate(() => 'ontouchstart' in window))) await voce.tap();
  else await voce.click();
}

test.describe('modifica 1: autocompletamento senza virgolette', () => {
  test('il nome di tabelle e colonne è inserito così com\'è', async ({ page }) => {
    await apri(page);
    await vaiAEsercizio(page, 'E2');
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');

    await page.keyboard.type('SELECT * FROM Stud');
    await scegliSuggerimento(page, 'Studente');
    await expect(page.locator('.cm-content')).toHaveText('SELECT * FROM Studente');

    // colonne dopo «tabella.»
    await page.keyboard.type(' WHERE Studente.Matr');
    await scegliSuggerimento(page, 'Matricola');
    await expect(page.locator('.cm-content')).toHaveText('SELECT * FROM Studente WHERE Studente.Matricola');

    // colonne dopo «alias.»
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText('SELECT 1 FROM Studente s WHERE ');
    await page.keyboard.type('s.CorsoDi');
    await scegliSuggerimento(page, 'CorsoDiLaurea');
    const testo = await page.locator('.cm-content').innerText();
    expect(testo).toContain('s.CorsoDiLaurea');
    expect(testo).not.toMatch(/["'`]/);
    await page.screenshot({ path: `${cartella}${test.info().project.name}-autocompletamento.png` });
  });
});

test.describe('modifica 2: vista Dati', () => {
  test('consultabile accanto all\'editor: tabelle, righe, PK/FK, NULL, ricerca', async ({ page }) => {
    await apri(page);
    await vaiAEsercizio(page, 'E4');
    await scriviQuery(page, 'SELECT c.Nome FROM Corso c');
    const pannello = await apriPannello(page, 'Dati');

    const chips = pannello.locator('.chip-tabella');
    await expect(chips).toHaveCount(7);
    await expect(pannello.locator('.chip-tabella', { hasText: 'Esame' }).locator('.conteggio')).toHaveText('33');
    await pannello.locator('.chip-tabella', { hasText: /^Esame/ }).click();
    await expect(pannello.locator('.tabella-dati tbody tr')).toHaveCount(33);
    await expect(pannello.locator('.info-pagina')).toContainText('Righe 1–33 di 33');
    // intestazioni: PK evidenziata, FK indicata
    await expect(pannello.locator('th .badge-pk')).toHaveCount(2);
    await expect(pannello.locator('th .badge-fk').first()).toContainText('FK → Studente');
    await expect(pannello.locator('th .sottolineato')).toHaveText(['Studente', 'Corso']);

    // NULL distinguibile
    await pannello.locator('.chip-tabella', { hasText: /^Studente/ }).click();
    await expect(pannello.locator('.tabella-dati tbody tr')).toHaveCount(14);
    const nulli = pannello.locator('td.cella-null');
    expect(await nulli.count()).toBe(4);
    await expect(nulli.first()).toHaveText('NULL');
    expect(await nulli.first().evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');

    // ricerca
    await pannello.getByRole('searchbox').fill('rossi');
    await expect(pannello.locator('.tabella-dati tbody tr')).toHaveCount(2);
    await expect(pannello.locator('.info-pagina')).toContainText('di 2 (su 14)');
    await pannello.getByRole('searchbox').fill('zzz');
    await expect(pannello.locator('.vuoto-dati')).toContainText('Nessuna riga corrisponde');
    await pannello.getByRole('searchbox').fill('');
    await expect(pannello.locator('.tabella-dati tbody tr')).toHaveCount(14);

    // la query nell'editor non è stata toccata
    if (!largo(page)) await pannello.getByRole('button', { name: 'Chiudi pannello' }).click();
    await expect(page.locator('.cm-content')).toContainText('SELECT c.Nome FROM Corso c');
  });

  test('salto da una chiave esterna alla riga referenziata e ritorno', async ({ page }) => {
    await apri(page);
    const pannello = await apriPannello(page, 'Dati');
    await pannello.locator('.chip-tabella', { hasText: /^Esame/ }).click();
    const primo = pannello.locator('.tabella-dati tbody tr').first().locator('button.valore-fk').first();
    await expect(primo).toHaveText('100001');
    await primo.click();
    await expect(pannello.locator('.filtro-fk')).toContainText('Studente.Matricola = 100001');
    await expect(pannello.locator('.tabella-dati tbody tr')).toHaveCount(1);
    await expect(pannello.locator('.tabella-dati tbody tr td').nth(3)).toHaveText('Rossi');
    await expect(pannello.locator('.chip-tabella[aria-selected="true"]')).toContainText('Studente');
    await page.screenshot({ path: `${cartella}${test.info().project.name}-dati.png` });
    // da Studente al corso di laurea
    await pannello.locator('.tabella-dati button.valore-fk').first().click();
    await expect(pannello.locator('.filtro-fk')).toContainText('CorsoDiLaurea.Codice = ING-INF');
    // indietro ×2
    await pannello.getByRole('button', { name: '↩ Indietro' }).click();
    await expect(pannello.locator('.chip-tabella[aria-selected="true"]')).toContainText('Studente');
    await pannello.getByRole('button', { name: '↩ Indietro' }).click();
    await expect(pannello.locator('.chip-tabella[aria-selected="true"]')).toContainText('Esame');
    await expect(pannello.locator('.tabella-dati tbody tr')).toHaveCount(33);
    await expect(pannello.locator('.filtro-fk')).toBeHidden();
  });

  test('bersagli da almeno 44 px, nessuno scroll orizzontale della pagina', async ({ page }) => {
    await apri(page);
    const pannello = await apriPannello(page, 'Dati');
    await pannello.locator('.chip-tabella', { hasText: /^Esame/ }).click();
    await expect(pannello.locator('.tabella-dati tbody tr')).toHaveCount(33);
    const piccoli = await pannello.evaluate((el) => {
      const out: string[] = [];
      for (const b of el.querySelectorAll<HTMLElement>('button, input, [role="tab"]')) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 43.5 || r.height < 43.5) out.push(`${b.textContent?.trim() || b.getAttribute('aria-label')} ${r.width}x${r.height}`);
      }
      return out;
    });
    expect(piccoli).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // la tabella scorre da sola in orizzontale quando serve (pannello stretto)
    const m = await pannello.locator('.tabella-scroll').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(m.sw).toBeGreaterThanOrEqual(m.cw);
  });

  test('scheda «Dati» anche a schermo intero', async ({ page }) => {
    await apri(page);
    await page.locator('.scheda[data-id="dati"]').click();
    const vista = page.locator('section[aria-label="Dati"]');
    await expect(vista.locator('.chip-tabella')).toHaveCount(7);
    await expect(vista.locator('.tabella-dati tbody tr')).toHaveCount(13); // prima tabella in ordine alfabetico: Corso
  });

  test('paginazione e ricerca con centinaia di righe (scenario importato per incolla)', async ({ page }) => {
    await apri(page);
    const righe = Array.from({ length: 250 }, (_, i) => `(${i + 1}, 'Voce ${i + 1}', ${i % 5 === 0 ? 'NULL' : `'cat${i % 5}'`})`).join(', ');
    const scenario = {
      version: 1,
      metadati: { titolo: 'Catalogo grande' },
      er: { entita: [{ nome: 'VOCE', attributi: [{ nome: 'Id', chiave: true }, { nome: 'Nome' }, { nome: 'Categoria', cardinalita: '(0,1)' }] }], relazioni: [] },
      logico: { tabelle: [{ nome: 'Voce', colonne: [{ nome: 'Id', tipo: 'INTEGER' }, { nome: 'Nome', tipo: 'TEXT' }, { nome: 'Categoria', tipo: 'TEXT', nullable: true }], chiavePrimaria: ['Id'] }] },
      database: { statements: ['CREATE TABLE Voce (Id INTEGER PRIMARY KEY, Nome TEXT NOT NULL, Categoria TEXT);', `INSERT INTO Voce (Id, Nome, Categoria) VALUES ${righe};`] },
      esercizi: [{ id: 'E1', difficolta: 1, traccia: 'Tutte le voci.', soluzioni: ['SELECT Id, Nome, Categoria FROM Voce;'] }],
    };
    await page.getByRole('button', { name: 'Scenari' }).click();
    await page.locator('textarea.area-json').fill(JSON.stringify(scenario));
    await page.getByRole('button', { name: 'Importa testo incollato' }).click();
    await expect(page.locator('.esito-import')).toContainText('importato');
    await page.locator('dialog .dialogo-testa button').click();
    await page.waitForFunction(() => window.__palestra?.stato.corrente?.nome === 'Catalogo grande' && !!window.__palestra?.stato.schemaDb);

    const pannello = await apriPannello(page, 'Dati');
    await expect(pannello.locator('.tabella-dati tbody tr')).toHaveCount(100);
    await expect(pannello.locator('.info-pagina')).toContainText('Righe 1–100 di 250 · pagina 1/3');
    await pannello.getByRole('button', { name: 'Pagina successiva' }).click();
    await expect(pannello.locator('.info-pagina')).toContainText('Righe 101–200 di 250');
    await expect(pannello.locator('.tabella-dati tbody tr').first().locator('td').nth(1)).toHaveText('101');
    await pannello.getByRole('button', { name: 'Ultima pagina' }).click();
    await expect(pannello.locator('.tabella-dati tbody tr')).toHaveCount(50);
    await expect(pannello.getByRole('button', { name: 'Pagina successiva' })).toBeDisabled();
    await pannello.getByRole('button', { name: 'Prima pagina' }).click();
    await expect(pannello.getByRole('button', { name: 'Pagina precedente' })).toBeDisabled();
    // la ricerca riparte dalla prima pagina
    await pannello.getByRole('searchbox').fill('Voce 24');
    await expect(pannello.locator('.info-pagina')).toContainText('di 11 (su 250)');
    await pannello.getByRole('searchbox').fill('null');
    await expect(pannello.locator('.info-pagina')).toContainText('di 50 (su 250)');
    await page.screenshot({ path: `${cartella}${test.info().project.name}-dati-grande.png` });
  });
});

test.describe('modifica 3: verifica su database di prova', () => {
  test('colonne in ordine diverso: corretta, con nota e «verificata su N database di prova»', async ({ page }) => {
    await apri(page);
    await vaiAEsercizio(page, 'E2');
    await scriviQuery(
      page,
      "SELECT d.Nome, d.Cognome, c.Nome FROM Corso c JOIN Docente d ON d.Matricola = c.Docente JOIN CorsoDiLaurea l ON l.Codice = c.CorsoDiLaurea WHERE l.Nome = 'Ingegneria Informatica' AND l.Livello = 'Triennale'",
    );
    await page.getByRole('button', { name: /Verifica/ }).click();
    const ok = page.locator('.messaggio-ok');
    await expect(ok).toContainText('Corretto');
    await expect(ok).toContainText('colonne in ordine diverso dalla traccia');
    await expect(ok).toContainText('Verificata su 6 database di prova');
    await page.screenshot({ path: `${cartella}${test.info().project.name}-verifica.png` });
  });

  test('forma equivalente diversa (EXISTS, 1.0): accettata', async ({ page }) => {
    await apri(page);
    await vaiAEsercizio(page, 'E6');
    await scriviQuery(
      page,
      'SELECT d.Matricola, d.Cognome, d.Nome FROM Docente d WHERE EXISTS (SELECT 1 FROM Corso c WHERE c.Docente = d.Matricola AND c.CFU * 1.0 > (SELECT SUM(CFU) * 1.0 / COUNT(*) FROM Corso))',
    );
    await page.getByRole('button', { name: /Verifica/ }).click();
    await expect(page.locator('.messaggio-ok')).toContainText('Verificata su 6 database di prova');
  });

  test('coincide solo sui dati attuali: segnalato senza rivelare la soluzione', async ({ page }) => {
    await apri(page);
    await vaiAEsercizio(page, 'E5');
    await scriviQuery(
      page,
      'SELECT s.Matricola, s.Cognome, COUNT(*), AVG(e.Voto) FROM Studente s JOIN Esame e ON e.Studente = s.Matricola WHERE s.Matricola IN (100009, 100003, 100001, 100014) GROUP BY s.Matricola, s.Cognome ORDER BY 4 DESC',
    );
    await page.getByRole('button', { name: /Esegui/ }).click();
    await expect(page.locator('.risultati-info')).toContainText('4 righe');
    await page.getByRole('button', { name: /Verifica/ }).click();
    const err = page.locator('.messaggio-errore');
    await expect(err).toContainText('Funziona sui dati attuali ma non in generale');
    await expect(err).toContainText('database di prova');
    await expect(err).not.toContainText('HAVING');
    await expect(page.locator('.chip', { hasText: 'E5' })).not.toHaveClass(/stato-risolto/);
  });
});
