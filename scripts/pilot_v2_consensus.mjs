// Isolated three-phase and starter navigation QA. No real-study database or human answers.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const root = resolve(import.meta.dirname, '..'),
  qa = resolve(root, 'qa/v2');
mkdirSync(qa, { recursive: true });
const code = 'fixture-' + crypto.randomUUID(),
  url = 'http://127.0.0.1:18801',
  dbPath = resolve(qa, `consensus-fixture-${Date.now()}.sqlite`),
  checks = [],
  errors = [];
const child = spawn(process.execPath, ['server/api.ts'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: '18801',
    STUDY_TRANSPORT: 'local',
    STUDY_ACCESS_CODE: code,
    STUDY_DB_PATH: dbPath,
  },
  windowsHide: true,
  stdio: 'ignore',
});
let browser;
const check = (name, ok = true) => {
  assert.ok(ok, name);
  checks.push(name);
};
const card = (p, name) =>
  p.locator('.study-card').filter({ has: p.getByRole('heading', { name, exact: true }) });
async function login(p) {
  await p.goto(url + '/#study');
  await p.getByLabel('Study access code').fill(code);
  await p.getByRole('button', { name: 'Enter Study', exact: true }).click();
  await card(p, 'Researcher').waitFor();
}
async function research(p) {
  await card(p, 'Researcher').getByRole('button').click();
  await p.getByRole('heading', { name: 'Study Setup', exact: true }).waitFor();
}
async function download(p, name, path) {
  const d = p.waitForEvent('download');
  await p.getByRole('button', { name, exact: true }).click();
  await (await d).saveAs(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}
async function vote(p, choice = 'Equal') {
  await p.getByRole('button', { name: choice, exact: true }).click();
  await p.getByRole('button', { name: 'Submit', exact: true }).click();
  await p.getByRole('button', { name: 'Next', exact: true }).click();
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + '/api/health')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1000 },
    }),
    p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await login(p);
  await research(p);
  const setup = p.getByRole('region', { name: 'Study Setup' });
  check(
    'New defaults show 10/50/50/50, 150 Formal ratings and 140 distinct pairs',
    /Calibration: 10/.test(await setup.innerText()) &&
      /Joint formal ratings: 50/.test(await setup.innerText()) &&
      /Formal ratings total: 150/.test(await setup.innerText()) &&
      /Formal distinct pairs: 140/.test(await setup.innerText()),
  );
  await p.screenshot({ path: resolve(qa, 'consensus-defaults-desktop.png'), fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  check(
    'New setup and persistent navigation fit mobile',
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.screenshot({ path: resolve(qa, 'consensus-defaults-mobile.png'), fullPage: true });
  await setup.getByRole('checkbox', { name: 'B vs C', exact: true }).uncheck();
  await setup.getByRole('checkbox', { name: 'C vs J', exact: true }).uncheck();
  for (const [label, value] of [
    ['Calibration pairs', '2'],
    ['Joint Consensus Formal pairs', '5'],
    ['Independent Formal pairs per reviewer', '4'],
    ['Independent overlap pairs', '2'],
  ])
    await setup.getByLabel(label, { exact: true }).fill(value);
  check(
    'Small total workload recalculates without hard-coded sizes',
    /Formal ratings total: 13/.test(await setup.innerText()) &&
      /Formal distinct pairs: 11/.test(await setup.innerText()),
  );
  await setup.getByRole('button', { name: 'Save Setup', exact: true }).click();
  await p.getByRole('button', { name: 'Start Joint Calibration', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    if (i) await p.getByRole('button', { name: 'Next calibration comparison' }).click();
    await p.getByRole('button', { name: 'Equal', exact: true }).click();
    await p.getByRole('button', { name: 'Submit', exact: true }).click();
    await p.getByRole('button', { name: 'Next calibration comparison' }).waitFor();
  }
  await p.getByRole('button', { name: 'Lock Calibration', exact: true }).click();
  await p.getByRole('button', { name: 'Generate Study', exact: true }).click();
  let state = await context.request.get(url + '/api/state').then((r) => r.json());
  const joint = new Set(state.formal.joint.map((x) => x.pairId)),
    cal = new Set(state.calibration.assignments.map((x) => x.pairId));
  check(
    'Generated exact counts with Calibration/Joint/Independent exclusions',
    state.formal.joint.length === 5 &&
      state.formal.assignments.Jacky.length === 4 &&
      state.formal.assignments.Conrad.length === 4 &&
      state.formal.overlap.length === 2 &&
      Object.values(state.formal.assignments)
        .flat()
        .every((x) => !joint.has(x.pairId) && !cal.has(x.pairId)),
  );
  // Save fresh Independent files before any Joint responses; identity remains stable as progress changes.
  for (const r of ['Jacky', 'Conrad'])
    await download(p, `Export ${r} Study`, resolve(qa, `consensus-${r}.study.json`));
  await p.getByRole('button', { name: 'Study Home', exact: true }).click();
  await card(p, 'Joint Consensus Review').getByRole('button').click();
  check(
    'Consensus uses frozen guideline and blind A/Equal/B without reveal',
    (await p
      .getByText('Reviewer: Jacky + Conrad · Joint Consensus Review', { exact: true })
      .isVisible()) &&
      !/Ruff|Style-trained|Judge-trained|Pretrained Base|The reveal/.test(
        await p.locator('main').innerText(),
      ),
  );
  await p.getByRole('button', { name: 'A', exact: true }).click();
  await p.getByRole('button', { name: 'Submit', exact: true }).click();
  await p.getByRole('button', { name: 'Undo', exact: true }).click();
  await vote(p);
  await p.getByRole('button', { name: 'Exit Study', exact: true }).click();
  check(
    'Consensus Exit preserves shared 1/5 progress',
    await card(p, 'Joint Consensus Review').getByText('1 / 5', { exact: true }).isVisible(),
  );
  const other = await browser.newContext(),
    second = await other.newPage();
  await login(second);
  check(
    'Fresh shared browser resumes exact Joint progress',
    await card(second, 'Joint Consensus Review').getByText('1 / 5', { exact: true }).isVisible(),
  );
  await other.close();
  await research(p);
  await download(p, 'Export Joint Consensus Study', resolve(qa, 'consensus-joint.study.json'));
  const jc = await browser.newContext({ acceptDownloads: true }),
    jq = await jc.newPage();
  jq.on('pageerror', (e) => errors.push(e.message));
  await jq.route('**/api/**', (route) => route.abort());
  await jq.goto(url + '/#study');
  await jq.waitForFunction(
    () => !document.querySelector('input[aria-label="Import Study"]')?.disabled,
  );
  await jq
    .getByLabel('Import Study', { exact: true })
    .setInputFiles(resolve(qa, 'consensus-joint.study.json'));
  await jq.getByText('Reviewer: Jacky + Conrad', { exact: true }).waitFor();
  check(
    'Joint offline package identifies Jacky + Conrad and resumes shared progress',
    await jq.getByText('Reviewer: Jacky + Conrad', { exact: true }).isVisible(),
  );
  await card(jq, 'Joint Consensus Review').getByRole('button').click();
  for (let i = 1; i < 5; i++) await vote(jq);
  await jq.getByRole('heading', { name: 'Study complete', exact: true }).waitFor();
  await download(jq, 'Export Result', resolve(qa, 'consensus-joint-result.json'));
  await jc.close();
  await p
    .getByLabel('Import Joint Consensus Result', { exact: true })
    .setInputFiles(resolve(qa, 'consensus-joint-result.json'));
  await p.getByRole('status').filter({ hasText: 'Joint Result imported.' }).waitFor();
  check(
    'Joint offline Result merges shared namespace and preserves source file',
    (await context.request.get(url + '/api/state').then((r) => r.json())).resultImports.length ===
      1,
  );
  check(
    'Consensus response freezes setup and remains separate from independent progress',
    (await setup.getByLabel('Joint Consensus Formal pairs', { exact: true }).isDisabled()) &&
      (await p.getByText('0 / 4', { exact: true }).count()) === 2,
  );
  check(
    'Joint completion alone cannot unblind incomplete independent results',
    await p.getByRole('button', { name: 'Merge & Analyse', exact: true }).isDisabled(),
  );
  await p.screenshot({ path: resolve(qa, 'consensus-progress-mobile.png'), fullPage: true });
  // Offline reviewers, then main-computer import/analysis; inherited engine and response format.
  for (const r of ['Jacky', 'Conrad']) {
    const c = await browser.newContext({ acceptDownloads: true });
    const q = await c.newPage();
    q.on('pageerror', (e) => errors.push(e.message));
    await q.route('**/api/**', (route) => route.abort());
    await q.goto(url + '/#study');
    await q.waitForFunction(
      () => !document.querySelector('input[aria-label="Import Study"]')?.disabled,
    );
    await q
      .getByLabel('Import Study', { exact: true })
      .setInputFiles(resolve(qa, `consensus-${r}.study.json`));
    await card(q, r).getByRole('button').click();
    for (let i = 0; i < 4; i++) await vote(q);
    await q.getByRole('heading', { name: 'Study complete', exact: true }).waitFor();
    check(
      `${r} completion exposes starter navigation`,
      await q.getByRole('button', { name: 'Start screen', exact: true }).isEnabled(),
    );
    await download(q, 'Export Result', resolve(qa, `consensus-${r}-result.json`));
    await q.getByRole('button', { name: 'Start screen', exact: true }).click();
    await q.getByLabel('Study access code').waitFor();
    await q.reload();
    await q.getByLabel('Study access code').waitFor();
    check(
      `${r} starter escape survives reload and preserves completed package`,
      await q.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('code-choice.v2-reviewer-package'));
        return s.paused && s.state.answers.filter((a) => !a.invalidated).length === 4;
      }),
    );
    await q.getByRole('button', { name: `Resume imported Study · ${r}`, exact: true }).click();
    check(
      `${r} saved package can still resume without reset`,
      await card(q, r).getByText('4 / 4 · ✓ Complete', { exact: true }).isVisible(),
    );
    await c.close();
    await p
      .getByLabel(`Import ${r} Result`, { exact: true })
      .setInputFiles(resolve(qa, `consensus-${r}-result.json`));
    await p
      .getByRole('status')
      .filter({ hasText: `${r} Result imported.` })
      .waitFor();
  }
  await p.getByRole('button', { name: 'Merge & Analyse', exact: true }).click();
  await p.getByRole('heading', { name: 'Summary', exact: true }).waitFor();
  check(
    'Summary separately presents Joint, Jacky, Conrad, combined and independent agreement',
    (await p.getByRole('heading', { name: 'Joint Consensus results', exact: true }).isVisible()) &&
      (await p
        .getByRole('heading', { name: 'Independent overlap agreement', exact: true })
        .isVisible()),
  );
  const out = await download(
    p,
    'Export Final Research Data',
    resolve(qa, 'consensus-final-research.json'),
  );
  check(
    'Export tags all three phases and preserves independent-only overlap statistics',
    out.calibration.every((a) => a.phase === 'joint_calibration') &&
      out.jointConsensusFormal.filter((a) => !a.invalidated).length === 5 &&
      out.independentFormal.Jacky.length === 4 &&
      out.formal.filter((a) => !a.invalidated).length === 13 &&
      out.analysis.results.reduce((n, r) => n + r.overlapPairs, 0) === 2,
  );
  // Header reset works from any main view, archives all completed evidence, and returns to starter.
  p.once('dialog', (d) => d.accept());
  await p.getByRole('button', { name: 'Reset / Start over', exact: true }).click();
  await card(p, 'Researcher').waitFor();
  state = await context.request.get(url + '/api/state').then((r) => r.json());
  check(
    'Header reset returns to starter and archives Joint/Independent data and sources',
    !state.formal &&
      state.answers.length === 0 &&
      state.archives.at(-1).state.answers.length === 14 &&
      state.archives.at(-1).state.resultImports.length === 3,
  );
  // Direct Joint file transport carries identity and exactly the shared consensus namespace.
  const { exportStudy, importStudy, exportResult, importResult } =
    await import('../src/v2Transfer.ts');
  const { initialProtocol, lockCalibration, generateFormal, submitFormal } =
    await import('../src/v2.ts');
  const catalog = JSON.parse(readFileSync(resolve(root, 'public/v2/catalog.json'), 'utf8'));
  catalog.outputs = Object.fromEntries(
    ['B', 'C', 'S', 'J', 'SJ']
      .flatMap((r) =>
        JSON.parse(readFileSync(resolve(root, `public/v2/outputs-${r}.json`), 'utf8')),
      )
      .map((o) => [o.outputId, o]),
  );
  const fixture = initialProtocol(catalog, {
    ...state.config,
    totals: { calibration: 0, joint: 1, independent: 0, overlap: 0 },
  });
  lockCalibration(fixture, new Date().toISOString());
  generateFormal(fixture, catalog, new Date().toISOString());
  const pack = await exportStudy(fixture, 'Joint', catalog),
    session = await importStudy(JSON.stringify(pack), catalog);
  submitFormal(session.state, 'Joint', 'Equal', new Date().toISOString(), 'fixture-joint-file');
  delete session.state.pending.Joint;
  const merged = await importResult(
    fixture,
    JSON.stringify(await exportResult(session)),
    'joint-result.json',
    'Joint',
    catalog,
  );
  check(
    'Joint offline files share protocol, mapping, identity and result merge',
    merged.answers[0].phase === 'joint_consensus_formal' && pack.comparisons.length === 1,
  );
  check('No browser runtime errors', errors.length === 0);
  writeFileSync(
    resolve(qa, 'consensus-verification.json'),
    JSON.stringify({ checks, errors, fixtureOnly: true }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
} catch (e) {
  for (const c of browser?.contexts() ?? [])
    for (const p of c.pages())
      console.error(
        'QA page',
        p.url(),
        await p
          .locator('main')
          .innerText()
          .catch(() => ''),
      );
  throw e;
} finally {
  await browser?.close();
  child.kill();
}
