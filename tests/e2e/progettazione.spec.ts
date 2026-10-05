import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Sezione «Progettazione»: editor ER e logico, pannelli affiancati, Presentazione, esportazione PNG.
const cartella = fileURLToPath(new URL('../../test-results/screenshot/', import.meta.url));
const largo = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const touch = (page: Page) => page.evaluate(() => 'ontouchstart' in window);

async function apriProgettazione(page: Page) {
  await page.goto('./');
  await page.getByRole('tab', { name: 'Progettazione' }).click();
  await page.waitForFunction(() => !!window.__palestra?.progettazione.corrente);
}

/** Su iPad verticale si sceglie la parte con le schede; su schermo largo con il selettore del pannello sinistro. */
async function mostra(page: Page, pannello: 'Traccia' | 'Schema ER' | 'ER ristrutturato' | 'Note' | 'Schema logico') {
  if (largo(page)) await page.getByLabel('Pannello di sinistra').selectOption({ label: pannello });
  else await page.locator('.scheda-pannello', { hasText: new RegExp(`^${pannello}$`) }).click();
}

const editorER = (page: Page) => page.locator('.pg-editor', { has: page.locator('svg[aria-label="Schema ER"]') });
const editorLogico = (page: Page) => page.locator('.pg-editor-logico');

/** Coordinate sullo schermo del centro di un'entità o relazione dello schema ER. */
async function puntoER(page: Page, nome: string): Promise<{ x: number; y: number }> {
  return page.evaluate((nome) => {
    const p = window.__palestra!.progettazione.corrente!;
    const e = [...p.er.entita, ...p.er.relazioni].find((x) => x.nome === nome)!;
    const g = document.querySelector('svg[aria-label="Schema ER"] > g') as SVGGElement;
    const m = g.getScreenCTM()!;
    return { x: m.a * e.x + m.e, y: m.d * e.y + m.f };
  }, nome);
}

async function tocca(page: Page, p: { x: number; y: number }) {
  if (await touch(page)) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

async function trascina(page: Page, da: { x: number; y: number }, a: { x: number; y: number }) {
  await page.mouse.move(da.x, da.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(da.x + ((a.x - da.x) * i) / 8, da.y + ((a.y - da.y) * i) / 8);
  await page.mouse.up();
}

const progetto = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__palestra!.progettazione.corrente)));

async function nuovoProgetto(page: Page) {
  await page.getByRole('button', { name: '+ Nuovo' }).click();
  await expect.poll(async () => (await progetto(page)).er.entita.length).toBe(0);
  await mostra(page, 'Schema ER');
}

