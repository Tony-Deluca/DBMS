import { test, expect, type Page } from '@playwright/test';

// Motore PostgreSQL (PGlite): avvio, query con ALL / ANY, verifica, evidenziazione di AVG, file scaricati.

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

test('avvio del motore, query con ALL e ANY in «Esegui» e «Verifica»', async ({ page }) => {
  const richieste: string[] = [];
  page.on('request', (r) => richieste.push(r.url()));
  const t0 = Date.now();
  await page.goto('./');
  await expect(page.locator('.chip')).toHaveCount(10);
  await page.waitForFunction(() => !!window.__palestra?.stato.schemaDb, null, { timeout: 30_000 });
  const avvio = Date.now() - t0;
  console.log(`[${test.info().project.name}] scenario pronto ${avvio} ms dopo l'apertura (motore PostgreSQL compreso)`);
  // la cartella dati arriva già pronta: initdb non si scarica
  expect(richieste.some((u) => /datadir.*\.gz/.test(u))).toBe(true);
  expect(richieste.some((u) => /initdb.*\.wasm/.test(u))).toBe(false);

  await vaiAEsercizio(page, 'E9');
  const conAll = 'SELECT s.Matricola, s.Cognome, AVG(e.Voto) AS Media FROM Studente s JOIN Esame e ON e.Studente = s.Matricola GROUP BY s.Matricola, s.Cognome HAVING AVG(e.Voto) >= ALL (SELECT AVG(Voto) FROM Esame GROUP BY Studente)';
  await scriviQuery(page, conAll);
  await page.getByRole('button', { name: /Esegui/ }).click();
  await expect(page.locator('.risultati-info')).toContainText('1 riga · 3 colonne');
  await expect(page.locator('.area-risultati .tabella-risultati thead')).toContainText('Media');
  await expect(page.locator('.area-risultati .tabella-risultati tbody')).toContainText('Fontana');
  await page.getByRole('button', { name: /Verifica/ }).click();
  await expect(page.locator('.messaggio-ok')).toContainText('Corretto');
  await expect(page.locator('.messaggio-ok')).toContainText(/database di prova/);

  // soluzione equivalente con MAX: corretta anche sui database di prova
  await scriviQuery(page, 'SELECT s.Matricola, s.Cognome, AVG(e.Voto) FROM Studente s JOIN Esame e ON e.Studente = s.Matricola GROUP BY s.Matricola, s.Cognome HAVING AVG(e.Voto) = (SELECT MAX(m) FROM (SELECT AVG(Voto) AS m FROM Esame GROUP BY Studente) t)');
  await page.getByRole('button', { name: /Verifica/ }).click();
  await expect(page.locator('.messaggio-ok')).toContainText('Corretto');

  // = ANY
  await vaiAEsercizio(page, 'E3');
  await scriviQuery(page, 'SELECT Matricola, Cognome, Nome FROM Studente WHERE Matricola = ANY (SELECT e.Studente FROM Esame e JOIN Corso c ON c.Codice = e.Corso WHERE e.Voto = 30 AND c.Anno = 1)');
  await page.getByRole('button', { name: /Verifica/ }).click();
  await expect(page.locator('.messaggio-ok')).toContainText('Corretto');

  // E10: > ALL e insieme vuoto; la versione con MAX coincide sui dati ma non in generale
  await vaiAEsercizio(page, 'E10');
  await scriviQuery(page, 'SELECT Codice, Nome, CFU FROM Corso WHERE CFU > (SELECT MAX(CFU) FROM Corso WHERE Anno = 2)');
  await page.getByRole('button', { name: /Verifica/ }).click();
  await expect(page.locator('.messaggio-errore')).toContainText('Funziona sui dati attuali ma non in generale');

  // errore in italiano con posizione
  await scriviQuery(page, 'SELECT Nme FROM Corso');
  await page.getByRole('button', { name: /Esegui/ }).click();
  await expect(page.locator('.messaggio-errore')).toContainText('La colonna «Nme» non esiste');
  await expect(page.locator('.messaggio-errore')).toContainText('riga 1, colonna 8');
});

test('AVG è colorato come le altre funzioni e proposto dall\'autocompletamento', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.chip')).toHaveCount(10);
  await scriviQuery(page, 'SELECT COUNT(*), avg(Voto) FROM Esame WHERE Voto >= ALL (SELECT Voto FROM Esame)');
  await expect(page.locator('.cm-content .tok-fn', { hasText: /^avg$/ })).toHaveCount(1);
  await expect(page.locator('.cm-content .tok-fn', { hasText: /^COUNT$/ })).toHaveCount(1);
  await expect(page.locator('.cm-content .tok-kw', { hasText: /^ALL$/ })).toHaveCount(1);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' AND Voto > av');
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete li', { hasText: /^AVG/ })).toBeVisible();
});
