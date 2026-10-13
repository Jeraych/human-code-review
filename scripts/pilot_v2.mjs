// Isolated QA only. Fixture responses never touch the normal .runtime Study DB.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import {
  initialProtocol,
  lockCalibration,
  generateFormal,
  submitFormal,
  DEFAULT_CONFIG,
  workload,
} from '../src/v2.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const root = resolve(import.meta.dirname, '..'),
  qa = resolve(root, 'qa/v2');
mkdirSync(qa, { recursive: true });
const db = JSON.parse(readFileSync(resolve(root, 'public/v2/catalog.json'), 'utf8'));
const checks = [],
  errors = [];
function check(label, condition) {
  assert.ok(condition, label);
  checks.push(label);
}
const access = 'fixture-' + crypto.randomUUID();
const official = workload(DEFAULT_CONFIG);
const port = 18787;
const child = spawn(process.execPath, ['server/api.ts'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    STUDY_ACCESS_CODE: access,
    STUDY_DB_PATH: resolve(qa, `fixture-${Date.now()}.sqlite`),
  },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
child.stdout.on('data', (b) => (serverOutput += b.toString()));
child.stderr.on('data', (b) => (serverOutput += b.toString()));
const url = `http://127.0.0.1:${port}`;
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url + '/api/health')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const health = await fetch(url + '/api/health');
  check('API starts with real frozen catalog', health.ok);
  const unauth = await fetch(url + '/api/state');
  check('Study API requires access code', unauth.status === 401);
  browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.locator('.home-play:not([disabled])').waitFor();
  check(
    'Play-first home preserved',
    await page.getByRole('button', { name: 'Enter Study' }).isVisible(),
  );
  await page.screenshot({ path: resolve(qa, 'home-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    'Mobile home has no overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.screenshot({ path: resolve(qa, 'home-mobile.png'), fullPage: true });
  await page.locator('.home-play').click();
  await page.getByRole('checkbox', { name: 'Play without storing new responses' }).check();
  check(
    'Mobile Play playlist has no overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  check(
    'Play hides output identities before choice',
    await page
      .locator('.code-heading')
      .innerText()
      .catch(() => page.locator('.code-heading').first().innerText())
      .then((t) => !t.includes('trained')),
  );
  await page.getByRole('button', { name: 'Choose implementation A' }).click();
  await page.getByRole('heading', { name: 'The reveal' }).waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'reveal-title');
  check('Play reveal receives keyboard focus', true);
  check(
    'Opt-out Play reveals after guarded direct choice',
    await page.locator('.play-reveal').isVisible(),
  );
  await page.screenshot({ path: resolve(qa, 'play-mobile.png'), fullPage: true });
  check(
    'Opt-out produces no stored anonymous response',
    await page.evaluate(() => localStorage.getItem('code-choice.play-v2-pending') === null),
  );
  await page.getByRole('button', { name: 'Next round' }).click();
  await page.getByRole('button', { name: 'Equal', exact: true }).click();
  check(
    'Equal reveal is scientific',
    await page.getByText(/For you, this training difference/).isVisible(),
  );
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByLabel('Study access code').fill(access);
  await page.getByRole('button', { name: 'Enter Study', exact: true }).click();
  await page.getByRole('button', { name: 'Joint Calibration', exact: true }).waitFor();
  check(
    'Study unlocks without account or manual JSON',
    await page.getByRole('button', { name: 'Joint Calibration', exact: true }).isEnabled(),
  );
  await page.getByRole('button', { name: 'Joint Calibration', exact: true }).click();
  await page.getByRole('button', { name: 'Equal', exact: true }).click();
  check(
    'Calibration selection alone does not submit',
    await page
      .getByText(`Jacky + Conrad · 0 / ${official.calibration} · Separate from Formal`, {
        exact: true,
      })
      .isVisible(),
  );
  await page.getByRole('button', { name: 'Submit choice', exact: true }).click();
  await page.getByRole('button', { name: 'Next calibration comparison' }).waitFor();
  for (let i = 1; i < official.calibration; i++) {
    await page.getByRole('button', { name: 'Next calibration comparison' }).click();
    await page.getByRole('button', { name: 'Equal', exact: true }).click();
    await page.getByRole('button', { name: 'Submit choice', exact: true }).click();
    await page.getByRole('button', { name: 'Next calibration comparison' }).waitFor();
  }
  await page
    .getByLabel('Reviewer guideline')
    .fill(
      'Fixture QA guideline: prefer meaningful readability and maintainability differences; choose Equal when neither is preferable.',
    );
  await page.getByRole('button', { name: 'Lock Calibration', exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.calibration
        .lockedAt,
  );
  check('Calibration locks guideline after exactly 12 fixture responses', true);
  await page.getByRole('button', { name: 'Exit Study', exact: true }).click();
  await page.getByRole('button', { name: 'Researcher', exact: true }).click();
  await page.getByRole('button', { name: 'Generate / Lock Formal V2' }).click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.formal,
  );
  const protocol = await context.request.get(url + '/api/state').then((r) => r.json());
  check(
    'Hosted Formal assignments are 48/48 and 16 overlap',
    protocol.formal.assignments.Jacky.length === official.Jacky &&
      protocol.formal.assignments.Conrad.length === official.Conrad &&
      protocol.formal.overlap.length === official.overlap,
  );
  check(
    'Results cannot unblind early',
    await page.getByRole('button', { name: 'Unblind & Analyse' }).isDisabled(),
  );
  await page.getByRole('button', { name: 'Study Home', exact: true }).click();
  await page.getByRole('button', { name: 'Conrad', exact: true }).click();
  check(
    'Wrong reviewer can reverse before submitting',
    await page.getByRole('button', { name: '← Choose another reviewer' }).isVisible(),
  );
  await page.getByRole('button', { name: '← Choose another reviewer' }).click();
  const unchanged = await context.request.get(url + '/api/state').then((r) => r.json());
  check(
    'Selecting/backing out of reviewer has no persistence side effect',
    unchanged.revision === protocol.revision,
  );
  await page.getByRole('button', { name: 'Jacky', exact: true }).click();
  await page.getByRole('button', { name: 'Continue as Jacky' }).click();
  check(
    'Formal identity always visible',
    await page.getByText('Reviewer: Jacky', { exact: true }).isVisible(),
  );
  const formalText = await page.locator('main').innerText();
  check(
    'Formal hides conditions/metrics/other reviewer/results',
    !/Conrad|Style-trained|Judge-trained|Pretrained Base|Ruff|reward|seed|run\s*3[0-9]/i.test(
      formalText,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: resolve(qa, 'formal-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    'Mobile Formal has no page overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.screenshot({ path: resolve(qa, 'formal-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'B', exact: true }).click();
  check(
    'Formal choice waits for Submit',
    await page.getByText(`Formal V2 · 0 / ${official.Jacky}`, { exact: true }).isVisible(),
  );
  await page.getByRole('button', { name: 'Submit choice', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Submit choice', exact: true }).waitFor();
  check(
    'Undo retains audit and removes active completion',
    await page.getByText(`Formal V2 · 0 / ${official.Jacky}`, { exact: true }).isVisible(),
  );
  await page.getByRole('button', { name: 'Equal', exact: true }).click();
  await page.getByRole('button', { name: 'Submit choice', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  check(
    'Older answer has no normal edit control',
    (await page.getByRole('button', { name: 'Undo', exact: true }).count()) === 0,
  );
  const saved = await context.request.get(url + '/api/state').then((r) => r.json());
  await page.getByRole('button', { name: 'Exit Study', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByLabel('Study access code').fill(access);
  await page.getByRole('button', { name: 'Enter Study', exact: true }).click();
  await page.getByRole('button', { name: 'Jacky', exact: true }).click();
  check(
    'Browser refresh resumes own exact completion',
    await page.getByText(`Formal progress: 1 / ${official.Jacky}`, { exact: true }).isVisible(),
  );
  // A fresh isolated browser models a reasonable device change via the shared backend.
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto(url + '/#study');
  await second.getByLabel('Study access code').fill(access);
  await second.getByRole('button', { name: 'Enter Study', exact: true }).click();
  await second.getByRole('button', { name: 'Jacky', exact: true }).click();
  check(
    'Fresh device resumes without JSON transfer',
    await second.getByText(`Formal progress: 1 / ${official.Jacky}`, { exact: true }).isVisible(),
  );
  const stale = await context.request.put(url + '/api/state', {
    data: { expectedRevision: 0, state: saved },
  });
  check('Stale hosted writes rejected without overwrite', stale.status() === 409);
  const before = await context.request.get(url + '/api/state').then((r) => r.json());
  const tampered = structuredClone(before);
  tampered.formal.assignments.Jacky.reverse();
  const rejected = await context.request.put(url + '/api/state', {
    data: { expectedRevision: before.revision, state: tampered },
  });
  check('Server rejects assignment regeneration', rejected.status() === 400);
  // Offline fallback on this browser keeps the same protocol and cached verifier.
  await page.route('**/api/**', (route) => route.abort());
  await page.reload();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByLabel('Study access code').fill(access);
  await page.getByRole('button', { name: 'Enter Study', exact: true }).click();
  await page.getByRole('button', { name: 'Jacky', exact: true }).click();
  await page.getByRole('button', { name: 'Continue as Jacky' }).click();
  check(
    'Hosted outage resumes browser-local assignment',
    await page.getByText(`Formal V2 · 1 / ${official.Jacky}`, { exact: true }).isVisible(),
  );
  await page.getByRole('button', { name: 'Equal', exact: true }).click();
  await page.getByRole('button', { name: 'Submit choice', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Exit Study', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Backup / Recovery' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Progress', exact: true }).click();
  const file = await downloading;
  await file.saveAs(resolve(qa, 'fixture-backup.json'));
  check(
    'Offline JSON backup retains exact frozen assignment',
    JSON.parse(readFileSync(resolve(qa, 'fixture-backup.json'), 'utf8')).state.formal
      .assignmentVersion === 'formal-v2-assignment-1',
  );
  await page.unroute('**/api/**');
  await page.reload();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByLabel('Study access code').fill(access);
  await page.getByRole('button', { name: 'Enter Study', exact: true }).click();
  await page.getByRole('button', { name: 'Joint Calibration', exact: true }).waitFor();
  let synced = await context.request.get(url + '/api/state').then((r) => r.json());
  check(
    'Pending offline answers sync on hosted re-entry',
    synced.answers.filter((a) => a.reviewer === 'Jacky' && !a.invalidated).length === 2,
  );
  await page.getByRole('button', { name: 'Researcher', exact: true }).click();
  await page.getByText('Advanced / Recovery', { exact: true }).click();
  const wrongReviewer = synced.answers.find((a) => a.reviewer === 'Jacky' && !a.invalidated);
  await page.getByLabel('Response ID', { exact: true }).fill(wrongReviewer.responseId);
  await page.getByLabel('Reason', { exact: true }).fill('wrong reviewer — isolated QA fixture');
  await page.getByRole('button', { name: 'Invalidate response', exact: true }).click();
  await page.waitForFunction(
    (id) =>
      JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.answers.find(
        (a) => a.responseId === id,
      ).invalidated,
    wrongReviewer.responseId,
  );
  synced = await context.request.get(url + '/api/state').then((r) => r.json());
  check(
    'Researcher wrong-reviewer recovery retains original choice and auditable invalidation',
    synced.answers.find((a) => a.responseId === wrongReviewer.responseId).choice ===
      wrongReviewer.choice &&
      synced.answers.find((a) => a.responseId === wrongReviewer.responseId).invalidated.kind ===
        'recovery',
  );
  // Fill the remaining isolated fixture protocol to exercise completeness/unblinding.
  for (const r of ['Jacky', 'Conrad']) {
    delete synced.pending[r];
    while (
      synced.answers.filter((a) => a.reviewer === r && !a.invalidated).length <
      synced.formal.assignments[r].length
    ) {
      submitFormal(
        synced,
        r,
        'Equal',
        new Date().toISOString(),
        `fixture-${r}-${crypto.randomUUID()}`,
      );
      delete synced.pending[r];
    }
  }
  const complete = await context.request.put(url + '/api/state', {
    data: { expectedRevision: synced.revision, state: synced },
  });
  check('Complete fixture protocol accepted', complete.ok());
  await page.reload();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByLabel('Study access code').fill(access);
  await page.getByRole('button', { name: 'Enter Study', exact: true }).click();
  await page.getByRole('button', { name: 'Researcher', exact: true }).click();
  await page.getByRole('button', { name: 'Unblind & Analyse' }).click();
  await page.getByRole('heading', { name: 'Canonical overlap agreement' }).waitFor();
  const exporting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export research data' }).click();
  await (await exporting).saveAs(resolve(qa, 'fixture-research-export.json'));
  const exported = JSON.parse(readFileSync(resolve(qa, 'fixture-research-export.json'), 'utf8'));
  check(
    'Unblinded export separates 96 active ratings, Calibration and Play',
    exported.formal.filter((a) => !a.invalidated).length === official.Jacky + official.Conrad &&
      exported.calibration.length === official.calibration &&
      exported.play.length === 0,
  );
  check(
    'No fake anonymous users stored by Play QA',
    (await context.request.get(url + '/api/play').then((r) => r.json())).length === 0,
  );
  // Existing V1 is still accessible without changing its saved data or semantics.
  await page.goto(url + '/?v1=1#home');
  await page.locator('.home-play:not([disabled])').waitFor();
  check('Historical V1 UI remains available', await page.locator('.home').isVisible());
  check('No browser runtime errors', errors.length === 0);
  writeFileSync(
    resolve(qa, 'verification.json'),
    JSON.stringify({ checks, errors, fixtureOnly: true }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
} finally {
  await browser?.close();
  child.kill();
}
