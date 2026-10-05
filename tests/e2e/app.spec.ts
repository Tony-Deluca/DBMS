import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cartellaScreenshot = fileURLToPath(new URL('../../test-results/screenshot/', import.meta.url));
const largo = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

async function apri(page: Page) {
  await page.goto('./');
  await expect(page.locator('.chip')).toHaveCount(8);
  // il database dello scenario è pronto
  await page.waitForFunction(() => !!window.__palestra?.stato.schemaDb);
}

async function scriviQuery(page: Page, sql: string) {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(sql);
}

async function vaiAEsercizio(page: Page, id: string) {
  await page.locator('.chip', { hasText: id }).click();
  await expect(page.locator('.traccia-id')).toHaveText(id);
}

test.describe('Palestra SQL', () => {
  test('carica lo scenario di esempio e disegna ER e logico', async ({ page }) => {
    await apri(page);
    await page.locator('.scheda[data-id="er"]').click();
    const er = page.locator('section[aria-label="Modello ER"] svg.svg-er');
    await expect(er.locator('rect.er-entita')).toHaveCount(8);
    await expect(er.locator('polygon.er-rombo')).toHaveCount(7);
    await expect(er.locator('text.er-card').first()).toBeVisible();
    await page.screenshot({ path: `${cartellaScreenshot}${test.info().project.name}-er.png` });

    await page.locator('.scheda[data-id="logico"]').click();
    const log = page.locator('section[aria-label="Modello logico"] svg.svg-logico');
    await expect(log.locator('.log-tabella')).toHaveCount(7);
    await expect(log.locator('path.log-arco')).toHaveCount(9);
    await page.screenshot({ path: `${cartellaScreenshot}${test.info().project.name}-logico.png` });
    await page.locator('section[aria-label="Modello logico"] button.segmento', { hasText: 'Testo' }).click();
    await expect(page.locator('section[aria-label="Modello logico"] .schema-testuale')).toContainText('ESAME(Studente*');
  });

  test('esegue, verifica (corretta, alternativa, sbagliata) e blocca le modifiche', async ({ page }) => {
    await apri(page);
    await vaiAEsercizio(page, 'E1');

    // Esegui
    await scriviQuery(page, 'SELECT Matricola, Cognome, Nome FROM Studente WHERE AnnoIscrizione >= 2023 ORDER BY Cognome, Nome');
    await page.getByRole('button', { name: /Esegui/ }).click();
    await expect(page.locator('.risultati-info')).toContainText('8 righe · 3 colonne');
    await expect(page.locator('.area-risultati .tabella-risultati tbody tr')).toHaveCount(8);

    // Verifica corretta
    await page.getByRole('button', { name: /Verifica/ }).click();
    await expect(page.locator('.messaggio-ok')).toContainText('Corretto');
    await expect(page.locator('.chip', { hasText: 'E1' })).toHaveClass(/stato-risolto/);

    // Ordine sbagliato
    await scriviQuery(page, 'SELECT Matricola, Cognome, Nome FROM Studente WHERE AnnoIscrizione >= 2023 ORDER BY Cognome DESC');
    await page.getByRole('button', { name: /Verifica/ }).click();
    await expect(page.locator('.messaggio-errore')).toContainText("l'ordine non è quello richiesto");

    // Colonne diverse
    await scriviQuery(page, 'SELECT * FROM Studente WHERE AnnoIscrizione >= 2023 ORDER BY Cognome, Nome');
    await page.getByRole('button', { name: /Verifica/ }).click();
    await expect(page.locator('.messaggio-errore')).toContainText('3 colonne, la tua query ne restituisce 8');

    // E3: forma alternativa (EXISTS) e risposta con duplicati
    await vaiAEsercizio(page, 'E3');
    await scriviQuery(
      page,
      'SELECT Matricola, Cognome, Nome FROM Studente s WHERE EXISTS (SELECT * FROM Esame e, Corso c WHERE e.Corso = c.Codice AND e.Studente = s.Matricola AND e.Voto = 30 AND c.Anno = 1)',
    );
    await page.getByRole('button', { name: /Verifica/ }).click();
    await expect(page.locator('.messaggio-ok')).toBeVisible();
    await scriviQuery(page, 'SELECT s.Matricola, s.Cognome, s.Nome FROM Studente s JOIN Esame e ON e.Studente = s.Matricola JOIN Corso c ON c.Codice = e.Corso WHERE e.Voto = 30 AND c.Anno = 1');
    await page.getByRole('button', { name: /Verifica/ }).click();
    await expect(page.locator('.messaggio-errore')).toContainText('1 riga in più');

    // Righe mancanti (E7: NOT IN con NULL)
    await vaiAEsercizio(page, 'E7');
    await scriviQuery(page, 'SELECT Matricola, Cognome, Nome FROM Docente WHERE Matricola NOT IN (SELECT Docente FROM Corso)');
    await page.getByRole('button', { name: /Verifica/ }).click();
    await expect(page.locator('.messaggio-errore')).toContainText('Mancano 2 righe');

    // Modifiche bloccate
    await scriviQuery(page, 'DELETE FROM Esame');
    await page.getByRole('button', { name: /Esegui/ }).click();
    await expect(page.locator('.messaggio-errore')).toContainText('non consentita');

    // Errore SQL tradotto
    await scriviQuery(page, 'SELECT Nme FROM Studente');
    await page.getByRole('button', { name: /Esegui/ }).click();
    await expect(page.locator('.messaggio-errore')).toContainText('La colonna «Nme» non esiste');
  });

  test('scorciatoia da tastiera, virgolette tipografiche e barra scorciatoie', async ({ page }) => {
    await apri(page);
    await vaiAEsercizio(page, 'E2');
    await scriviQuery(page, 'SELECT Nome FROM Studente WHERE Citta = ‘Bari’');
    await expect(page.locator('.cm-content')).toContainText("Citta = 'Bari'");
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator('.risultati-info')).toContainText('8 righe');

    // barra scorciatoie: inserisce senza togliere il focus all'editor
    await scriviQuery(page, '');
    await page.locator('.barra-scorciatoie .tasto', { hasText: 'SELECT' }).click();
    await page.locator('.barra-scorciatoie .tasto', { hasText: /^\*$/ }).click();
    await expect(page.locator('.cm-content')).toContainText('SELECT *');
    await expect(page.locator('.cm-editor')).toHaveClass(/cm-focused/);
  });

  test('mostra la soluzione dopo conferma e salva la bozza', async ({ page }) => {
    await apri(page);
    await vaiAEsercizio(page, 'E8');
    await page.getByRole('button', { name: 'Mostra soluzione' }).click();
    await expect(page.locator('dialog')).toContainText('Vuoi arrenderti?');
    await page.locator('dialog').getByRole('button', { name: 'Mostra soluzione' }).click();
    await expect(page.locator('.area-soluzioni .soluzione')).toHaveCount(2);
    await expect(page.locator('.area-soluzioni')).toContainText('NOT EXISTS');

    await vaiAEsercizio(page, 'E5');
    await scriviQuery(page, 'SELECT 42');
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.locator('.chip')).toHaveCount(8);
    await vaiAEsercizio(page, 'E5');
    await expect(page.locator('.cm-content')).toContainText('SELECT 42');
  });

  test('importa uno scenario incollando il JSON (anche con il recinto ```json)', async ({ page }) => {
    await apri(page);
    const md = readFileSync(fileURLToPath(new URL('../../SCHEMA.md', import.meta.url)), 'utf-8');
    const json = [...md.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]).find((b) => b.includes('"esercizi"'))!;

    await page.getByRole('button', { name: 'Scenari' }).click();
    const area = page.locator('textarea.area-json');
    // JSON non valido: errore con riga e colonna
    await area.fill('{\n  "version": 1,\n  "metadati": { "titolo": "x", },\n}');
    await page.getByRole('button', { name: 'Importa testo incollato' }).click();
    await expect(page.locator('.esito-import')).toContainText('riga 3');
    // schema non valido: errore con il percorso del campo
    await area.fill('{"version": 1, "metadati": {"titolo": "x"}, "er": {"entita": []}, "logico": {"tabelle": []}, "database": {"statements": []}, "esercizi": []}');
    await page.getByRole('button', { name: 'Importa testo incollato' }).click();
    await expect(page.locator('.esito-import')).toContainText('er.entita');

    await area.fill(`Ecco il tuo scenario:\n\n\`\`\`json\n${json}\n\`\`\`\n\nBuono studio!`);
    await page.getByRole('button', { name: 'Importa testo incollato' }).click();
    await expect(page.locator('.esito-import')).toContainText('Scenario «Biblioteca (mini)» importato con 3 esercizi');
    await page.locator('dialog .dialogo-testa button').click();
    await expect(page.locator('.chip')).toHaveCount(3);
    await expect(page.locator('select.selettore-scenario')).toContainText('Biblioteca (mini)');

    await scriviQuery(page, 'SELECT Titolo, Anno FROM Libro WHERE Anno < 1980 ORDER BY 2');
    await page.getByRole('button', { name: /Verifica/ }).click();
    await expect(page.locator('.messaggio-ok')).toBeVisible();

    // resta salvato dopo il ricaricamento
    await page.reload();
    await expect(page.locator('.chip')).toHaveCount(3);
  });

  test('layout responsive: niente scroll orizzontale, pannello schema, bersagli ≥ 44 px', async ({ page }) => {
    await apri(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const pannello = page.locator('.pannello-schema');
    if (largo(page)) {
      await expect(pannello).toBeVisible();
      await expect(page.getByRole('button', { name: 'Schema', exact: true })).toBeHidden();
    } else {
      await expect(pannello).toBeHidden();
      await page.getByRole('button', { name: 'Schema', exact: true }).click();
      await expect(pannello).toBeVisible();
    }
    await pannello.getByRole('tab', { name: 'ER' }).click();
    await expect(pannello.locator('svg.svg-er rect.er-entita')).toHaveCount(8);
    await page.screenshot({ path: `${cartellaScreenshot}${test.info().project.name}-esercizi.png` });
    if (!largo(page)) await pannello.getByRole('button', { name: 'Chiudi pannello' }).click();

    // bersagli touch
    const piccoli = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('button, select, [role="tab"]')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue; // nascosto
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden') continue;
        if (r.width < 43.5 || r.height < 43.5) out.push(`${el.textContent?.trim() || el.getAttribute('aria-label')} ${r.width}x${r.height}`);
      }
      return out;
    });
    expect(piccoli).toEqual([]);

    // l'input dell'editor ha font ≥ 16px e niente autocorrezione
    const attr = await page.locator('.cm-content').evaluate((el) => ({
      font: parseFloat(getComputedStyle(el).fontSize),
      autocorrect: el.getAttribute('autocorrect'),
      autocapitalize: el.getAttribute('autocapitalize'),
      spellcheck: el.getAttribute('spellcheck'),
    }));
    expect(attr).toEqual({ font: 16, autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' });
  });

  test('tabella dei risultati larga: scorrimento orizzontale interno, testo non troncato', async ({ page }) => {
    await apri(page);
    await scriviQuery(page, 'SELECT * FROM Studente s JOIN CorsoDiLaurea l ON l.Codice = s.CorsoDiLaurea JOIN Esame e ON e.Studente = s.Matricola');
    await page.getByRole('button', { name: /Esegui/ }).click();
    const scroll = page.locator('.area-risultati .tabella-scroll');
    await expect(scroll).toBeVisible();
    const m = await scroll.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(m.sw).toBeGreaterThan(m.cw);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const troncate = await page.locator('.area-risultati .tabella-risultati td').evaluateAll((tds) =>
      tds.filter((td) => td.scrollWidth > td.clientWidth + 1 || getComputedStyle(td).textOverflow === 'ellipsis').length,
    );
    expect(troncate).toBe(0);
    await page.screenshot({ path: `${cartellaScreenshot}${test.info().project.name}-risultati.png` });
  });

  test('diagramma: zoom con rotellina e «adatta allo schermo»', async ({ page }) => {
    test.skip(test.info().project.name !== 'laptop', 'rotellina solo con il mouse');
    await apri(page);
    await page.locator('.scheda[data-id="er"]').click();
    const area = page.locator('section[aria-label="Modello ER"] .diagramma-area');
    const g = area.locator('svg > g');
    const prima = await g.getAttribute('transform');
    const box = (await area.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await expect.poll(() => g.getAttribute('transform')).not.toBe(prima);
    // trascinamento
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Adatta allo schermo' }).first().click();
    await expect.poll(() => g.getAttribute('transform')).toBe(prima);
  });

  test('funziona offline dopo il primo caricamento (service worker)', async ({ page, context }) => {
    await apri(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // aspetta che il precache sia completo
    await page.waitForFunction(async () => (await caches.keys()).length > 0 && (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).length))).some((n) => n >= 8));
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.chip')).toHaveCount(8);
    await page.waitForFunction(() => !!window.__palestra?.stato.schemaDb);
    await scriviQuery(page, 'SELECT COUNT(*) FROM Esame');
    await page.getByRole('button', { name: /Esegui/ }).click();
    await expect(page.locator('.area-risultati .tabella-risultati td').nth(1)).toHaveText('33');
    await context.setOffline(false);
  });
});

