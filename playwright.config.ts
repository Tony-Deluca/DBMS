import { defineConfig, devices } from '@playwright/test';

// I test girano sulla build (npm run build) servita sotto /Cluade/, come su GitHub Pages.
// WebKit (motore di Safari) si attiva con PW_WEBKIT=1 dove è installato.
const base = 'http://localhost:4173/Cluade/';

const ipadOrizzontale = { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const ipadVerticale = { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const uaIpad =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const progetti = [
  { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
  { name: 'ipad-orizzontale', use: { ...devices['Desktop Chrome'], ...ipadOrizzontale, userAgent: uaIpad } },
  { name: 'ipad-verticale', use: { ...devices['Desktop Chrome'], ...ipadVerticale, userAgent: uaIpad } },
];
if (process.env.PW_WEBKIT) {
  progetti.push(
    { name: 'webkit-ipad-orizzontale', use: { ...devices['Desktop Safari'], ...ipadOrizzontale, userAgent: uaIpad } },
    { name: 'webkit-ipad-verticale', use: { ...devices['Desktop Safari'], ...ipadVerticale, userAgent: uaIpad } },
  );
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: base,
    serviceWorkers: 'allow',
    screenshot: 'only-on-failure',
  },
  projects: progetti,
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: base,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
