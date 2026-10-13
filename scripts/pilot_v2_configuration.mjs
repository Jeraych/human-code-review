// Researcher configurability QA: all state is isolated under ignored qa/v2; no actual study ratings.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { configuration, workload, submitFormal, validateState } from '../src/v2.ts';
const { chromium } = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const root = resolve(import.meta.dirname, '..'),
  qa = resolve(root, 'qa/v2');
mkdirSync(qa, { recursive: true });
const checks = [],
  errors = [],
  code = 'fixture-' + crypto.randomUUID(),
  url = 'http://127.0.0.1:18793';
const service = spawn(process.execPath, ['server/api.ts'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: '18793',
    STUDY_ACCESS_CODE: code,
    STUDY_DB_PATH: resolve(qa, `configuration-fixture-${Date.now()}.sqlite`),
  },
  windowsHide: true,
  stdio: 'ignore',
});
const db = JSON.parse(readFileSync(resolve(root, 'public/v2/catalog.json'), 'utf8'));
let browser;
function check(label, ok) {
  assert.ok(ok, label);
  checks.push(label);
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + '/api/health')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/#study');
  await page.getByLabel('Study access code').fill(code);
  await page.getByRole('button', { name: 'Enter Study', exact: true }).click();
  await page.getByRole('button', { name: 'Researcher', exact: true }).click();
  const form = page.getByRole('region', { name: 'Protocol configuration' });
  await form.getByRole('heading', { name: 'Workload preview' }).waitFor();
  check(
    'Researcher starts with official live workload',
    /12 total/.test(await form.innerText()) &&
      /80 distinct pairs/.test(await form.innerText()) &&
      /16 double-rated pairs/.test(await form.innerText()) &&
      /48 ratings/.test(await form.innerText()),
  );
  await form.getByRole('checkbox', { name: /^B vs C/ }).uncheck();
  await form.getByRole('checkbox', { name: /^C vs J/ }).uncheck();
  await form.getByLabel('Calibration pairs per enabled contrast', { exact: true }).fill('1');
  await form.getByLabel('Formal distinct pairs per enabled contrast', { exact: true }).fill('5');
  await form.getByLabel('Overlap pairs per enabled contrast', { exact: true }).fill('2');
  await form.getByLabel('Randomisation seed', { exact: true }).fill('42');
  check(
    'Preview recalculates subset, calibration, overlap and odd workloads live',
    /Enabled contrasts: 2/.test(await form.innerText()) &&
      /2 total/.test(await form.innerText()) &&
      /10 distinct pairs/.test(await form.innerText()) &&
      /4 double-rated pairs/.test(await form.innerText()) &&
      /7 ratings/.test(await form.innerText()),
  );
  await form.getByLabel('Overlap pairs per enabled contrast', { exact: true }).fill('6');
  check(
    'Impossible overlap is caught before save/generation',
    (await form.getByRole('alert').isVisible()) &&
      (await form.getByRole('button', { name: 'Save configuration', exact: true }).isDisabled()),
  );
  await form.getByLabel('Overlap pairs per enabled contrast', { exact: true }).fill('2');
  await form.getByRole('checkbox', { name: /^C vs S/ }).uncheck();
  await form.getByRole('checkbox', { name: /^S vs SJ/ }).uncheck();
  check(
    'Empty contrast subset is rejected',
    (await form.getByRole('alert').isVisible()) &&
      (await form.getByRole('button', { name: 'Save configuration', exact: true }).isDisabled()),
  );
  await form.getByRole('checkbox', { name: /^C vs S/ }).check();
  await form.getByRole('checkbox', { name: /^S vs SJ/ }).check();
  await form.getByLabel('Formal distinct pairs per enabled contrast', { exact: true }).fill('1000');
  check('Requested pool overflow is rejected', await form.getByRole('alert').isVisible());
  await form.getByLabel('Formal distinct pairs per enabled contrast', { exact: true }).fill('5');
  await form
    .getByLabel('Reviewer criterion / guideline', { exact: true })
    .fill(
      'Fixture guideline: prefer meaningful readability and maintainability differences, and choose Equal when neither solution is clearly preferable.',
    );
  await page.screenshot({ path: resolve(qa, 'researcher-config-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    'Researcher configuration fits mobile viewport',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.screenshot({ path: resolve(qa, 'researcher-config-mobile.png'), fullPage: true });
  await form.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.edition === 2,
  );
  let state = await context.request.get(url + '/api/state').then((r) => r.json());
  check(
    'Researcher configuration persists without starting ratings',
    state.config.seed === 42 &&
      state.config.contrasts.length === 2 &&
      state.calibration.assignments.length === 2 &&
      state.answers.length === 0 &&
      state.calibration.answers.length === 0,
  );
  await page.getByRole('button', { name: 'Study Home', exact: true }).click();
  await page.getByRole('button', { name: 'Joint Calibration', exact: true }).click();
  for (let i = 0; i < state.calibration.assignments.length; i++) {
    if (i) await page.getByRole('button', { name: 'Next calibration comparison' }).click();
    await page.getByRole('button', { name: 'Equal', exact: true }).click();
    await page.getByRole('button', { name: 'Submit choice', exact: true }).click();
    await page.getByRole('button', { name: 'Next calibration comparison' }).waitFor();
  }
  await page.getByRole('button', { name: 'Lock Calibration', exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.calibration
        .lockedAt,
  );
  await page.getByRole('button', { name: 'Exit Study', exact: true }).click();
  await page.getByRole('button', { name: 'Researcher', exact: true }).click();
  await form.getByLabel('Randomisation seed', { exact: true }).fill('43');
  check(
    'Unsaved configuration blocks Formal generation',
    await page.getByRole('button', { name: 'Generate / Lock Formal V2' }).isDisabled(),
  );
  page.once('dialog', (d) => d.accept());
  await form.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.edition === 3,
  );
  await page.getByRole('button', { name: 'Generate / Lock Formal V2' }).click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.formal,
  );
  state = await context.request.get(url + '/api/state').then((r) => r.json());
  const expected = workload(configuration(state));
  check(
    'Configured Formal uses frozen 7/7 assignments, overlap and explicit seed',
    state.formal.assignments.Jacky.length === expected.Jacky &&
      state.formal.assignments.Conrad.length === expected.Conrad &&
      state.formal.overlap.length === expected.overlap &&
      state.formal.seed === 43 &&
      state.calibration.answers.length === 2,
  );
  const originalFormal = structuredClone(state.formal);
  page.once('dialog', (d) => d.accept());
  await form.getByRole('button', { name: 'Regenerate unstarted Formal', exact: true }).click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.edition === 4,
  );
  state = await context.request.get(url + '/api/state').then((r) => r.json());
  check(
    'Deliberate unstarted regeneration archives original assignments',
    JSON.stringify(state.archives.at(-1).state.formal) === JSON.stringify(originalFormal) &&
      state.answers.length === 0,
  );
  await page.getByRole('button', { name: 'Study Home', exact: true }).click();
  await page.getByRole('button', { name: 'Jacky', exact: true }).click();
  check(
    'Reviewer confirmation derives workload from configuration',
    await page.getByText('Formal progress: 0 / 7', { exact: true }).isVisible(),
  );
  await page.getByRole('button', { name: 'Continue as Jacky' }).click();
  check(
    'Reviewer questions contain no research configuration',
    (await page.getByRole('checkbox').count()) === 0 &&
      (await page.getByRole('spinbutton').count()) === 0 &&
      !/Protocol configuration|Randomisation seed|Conrad/.test(
        await page.locator('main').innerText(),
      ),
  );
  await page.getByRole('button', { name: 'Equal', exact: true }).click();
  await page.getByRole('button', { name: 'Submit choice', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Submit choice', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Exit Study', exact: true }).click();
  await page.getByRole('button', { name: 'Researcher', exact: true }).click();
  check(
    'First response freezes settings even after immediate Undo',
    (await form.getByLabel('Randomisation seed', { exact: true }).isDisabled()) &&
      (await form.getByLabel('Reviewer criterion / guideline', { exact: true }).isDisabled()) &&
      (await form.getByRole('button', { name: 'Save configuration', exact: true }).count()) === 0,
  );
  state = await context.request.get(url + '/api/state').then((r) => r.json());
  const tampered = structuredClone(state);
  tampered.config.seed = 99;
  tampered.formal.seed = 99;
  check(
    'API rejects silent edits after Formal started',
    (
      await context.request.put(url + '/api/state', {
        data: { expectedRevision: state.revision, state: tampered },
      })
    ).status() === 400,
  );
  await form.getByText('Advanced / Recovery — protocol replacement', { exact: true }).click();
  await form
    .getByLabel('Protocol replacement reason', { exact: true })
    .fill('Fixture explicit protocol replacement for configuration QA');
  page.once('dialog', (d) => d.accept());
  await form
    .getByRole('button', { name: 'Invalidate active protocol & create replacement', exact: true })
    .click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.edition === 5,
  );
  state = await context.request.get(url + '/api/state').then((r) => r.json());
  check(
    'Replacement retains original response and invalidated protocol history',
    state.archives.at(-1).disposition === 'invalidated' &&
      state.archives.at(-1).state.answers.length === 1 &&
      state.archives.at(-1).state.answers[0].invalidated.kind === 'undo' &&
      state.answers.length === 0 &&
      !state.formal,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByLabel('Study access code').fill(code);
  await page.getByRole('button', { name: 'Enter Study', exact: true }).click();
  await page.getByRole('button', { name: 'Researcher', exact: true }).click();
  check(
    'Refresh preserves active configuration and archive history',
    (await form.getByLabel('Randomisation seed', { exact: true }).inputValue()) === '43' &&
      (await form.getByText('Protocol history · 4 archived editions', { exact: true }).isVisible()),
  );
  // Complete the tiny isolated fixture edition to verify config-derived unblinding/export.
  state = await context.request.get(url + '/api/state').then((r) => r.json());
  const { lockCalibration, generateFormal } = await import('../src/v2.ts');
  state.calibration.answers = state.calibration.assignments.map((p, i) => ({
    ...p,
    responseId: `fixture-final-cal-${i}`,
    reviewer: 'Joint',
    phase: 'Calibration',
    choice: 'Equal',
    at: new Date().toISOString(),
  }));
  lockCalibration(state, new Date().toISOString());
  generateFormal(state, db, new Date().toISOString());
  for (const r of ['Jacky', 'Conrad'])
    for (let i = 0; i < state.formal.assignments[r].length; i++) {
      submitFormal(state, r, 'Equal', new Date().toISOString(), `fixture-final-${r}-${i}`);
      delete state.pending[r];
    }
  validateState(state, db, true);
  check(
    'Configured completeness is accepted by backend',
    (
      await context.request.put(url + '/api/state', {
        data: { expectedRevision: state.revision, state },
      })
    ).ok(),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByLabel('Study access code').fill(code);
  await page.getByRole('button', { name: 'Enter Study', exact: true }).click();
  await page.getByRole('button', { name: 'Researcher', exact: true }).click();
  await page.getByRole('button', { name: 'Unblind & Analyse', exact: true }).click();
  await page.getByRole('heading', { name: 'Canonical overlap agreement' }).waitFor();
  check(
    'Analysis derives contrasts/counts without fixed official totals',
    await page.getByText(/10 distinct pairs; 14 correlated ratings/).isVisible(),
  );
  const exporting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export research data', exact: true }).click();
  const file = await exporting;
  await file.saveAs(resolve(qa, 'configuration-fixture-research.json'));
  const exported = JSON.parse(
    readFileSync(resolve(qa, 'configuration-fixture-research.json'), 'utf8'),
  );
  check(
    'Export includes active configuration, edition and complete archived protocols',
    exported.configuration.contrasts.length === 2 &&
      exported.formal.length === 14 &&
      exported.calibration.length === 2 &&
      exported.archivedProtocols.length === 4 &&
      exported.protocolEdition === 5,
  );
  check('No runtime browser errors', errors.length === 0);
  writeFileSync(
    resolve(qa, 'configuration-verification.json'),
    JSON.stringify({ checks, errors, fixtureOnly: true }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
} finally {
  await browser?.close();
  service.kill();
}


