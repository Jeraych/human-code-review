import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const root = resolve(import.meta.dirname, '..'),
  qa = resolve(root, 'qa/v2');
mkdirSync(qa, { recursive: true });
const children = [],
  checks = [],
  errors = [],
  access = 'fixture-' + crypto.randomUUID();
function check(label, ok) {
  assert.ok(ok, label);
  checks.push(label);
}
function start(args, env = {}) {
  const c = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: 'ignore',
  });
  children.push(c);
  return c;
}
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server failed to start: ' + url);
}
let browser, occupied;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  const env = {
    PORT: '18788',
    APP_BASE_PATH: '/demo',
    STUDY_ACCESS_CODE: access,
    STUDY_DB_PATH: resolve(qa, `integration-${Date.now()}.sqlite`),
  };
  const service = start(['server/api.ts'], env);
  await ready('http://127.0.0.1:18788/demo/api/health');
  await page.goto('http://127.0.0.1:18788/demo/#play');
  await page.getByRole('button', { name: 'Choose implementation A' }).waitFor();
  await page.getByRole('checkbox', { name: 'Play without storing new responses' }).check();
  check('Production direct Play works beneath /demo/', true);
  check(
    'Subdirectory mobile Play stays within viewport',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.getByRole('button', { name: 'Equal', exact: true }).click();
  await page.getByRole('heading', { name: 'The reveal' }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Choose implementation A' }).waitFor();
  check(
    'Subdirectory hash refresh works with relative assets',
    (await page.locator('.shiki').count()) > 0,
  );
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByLabel('Study access code').fill(access);
  await page.getByRole('button', { name: 'Open study', exact: true }).click();
  await page.getByRole('button', { name: 'Start Calibration', exact: true }).waitFor();
  check('Subdirectory login/cookie/API work without root-path rewrites', true);
  const requests = page.context().request,
    state = await requests.get('http://127.0.0.1:18788/demo/api/state').then((r) => r.json());
  state.calibration.guideline =
    'Fixture persistence check only; no calibration or formal responses were started.';
  check(
    'Revision write accepted',
    (
      await requests.put('http://127.0.0.1:18788/demo/api/state', {
        data: { expectedRevision: state.revision, state },
      })
    ).ok(),
  );
  service.kill();
  await new Promise((r) => service.once('exit', r));
  start(['server/api.ts'], env);
  await ready('http://127.0.0.1:18788/demo/api/health');
  const login = await requests.post('http://127.0.0.1:18788/demo/api/login', {
    data: { code: access },
  });
  check('Re-login after service restart works', login.ok());
  const restored = await requests
    .get('http://127.0.0.1:18788/demo/api/state')
    .then((r) => r.json());
  check(
    'SQLite state survives real service restart',
    restored.calibration.guideline === state.calibration.guideline &&
      restored.revision === 1 &&
      restored.answers.length === 0,
  );
  // Verify actual preview/dev commands on isolated ports; no Study or Play responses stored.
  start([
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '18789',
    '--strictPort',
  ]);
  await ready('http://127.0.0.1:18789/');
  await page.goto('http://127.0.0.1:18789/#home');
  await page.locator('.home-play:not([disabled])').waitFor();
  check('Production preview serves the built V2 app', true);
  start([
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '18790',
    '--strictPort',
  ]);
  await ready('http://127.0.0.1:18790/');
  await page.goto('http://127.0.0.1:18790/#play');
  await page.getByRole('button', { name: 'Choose implementation A' }).waitFor();
  await page.getByRole('checkbox', { name: 'Play without storing new responses' }).check();
  check(
    'Local dev serves V2 and shared comparison component',
    (await page.locator('.code-panel').count()) === 2,
  );
  // Test the intended Windows launcher using an ignored environment and separate QA DB.
  const envFile = resolve(qa, 'fixture-launch.env');
  writeFileSync(
    envFile,
    `STUDY_ACCESS_CODE=${access}\nSTUDY_DB_PATH=${resolve(qa, 'fixture-launch-' + Date.now() + '.sqlite').replaceAll('\\', '/')}\n`,
  );
  const launched = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      'scripts/launch.ps1',
      '-NoBrowser',
      '-Port',
      '18791',
      '-EnvironmentFile',
      'qa/v2/fixture-launch.env',
      '-RuntimeDirectory',
      'qa/v2/launcher-runtime',
    ],
    { cwd: root, windowsHide: true, encoding: 'utf8', stdio: 'ignore', timeout: 15000 },
  );
  check('Windows launcher starts hidden service with isolated environment', launched.status === 0);
  await ready('http://127.0.0.1:18791/api/health');
  const reuse = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      'scripts/launch.ps1',
      '-CheckOnly',
      '-NoBrowser',
      '-Port',
      '18791',
    ],
    { cwd: root, windowsHide: true, encoding: 'utf8', stdio: 'ignore', timeout: 15000 },
  );
  check('Launcher reuses verified V2 service', reuse.status === 0);
  const launchedPid = Number(
    readFileSync(resolve(root, 'qa/v2/launcher-runtime/server.pid'), 'utf8').trim(),
  );
  process.kill(launchedPid);
  occupied = createServer((req, res) => res.end('unrelated application'));
  await new Promise((r) => occupied.listen(18792, '127.0.0.1', r));
  const refusal = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      'scripts/launch.ps1',
      '-NoBrowser',
      '-Port',
      '18792',
    ],
    { cwd: root, windowsHide: true, encoding: 'utf8', stdio: 'ignore', timeout: 15000 },
  );
  check('Launcher refuses occupied unrelated port', refusal.status !== 0);
  await new Promise((r) => occupied.close(r));
  occupied = createServer((req, res) => {
    if (req.url === '/api/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ protocolVersion: 'human-validation-v2' }));
    } else res.end('<meta name="application-name" content="Human Code Evaluation">');
  });
  await new Promise((r) => occupied.listen(18792, '127.0.0.1', r));
  const stale = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      'scripts/launch.ps1',
      '-CheckOnly',
      '-NoBrowser',
      '-Port',
      '18792',
    ],
    { cwd: root, windowsHide: true, stdio: 'ignore', timeout: 15000 },
  );
  check('Launcher refuses an older V2 workflow service without replacing it', stale.status !== 0);
  check('Integration has no browser runtime errors', errors.length === 0);
  writeFileSync(
    resolve(qa, 'integration-verification.json'),
    JSON.stringify({ checks, errors, fixtureOnly: true }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
} finally {
  await browser?.close();
  for (const c of children) c.kill();
  if (occupied) await new Promise((r) => occupied.close(r));
}