test.describe('Progettazione', () => {
  test('crea entità, attributi e relazione; cardinalità; annulla e ripeti', async ({ page }) => {
    await apriProgettazione(page);
    await nuovoProgetto(page);
    const er = editorER(page);

    await er.getByRole('button', { name: 'Entità', exact: true }).click();
    await er.getByLabel('Nome dell\'entità').fill('STUDENTE');
    await er.getByRole('button', { name: 'Attributo', exact: true }).click();
    await er.getByLabel('Nome dell\'attributo').fill('Matricola');
    await er.locator('.pg-attr .pg-chip', { hasText: 'Id' }).click();

    await er.getByRole('button', { name: 'Entità', exact: true }).click();
    await er.getByLabel('Nome dell\'entità').fill('CORSO');
    // la nuova entità nasce al centro: la si sposta trascinandola
    const c = await puntoER(page, 'CORSO');
    await trascina(page, c, { x: c.x + 220, y: c.y + 10 });
    await expect.poll(async () => (await progetto(page)).er.entita[1].x - (await progetto(page)).er.entita[0].x).toBeGreaterThan(120);

    // strumento «Collega»: due tocchi, si crea la relazione in mezzo
    await er.getByRole('button', { name: 'Collega', exact: true }).click();
    await tocca(page, await puntoER(page, 'STUDENTE'));
    await tocca(page, await puntoER(page, 'CORSO'));
    await expect.poll(async () => (await progetto(page)).er.relazioni.length).toBe(1);
    await er.getByLabel('Nome della relazione').fill('ESAME');
    await er.locator('.pg-partecipazione').first().getByRole('button', { name: '(0,N)' }).click();

    let p = await progetto(page);
    expect(p.er.entita.map((e: { nome: string }) => e.nome)).toEqual(['STUDENTE', 'CORSO']);
    expect(p.er.entita[0].attributi[0]).toMatchObject({ nome: 'Matricola', identificatore: true });
    expect(p.er.relazioni[0].nome).toBe('ESAME');
    expect(p.er.relazioni[0].partecipazioni[0].cardinalita).toBe('(0,N)');

    // annulla / ripeti da tastiera (fuori dai campi di testo) e con i pulsanti
    await er.getByRole('button', { name: 'Seleziona', exact: true }).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await progetto(page)).er.relazioni[0].partecipazioni[0].cardinalita).toBeNull();
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(async () => (await progetto(page)).er.relazioni[0].partecipazioni[0].cardinalita).toBe('(0,N)');
    await er.getByRole('button', { name: 'Annulla (Ctrl/⌘+Z)' }).click();
    await expect.poll(async () => (await progetto(page)).er.relazioni[0].partecipazioni[0].cardinalita).toBeNull();
    await er.getByRole('button', { name: /^Ripeti/ }).click();
    await expect.poll(async () => (await progetto(page)).er.relazioni[0].partecipazioni[0].cardinalita).toBe('(0,N)');

    // controlli di coerenza su richiesta: CORSO senza identificatore
    await er.getByRole('button', { name: 'Controlli' }).click();
    await expect(er.locator('.pg-segnalazione', { hasText: 'CORSO' }).first()).toBeVisible();

    // salvataggio automatico: dopo il ricaricamento il progetto c'è ancora
    const id = p.id;
    await page.waitForTimeout(700);
    await page.reload();
    await page.getByRole('tab', { name: 'Progettazione' }).click();
    await page.waitForFunction(() => !!window.__palestra?.progettazione.corrente);
    p = await progetto(page);
    expect(p.id).toBe(id);
    expect(p.er.relazioni[0].nome).toBe('ESAME');
  });

  test('schema logico: testo ↔ diagramma, errori di sintassi senza perdere il testo', async ({ page }) => {
    await apriProgettazione(page);
    await nuovoProgetto(page);
    await mostra(page, 'Schema logico');
    const log = editorLogico(page);
    await log.getByRole('button', { name: 'Scrivi', exact: true }).click();
    const area = log.getByLabel('Schema logico in notazione testuale');
    await area.fill('Studente(_Matricola_, Nome, Città*\nEsame(_Studente_, Voto)');
    await log.getByRole('button', { name: 'Aggiorna il diagramma' }).click();
    await expect(log.locator('.messaggio-errore')).toContainText('Riga 1');
    await expect(area).toHaveValue(/Città\*\nEsame/);
    expect((await progetto(page)).logico.tabelle).toHaveLength(0);

    await area.fill('Studente(_Matricola_, Nome, Città*)\nEsame(_Studente_, Voto)\n\nEsame.Studente → Studente.Matricola');
    await log.getByRole('button', { name: 'Aggiorna il diagramma' }).click();
    await expect(log.locator('.pg-errori-testo .pg-ok')).toBeVisible();
    const l = (await progetto(page)).logico;
    expect(l.tabelle.map((t: { nome: string }) => t.nome)).toEqual(['Studente', 'Esame']);
    expect(l.tabelle[0].colonne[2]).toMatchObject({ nome: 'Città', facoltativa: true, pk: false });
    expect(l.tabelle[1].chiaviEsterne[0]).toMatchObject({ colonne: ['Studente'], tabella: 'Studente', riferimenti: ['Matricola'] });

    await log.getByRole('button', { name: 'Notazione' }).click();
    await expect(log.locator('.pg-notazione u', { hasText: 'Matricola' })).toBeVisible();
    await expect(log.locator('.pg-vincoli')).toContainText('Esame.Studente → Studente.Matricola');
    await log.getByRole('button', { name: 'Diagramma' }).click();
    await expect(log.locator('.log-box')).toHaveCount(2);
  });

  test('pannelli affiancati su schermo largo, schede su iPad verticale', async ({ page }) => {
    await apriProgettazione(page);
    const colonne = page.locator('.pg-colonna');
    if (largo(page)) {
      await expect(colonne.nth(0)).toBeVisible();
      await expect(colonne.nth(1)).toBeVisible();
      await expect(page.locator('.pg-schede')).toBeHidden();
      await expect(page.getByLabel('Pannello di sinistra')).toHaveValue('er');
      await expect(page.getByLabel('Pannello di destra')).toHaveValue('logico');
      await page.getByLabel('Pannello di destra').selectOption('erR');
      await expect(page.locator('svg[aria-label="Schema ER ristrutturato"]')).toBeVisible();
      await expect(page.locator('svg[aria-label="Schema ER"]')).toBeVisible();
      // stesso contenuto nei due pannelli: si scambiano
      await page.getByLabel('Pannello di sinistra').selectOption('erR');
      await expect(page.getByLabel('Pannello di destra')).toHaveValue('er');
    } else {
      await expect(page.locator('.pg-schede')).toBeVisible();
      await expect(colonne.nth(1)).toBeHidden();
      await mostra(page, 'Traccia');
      await expect(page.getByLabel('Traccia dell\'esercizio')).toBeVisible();
      await mostra(page, 'Schema logico');
      await expect(editorLogico(page)).toBeVisible();
    }
    await mostra(page, 'Schema ER');
    await page.waitForTimeout(300);
    mkdirSync(cartella, { recursive: true });
    await page.screenshot({ path: `${cartella}progettazione-${test.info().project.name}.png` });

    // niente scorrimento orizzontale della pagina, controlli ≥ 44px, campi ≥ 16px
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const piccoli = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.progettazione button, .progettazione select, .progettazione input')]
        .filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden')
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
        .map(({ e, r }) => `${e.tagName} «${e.textContent?.trim() || e.getAttribute('aria-label')}» ${Math.round(r.width)}×${Math.round(r.height)}`),
    );
    expect(piccoli).toEqual([]);
    const fontPiccoli = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.progettazione input, .progettazione select, .progettazione textarea')]
        .filter((e) => e.getClientRects().length > 0 && parseFloat(getComputedStyle(e).fontSize) < 16)
        .map((e) => e.getAttribute('aria-label')),
    );
    expect(fontPiccoli).toEqual([]);
  });

  test('Presentazione: solo gli schemi, senza controlli', async ({ page }) => {
    await apriProgettazione(page);
    await page.getByRole('button', { name: 'Presentazione' }).click();
    const pres = page.locator('.presentazione');
    await expect(pres).toBeVisible();
    await expect(pres.locator('h1')).toHaveText('Università (esempio)');
    await expect(pres.locator('.pres-figura svg')).toHaveCount(3);
    await expect(pres.locator('h2', { hasText: 'Schema ER ristrutturato' })).toBeVisible();
    await expect(pres.locator('.pres-notazione u').first()).toBeVisible();
    await expect(pres.locator('button, select, input, textarea')).toHaveCount(1); // solo «esci»
    // copre tutta la pagina: i controlli dell'editor non sono raggiungibili
    const copre = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return !!el?.closest('.presentazione');
    });
    expect(copre).toBe(true);
    // tema chiaro forzato per lo screenshot
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.presentazione')!).backgroundColor)).toBe('rgb(255, 255, 255)');
    await page.screenshot({ path: `${cartella}presentazione-${test.info().project.name}.png` });
    if (await touch(page)) await page.getByRole('button', { name: 'Esci dalla presentazione' }).tap();
    else await page.keyboard.press('Escape');
    await expect(pres).toHaveCount(0);
  });

  test('esportazione PNG ad alta risoluzione e SVG', async ({ page }) => {
    await apriProgettazione(page);
    await mostra(page, 'Schema ER');
    const er = editorER(page);
    await er.getByRole('button', { name: 'Altre azioni' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /PNG/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const png = readFileSync((await download.path())!);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const larghezza = png.readUInt32BE(16);
    const altezza = png.readUInt32BE(20);
    expect(larghezza).toBeGreaterThan(1500); // scala ×3
    expect(altezza).toBeGreaterThan(600);

    await er.getByRole('button', { name: 'Altre azioni' }).click();
    const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /SVG/ }).click()]);
    const testo = readFileSync((await svg.path())!, 'utf8');
    expect(testo.startsWith('<svg')).toBe(true);
    expect(testo).toContain('STUDENTE');
  });

  test('Copia per l\'IA: testo completo e leggibile', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    await apriProgettazione(page);
    await page.getByRole('button', { name: 'Copia per l\'IA' }).click();
    const area = page.getByLabel('Descrizione del progetto per l\'IA');
    await expect(area).toBeVisible();
    const testo = await area.inputValue();
    for (const parte of ['TRACCIA', '1. SCHEMA CONCETTUALE (ER)', '2. SCHEMA ER RISTRUTTURATO', '3. SCHEMA LOGICO RELAZIONALE', 'STUDENTE', 'Esame.Studente → Studente.Matricola']) {
      expect(testo).toContain(parte);
    }
  });

  test('«Apri in Progettazione» da uno scenario', async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => !!window.__palestra?.stato.corrente);
    await page.getByRole('button', { name: 'Scenari', exact: true }).click();
    await page.getByRole('button', { name: 'Apri in Progettazione' }).first().click();
    await expect(page.getByRole('tab', { name: 'Progettazione' })).toHaveAttribute('aria-selected', 'true');
    await page.waitForFunction(() => (window.__palestra?.progettazione.corrente?.er.entita.length ?? 0) > 0);
    const p = await progetto(page);
    expect(p.logico.tabelle.length).toBeGreaterThan(0);
    expect(p.er.relazioni.length).toBeGreaterThan(0);
  });

  test('gesti touch: trascinamento con un dito, pinch, pressione prolungata', async ({ page }) => {
    test.skip(!test.info().project.name.includes('ipad'), 'solo iPad');
    await apriProgettazione(page);
    await mostra(page, 'Schema ER');
    const cdp = await page.context().newCDPSession(page);
    const tocchi = async (type: 'touchStart' | 'touchMove' | 'touchEnd', punti: { x: number; y: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: punti.map((p, i) => ({ ...p, id: i })) });

    // un dito su un'entità la sposta
    const prima = (await progetto(page)).er.entita.find((e: { nome: string }) => e.nome === 'DIPARTIMENTO');
    const p = await puntoER(page, 'DIPARTIMENTO');
    await tocchi('touchStart', [p]);
    for (let i = 1; i <= 6; i++) await tocchi('touchMove', [{ x: p.x + i * 8, y: p.y + i * 6 }]);
    await tocchi('touchEnd', []);
    const dopo = (await progetto(page)).er.entita.find((e: { nome: string }) => e.nome === 'DIPARTIMENTO');
    expect(dopo.x).toBeGreaterThan(prima.x + 10);
    expect(dopo.y).toBeGreaterThan(prima.y + 5);

    // pressione prolungata: menu contestuale
    const q = await puntoER(page, 'CORSO');
    await tocchi('touchStart', [q]);
    await page.waitForTimeout(800);
    await tocchi('touchEnd', []);
    await expect(page.locator('.pg-menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Aggiungi attributo' })).toBeVisible();
    await page.keyboard.press('Escape');
    await tocchi('touchStart', [{ x: 5, y: 5 }]);
    await tocchi('touchEnd', []);

    // due dita: zoom
    const scala = () => page.evaluate(() => (document.querySelector('svg[aria-label="Schema ER"] > g') as SVGGElement).getScreenCTM()!.a);
    const k0 = await scala();
    const area = (await page.locator('svg[aria-label="Schema ER"]').boundingBox())!;
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    await tocchi('touchStart', [{ x: cx - 40, y: cy }, { x: cx + 40, y: cy }]);
    for (let i = 1; i <= 6; i++) await tocchi('touchMove', [{ x: cx - 40 - i * 12, y: cy }, { x: cx + 40 + i * 12, y: cy }]);
    await tocchi('touchEnd', []);
    expect(await scala()).toBeGreaterThan(k0 * 1.3);
  });
});