test('diagramma su touch: trascinamento con un dito e pinch con due dita', async ({ page }) => {
  test.skip(!test.info().project.name.startsWith('ipad'), 'solo viewport touch (Chromium)');
  await apri(page);
  await page.locator('.scheda[data-id="er"]').click();
  const area = page.locator('section[aria-label="Modello ER"] .diagramma-area');
  const g = area.locator('svg > g');
  const scala = async () => Number(/scale\(([\d.]+)\)/.exec((await g.getAttribute('transform')) ?? '')?.[1]);
  const trasla = async () => /translate\(([-\d.]+),([-\d.]+)\)/.exec((await g.getAttribute('transform')) ?? '')!.slice(1).map(Number);
  const box = (await area.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const tocca = (type: 'touchStart' | 'touchMove' | 'touchEnd', punti: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: punti.map((p, id) => ({ ...p, id })) });

  // un dito: trascina
  const [x0, y0] = await trasla();
  await tocca('touchStart', [{ x: cx, y: cy }]);
  for (let i = 1; i <= 5; i++) await tocca('touchMove', [{ x: cx + i * 20, y: cy + i * 10 }]);
  await tocca('touchEnd', []);
  const [x1, y1] = await trasla();
  expect(x1 - x0).toBeGreaterThan(60);
  expect(y1 - y0).toBeGreaterThan(30);

  // due dita: pinch per ingrandire
  const k0 = await scala();
  await tocca('touchStart', [{ x: cx - 40, y: cy }, { x: cx + 40, y: cy }]);
  for (let i = 1; i <= 6; i++) await tocca('touchMove', [{ x: cx - 40 - i * 15, y: cy }, { x: cx + 40 + i * 15, y: cy }]);
  await tocca('touchEnd', []);
  const k1 = await scala();
  expect(k1 / k0).toBeGreaterThan(1.8);
  // la pagina non si è zoomata né spostata
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
});

test('una query infinita viene interrotta e il database ricaricato', async ({ page }) => {
  test.skip(test.info().project.name !== 'laptop', 'basta una viewport');
  test.setTimeout(60_000);
  await apri(page);
  await scriviQuery(page, 'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT COUNT(*) FROM n');
  await page.getByRole('button', { name: /Esegui/ }).click();
  // l'interfaccia resta reattiva durante l'esecuzione
  await page.locator('.chip', { hasText: 'E2' }).click();
  await expect(page.locator('.traccia-id')).toHaveText('E2');
  await expect(page.locator('.messaggio-errore')).toContainText('Query interrotta', { timeout: 20_000 });
  await scriviQuery(page, 'SELECT COUNT(*) FROM Studente');
  await page.getByRole('button', { name: /Esegui/ }).click();
  await expect(page.locator('.area-risultati .tabella-risultati td').nth(1)).toHaveText('14');
});
