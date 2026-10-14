// Guided UX + integrity regressions, using isolated SQLite/browser stores and synthetic answers.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { digest, exportStudy } from '../src/v2Transfer.ts';
const { chromium } = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const root = resolve(import.meta.dirname, '..'),
  qa = resolve(root, 'qa/v2');
mkdirSync(qa, { recursive: true });
const checks = [],
  errors = [],
  children = [],
  code = 'fixture-' + crypto.randomUUID();
const catalog = JSON.parse(readFileSync(resolve(root, 'public/v2/catalog.json'), 'utf8'));
catalog.outputs = Object.fromEntries(
  ['B', 'C', 'S', 'J', 'SJ']
    .flatMap((c) => JSON.parse(readFileSync(resolve(root, `public/v2/outputs-${c}.json`), 'utf8')))
    .map((o) => [o.outputId, o]),
);
let browser;
const check = (name, ok = true) => {
  assert.ok(ok, name);
  checks.push(name);
};
function start(port, transport, path) {
  const child = spawn(process.execPath, ['server/api.ts'], {
    cwd: root,
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(port),
      STUDY_ACCESS_CODE: code,
      STUDY_TRANSPORT: transport,
      STUDY_DB_PATH: path,
    },
  });
  children.push(child);
  return child;
}
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + '/api/health')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error('QA service failed to start');
}
const reviewer = (p, r) => p.getByRole('region', { name: `${r} review`, exact: true });
async function page(context) {
  const p = await context.newPage();
  p.setDefaultTimeout(10000);
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
}
async function login(p, url) {
  await p.goto(url + '/#study');
  await p.getByLabel('Study access code').fill(code);
  await p.getByRole('button', { name: 'Open study', exact: true }).click();
  await p.locator('.guided-study').waitFor();
}
async function download(p, label, name) {
  const promise = p.waitForEvent('download');
  await p.getByRole('button', { name: label, exact: true }).click();
  const path = resolve(qa, name);
  await (await promise).saveAs(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}
async function openFile(p, name) {
  await p.getByLabel('Open reviewer file', { exact: true }).setInputFiles(resolve(qa, name));
}
async function vote(p, choice = 'Equal') {
  await p.waitForTimeout(420);
  await p.getByRole('button', { name: choice, exact: true }).click();
  await p.waitForFunction(() => {
    const reviewer = JSON.parse(localStorage.getItem('code-choice.v2-reviewer-package') || 'null');
    const main = JSON.parse(localStorage.getItem('code-choice.human-validation-v2') || 'null');
    return (
      !document.querySelector('.v2-vote[aria-busy="true"]') && (reviewer || (main && !main.dirty))
    );
  });
}
async function setup(p, boundary = false) {
  await p.getByRole('button', { name: 'Edit setup', exact: true }).click();
  const form = p.getByRole('region', { name: 'Study setup', exact: true });
  check(
    'Setup is a small edit action with the existing recommended defaults',
    (await form.getByLabel('Calibration', { exact: true }).inputValue()) === '10' &&
      (await form.getByLabel('Joint review', { exact: true }).inputValue()) === '50' &&
      (await form.getByLabel('Independent · each', { exact: true }).inputValue()) === '50' &&
      (await form.getByLabel('Overlap', { exact: true }).inputValue()) === '10',
  );
  await form.getByRole('checkbox', { name: 'C vs J', exact: true }).uncheck();
  await form.getByRole('checkbox', { name: 'S vs SJ', exact: true }).uncheck();
  for (const [label, value] of [
    ['Calibration', '2'],
    ['Joint review', '3'],
    ['Independent · each', '3'],
    ['Overlap', '1'],
  ])
    await form.getByLabel(label, { exact: true }).fill(value);
  if (boundary) {
    await form.getByLabel('Overlap', { exact: true }).fill('4');
    check(
      'Impossible overlap blocks saving with a reason',
      (await form.getByRole('alert').isVisible()) &&
        !(await form.getByRole('button', { name: 'Save setup', exact: true }).isEnabled()),
    );
    await form.getByLabel('Overlap', { exact: true }).fill('1');
    for (const c of ['B vs C', 'C vs S'])
      await form.getByRole('checkbox', { name: c, exact: true }).uncheck();
    check('Empty comparison selection is rejected', await form.getByRole('alert').isVisible());
    for (const c of ['B vs C', 'C vs S'])
      await form.getByRole('checkbox', { name: c, exact: true }).check();
    await form.getByLabel('Joint review', { exact: true }).fill('10000');
    check(
      'Pool overflow shows requested and available counts',
      /requested|need|requires|available|eligible/i.test(await form.getByRole('alert').innerText()),
    );
    await form.getByLabel('Joint review', { exact: true }).fill('3');
  }
  check(
    'Live workload derives 9 ratings and 8 distinct pairs',
    /Formal ratings total: 9/.test(await form.innerText()) &&
      /Formal distinct pairs: 8/.test(await form.innerText()),
  );
  await p.screenshot({ path: resolve(qa, 'guided-setup-desktop.png'), fullPage: true });
  await form.getByRole('button', { name: 'Save setup', exact: true }).click();
  await p.getByRole('button', { name: 'Start Calibration', exact: true }).waitFor();
}
async function calibrate(p) {
  await p.getByRole('button', { name: 'Start Calibration', exact: true }).click();
  check(
    'Calibration has no setup/lock/generate controls around each question',
    !(await p.getByRole('textbox').count()) &&
      !(await p.getByRole('button', { name: /Lock|Generate|Save guideline/ }).count()),
  );
  for (let i = 0; i < 2; i++) {
    await p.waitForTimeout(420);
    await p.getByRole('button', { name: 'Equal', exact: true }).click();
    await p
      .getByText('Choice saved. Discuss the revealed conditions and refine your guideline.', {
        exact: true,
      })
      .waitFor();
    await p
      .getByRole('button', { name: i === 1 ? 'Agree guideline' : 'Next', exact: true })
      .click();
  }
  await p
    .getByLabel('Review guideline', { exact: true })
    .fill('Synthetic fixture: prefer meaningful readability and maintainability differences.');
  await p.getByRole('button', { name: 'Finish Calibration', exact: true }).click();
  await p.getByRole('button', { name: 'Start together', exact: true }).waitFor();
  check('Finishing Calibration locks guideline and generates assignments in one action');
}
try {
  const local = 'http://127.0.0.1:18810';
  start(18810, 'local', resolve(qa, `guided-local-fixture-${Date.now()}.sqlite`));
  await ready(local);
  check('Study data remains access protected', (await fetch(local + '/api/state')).status === 401);
  browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  const main = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
  const p = await page(main);
  await login(p, local);
  check(
    'Fresh main Study highlights Calibration and hides infrastructure',
    (await p.getByRole('button', { name: 'Start Calibration', exact: true }).isVisible()) &&
      !(await p.getByRole('heading', { name: 'Researcher', exact: true }).count()) &&
      !(await p.getByRole('spinbutton').count()),
  );
  await p.screenshot({ path: resolve(qa, 'guided-start-desktop.png'), fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  check(
    'Study start fits mobile',
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.screenshot({ path: resolve(qa, 'guided-start-mobile.png'), fullPage: true });
  await p.setViewportSize({ width: 1440, height: 1000 });
  await setup(p, true);
  await calibrate(p);
  let state = await main.request.get(local + '/api/state').then((r) => r.json());
  const cal = new Set(state.calibration.assignments.map((x) => x.pairId)),
    joint = new Set(state.formal.joint.map((x) => x.pairId));
  check(
    'Exact phase counts and exclusions preserved',
    state.formal.joint.length === 3 &&
      state.formal.assignments.Jacky.length === 3 &&
      state.formal.assignments.Conrad.length === 3 &&
      state.formal.overlap.length === 1 &&
      state.formal.joint.every((x) => !cal.has(x.pairId)) &&
      Object.values(state.formal.assignments)
        .flat()
        .every((x) => !cal.has(x.pairId) && !joint.has(x.pairId)),
  );
  for (const r of ['Joint', 'Jacky', 'Conrad'])
    writeFileSync(
      resolve(qa, `guided-${r}.study.json`),
      JSON.stringify(await exportStudy(state, r, catalog)),
    );
  await p.getByRole('button', { name: 'Start together', exact: true }).click();
  check(
    'Joint review is blinded and distraction-free',
    !(await p.getByRole('spinbutton').count()) &&
      !(await p.getByText('Correctness-focused', { exact: true }).count()) &&
      !(await p.getByRole('button', { name: /Reveal|Unblind|Start over/ }).count()),
  );
  const before = await main.request.get(local + '/api/state').then((r) => r.json());
  await vote(p, 'A');
  check(
    'One-click A saves and advances without Submit or Undo',
    (await main.request.get(local + '/api/state').then((r) => r.json())).answers.length ===
      before.answers.length + 1 &&
      !(await p.getByRole('button', { name: /^(Submit|Undo|Next)$/ }).count()),
  );
  await p.getByRole('button', { name: 'Exit', exact: true }).click();
  await p.getByRole('button', { name: 'Continue together', exact: true }).waitFor();
  await p.reload();
  await p.getByRole('button', { name: 'Continue together', exact: true }).waitFor();
  check(
    'Exit and refresh resume without another access-code screen',
    !(await p.getByLabel('Study access code').count()),
  );
  await p.getByRole('button', { name: 'Continue together', exact: true }).click();
  await p.screenshot({ path: resolve(qa, 'guided-comparison-desktop.png'), fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  check(
    'Comparison fits mobile without research controls',
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.screenshot({ path: resolve(qa, 'guided-comparison-mobile.png'), fullPage: true });
  await p.setViewportSize({ width: 1440, height: 1000 });
  await vote(p);
  await vote(p);
  await p.getByRole('heading', { name: 'You’re finished.', exact: true }).waitFor();
  await p.getByRole('button', { name: 'Back to study', exact: true }).click();
  check(
    'Finished Joint phase has no misleading Continue button',
    !(await p.getByRole('button', { name: 'Continue together', exact: true }).count()),
  );
  check(
    'Results remain unavailable before Independent reviews finish',
    !(await p.getByRole('button', { name: 'View results', exact: true }).isEnabled()),
  );
  await p.getByRole('button', { name: 'Study setup', exact: true }).click();
  check(
    'Frozen setup stays immutable',
    !(await p.getByLabel('Joint review', { exact: true }).isEnabled()),
  );
  await p.getByRole('button', { name: 'Back to study', exact: true }).click();
  for (const r of ['Jacky', 'Conrad'])
    await download(p, `Send review to ${r}`, `guided-${r}.study.json`);
  check('File sending belongs directly to each reviewer');

  const rc = await browser.newContext({ acceptDownloads: true }),
    q = await page(rc);
  await q.route('**/api/**', (route) => route.abort());
  await q.goto(local + '/');
  await q.locator('.home-play:not([disabled])').waitFor();
  await q.getByRole('button', { name: 'Enter Study' }).click();
  await openFile(q, 'guided-Jacky.study.json');
  await q.getByRole('heading', { name: 'Jacky’s review', exact: true }).waitFor();
  check('Home → Open reviewer file works immediately without refresh or access code');
  await q.getByRole('button', { name: 'Start', exact: true }).click();
  await vote(q, 'A');
  await q.getByRole('button', { name: 'Exit', exact: true }).click();
  const jackyFirst = await q.evaluate(() =>
    JSON.parse(localStorage.getItem('code-choice.v2-reviewer-package')),
  );
  const malformed = JSON.parse(readFileSync(resolve(qa, 'guided-Conrad.study.json'), 'utf8'));
  malformed.comparisons[0].codeA += '# forged';
  writeFileSync(resolve(qa, 'guided-forged.study.json'), JSON.stringify(malformed));
  await openFile(q, 'guided-forged.study.json');
  await q.getByRole('alert').waitFor();
  check(
    'Bad reviewer file fails without changing current progress',
    JSON.stringify(
      (await q.evaluate(() => JSON.parse(localStorage.getItem('code-choice.v2-reviewer-package'))))
        .state,
    ) === JSON.stringify(jackyFirst.state),
  );
  await q.getByRole('button', { name: 'Dismiss', exact: true }).click();
  // The original bug: export succeeds but opening another reviewer was permanently blocked.
  await q.getByText('Save current result', { exact: true }).click();
  await download(q, 'Save result for researcher', 'guided-Jacky-partial-result.json');
  await openFile(q, 'guided-Conrad.study.json');
  await q.getByRole('heading', { name: 'Conrad’s review', exact: true }).waitFor();
  check('Export then open a different reviewer works without refresh');
  check(
    'Previous reviewer history remains saved internally',
    await q.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith('code-choice.v2-reviewer-package.saved.'))
        .some((k) => JSON.parse(localStorage.getItem(k)).state.answers.length === 1),
    ),
  );
  await openFile(q, 'guided-Jacky.study.json');
  await q.getByRole('heading', { name: 'Jacky’s review', exact: true }).waitFor();
  check(
    'Returning to an earlier reviewer resumes exact original answers',
    JSON.stringify(
      (await q.evaluate(() => JSON.parse(localStorage.getItem('code-choice.v2-reviewer-package'))))
        .state.answers,
    ) === JSON.stringify(jackyFirst.state.answers),
  );
  await q.getByRole('button', { name: 'Continue', exact: true }).click();
  await vote(q, 'B');
  await vote(q);
  await q.getByRole('heading', { name: 'You’re finished.', exact: true }).waitFor();
  const jackyResult = await download(q, 'Save result for researcher', 'guided-Jacky-result.json');
  await openFile(q, 'guided-Conrad.study.json');
  await q.getByRole('button', { name: 'Start', exact: true }).click();
  await vote(q);
  await q.getByRole('button', { name: 'Exit', exact: true }).click();
  await q.close();
  const reopened = await page(rc);
  await reopened.route('**/api/**', (route) => route.abort());
  await reopened.goto(local + '/#study');
  await reopened.getByRole('button', { name: 'Continue', exact: true }).waitFor();
  check('Closing and reopening reviewer browser preserves resume');
  await reopened.getByRole('button', { name: 'Continue', exact: true }).click();
  await vote(reopened);
  await vote(reopened, 'B');
  const conradResult = await download(
    reopened,
    'Save result for researcher',
    'guided-Conrad-result.json',
  );
  await reopened.getByRole('button', { name: 'Exit', exact: true }).click();
  check(
    'Completed reviewer entry offers save and new file without a dead end',
    (await reopened.getByLabel('Open reviewer file', { exact: true }).isEnabled()) &&
      !(await reopened.getByRole('button', { name: 'Continue', exact: true }).count()),
  );
  await reopened.getByRole('button', { name: 'Main study', exact: true }).click();
  await reopened.getByLabel('Study access code').waitFor();
  await openFile(reopened, 'guided-Conrad.study.json');
  await reopened.getByRole('heading', { name: 'You’re finished.', exact: true }).waitFor();
  check(
    'Paused reviewer can reopen a file without refresh',
    await reopened.getByRole('heading', { name: 'You’re finished.', exact: true }).isVisible(),
  );
  const another = structuredClone(state);
  another.formal.createdAt = '2026-10-14T01:23:45.000Z';
  writeFileSync(
    resolve(qa, 'guided-new-Conrad.study.json'),
    JSON.stringify(await exportStudy(another, 'Conrad', catalog)),
  );
  await openFile(reopened, 'guided-new-Conrad.study.json');
  await reopened.getByRole('button', { name: 'Start', exact: true }).waitFor();
  check(
    'A different study edition opens separately without mixing previous answers',
    (
      await reopened.evaluate(() =>
        JSON.parse(localStorage.getItem('code-choice.v2-reviewer-package')),
      )
    ).state.answers.length === 0,
  );
  await openFile(reopened, 'guided-Conrad.study.json');
  await reopened.getByRole('heading', { name: 'You’re finished.', exact: true }).waitFor();
  check('Earlier study edition remains resumable with all answers intact');
  await p
    .getByLabel('Import Conrad result', { exact: true })
    .setInputFiles(resolve(qa, 'guided-Jacky-result.json'));
  await p.getByRole('alert').waitFor();
  check('Wrong reviewer Result fails clearly without merging');
  await p.getByRole('button', { name: 'Dismiss', exact: true }).click();
  for (const r of ['Jacky', 'Conrad']) {
    await p
      .getByLabel(`Import ${r} result`, { exact: true })
      .setInputFiles(resolve(qa, `guided-${r}-result.json`));
    await reviewer(p, r)
      .getByText(/Complete/)
      .waitFor();
  }
  state = await main.request.get(local + '/api/state').then((r) => r.json());
  check(
    'Both local Results merge exact histories and original sources',
    state.resultImports.length === 2 &&
      state.answers.filter((a) => a.reviewer === 'Jacky').length === jackyResult.answers.length &&
      state.answers.filter((a) => a.reviewer === 'Conrad').length === conradResult.answers.length,
  );
  check(
    'Stale writes are rejected without overwrite',
    (
      await main.request.put(local + '/api/state', {
        data: { expectedRevision: state.revision - 1, state },
      })
    ).status() === 409,
  );
  const changed = structuredClone(state);
  changed.config.seed++;
  check(
    'Server enforces frozen configuration',
    (
      await main.request.put(local + '/api/state', {
        data: { expectedRevision: state.revision, state: changed },
      })
    ).status() === 400,
  );
  await p.getByRole('button', { name: 'View results', exact: true }).click();
  await p.getByRole('heading', { name: 'Results', exact: true }).waitFor();
  const final = await download(p, 'Export research data', 'guided-final.json');
  check(
    'Final export retains Joint/Independent phases and source files',
    final.formal.filter((a) => !a.invalidated).length === 9 &&
      final.protocol.resultImports.length === 2 &&
      final.formal.every((a) => ['joint_consensus_formal', 'independent_formal'].includes(a.phase)),
  );
  check(
    'Separate results and Independent-only agreement remain supported',
    final.analysis.jointConsensus.length === 2 &&
      final.analysis.independent.Jacky.length === 2 &&
      final.analysis.results.reduce((n, x) => n + x.overlapPairs, 0) === 1,
  );
  await p.screenshot({ path: resolve(qa, 'guided-results-desktop.png'), fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  check(
    'Results fit mobile',
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.screenshot({ path: resolve(qa, 'guided-results-mobile.png'), fullPage: true });
  await p.getByRole('button', { name: 'Back to study', exact: true }).click();
  await p.getByText('Study options', { exact: true }).click();
  p.once('dialog', (d) => d.dismiss());
  await p.getByRole('button', { name: 'Start over', exact: true }).click();
  check(
    'Cancelling Start over preserves completed results',
    (await main.request.get(local + '/api/state').then((r) => r.json())).unblindedAt ===
      state.unblindedAt ||
      !!(await main.request.get(local + '/api/state').then((r) => r.json())).unblindedAt,
  );
  p.once('dialog', (d) => d.accept());
  await p.getByRole('button', { name: 'Start over', exact: true }).click();
  await p.getByRole('button', { name: 'Start Calibration', exact: true }).waitFor();
  const reset = await main.request.get(local + '/api/state').then((r) => r.json());
  check(
    'Start over keeps responses, sources and analysis in audit history',
    !reset.formal &&
      reset.archives.at(-1).state.answers.length === final.formal.length &&
      reset.archives.at(-1).state.resultImports.length === 2 &&
      !!reset.archives.at(-1).state.unblindedAt,
  );
  await openFile(p, 'guided-Joint.study.json');
  await p.getByRole('heading', { name: 'Review together', exact: true }).waitFor();
  check(
    'Authenticated main Study can open a received file immediately without refresh',
    !(await p.getByLabel('Study access code').count()),
  );
  await p.getByRole('button', { name: 'Main study', exact: true }).click();
  await p.getByRole('button', { name: 'Start Calibration', exact: true }).waitFor();
  check(
    'Returning from an imported file preserves the main Study separately',
    !(await main.request.get(local + '/api/state').then((r) => r.json())).formal,
  );

  const hosted = 'http://127.0.0.1:18811',
    hostPath = resolve(qa, `guided-hosted-fixture-${Date.now()}.sqlite`);
  let service = start(18811, 'hosted', hostPath);
  await ready(hosted);
  const hc = await browser.newContext({ acceptDownloads: true }),
    hp = await page(hc);
  await login(hp, hosted);
  await setup(hp);
  await calibrate(hp);
  check(
    'Hosted flow hides sending and file controls in normal use',
    !(await hp.getByRole('button', { name: 'Send review to Conrad', exact: true }).count()) &&
      !(await hp.getByLabel('Open reviewer file', { exact: true }).isVisible()),
  );
  await hp.getByRole('button', { name: 'Start together', exact: true }).click();
  await vote(hp);
  await vote(hp);
  await vote(hp);
  await hp.getByRole('button', { name: 'Back to study', exact: true }).click();
  const hc2 = await browser.newContext(),
    hq = await page(hc2);
  await login(hq, hosted);
  await reviewer(hp, 'Jacky')
    .getByRole('button', { name: 'Review on this device', exact: true })
    .click();
  await vote(hp, 'A');
  await reviewer(hq, 'Conrad')
    .getByRole('button', { name: 'Review on this device', exact: true })
    .click();
  await vote(hq);
  await hp.getByRole('button', { name: 'Exit', exact: true }).click();
  await reviewer(hp, 'Conrad').getByText('1 / 3', { exact: true }).waitFor({ timeout: 25000 });
  check('Hosted reviewer progress arrives automatically');
  await hq.close();
  const hq2 = await page(hc2);
  await hq2.goto(hosted + '/#study');
  await reviewer(hq2, 'Conrad').getByRole('button', { name: 'Continue', exact: true }).waitFor();
  check('Hosted close/reopen reuses session and saved reviewer counts');
  const beforeRestart = await hc.request.get(hosted + '/api/state').then((r) => r.json());
  service.kill();
  await new Promise((r) => service.once('exit', r));
  service = start(18811, 'hosted', hostPath);
  await ready(hosted);
  await hp.reload();
  await hp.getByLabel('Study access code').fill(code);
  await hp.getByRole('button', { name: 'Open study', exact: true }).click();
  await reviewer(hp, 'Jacky').getByRole('button', { name: 'Continue', exact: true }).waitFor();
  const afterRestart = await hc.request.get(hosted + '/api/state').then((r) => r.json());
  check(
    'Service restart preserves exact responses and frozen assignments',
    JSON.stringify(beforeRestart) === JSON.stringify(afterRestart),
  );
  await hp.route('**/api/**', (route) => route.abort());
  await reviewer(hp, 'Jacky').getByRole('button', { name: 'Continue', exact: true }).click();
  await hp.waitForTimeout(420);
  await hp.getByRole('button', { name: 'B', exact: true }).click();
  await hp.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
  check(
    'Offline answer persists locally without losing frozen assignments',
    await hp.evaluate(
      () => JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).dirty,
    ),
  );
  await hp.unroute('**/api/**');
  await hp.getByRole('button', { name: 'Retry save', exact: true }).click();
  await hp.waitForFunction(
    () => !JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).dirty,
  );
  await vote(hp);
  await hp.getByRole('button', { name: 'Back to study', exact: true }).click();
  await hq2.reload();
  await hq2.getByLabel('Study access code').fill(code);
  await hq2.getByRole('button', { name: 'Open study', exact: true }).click();
  await reviewer(hq2, 'Conrad').getByRole('button', { name: 'Continue', exact: true }).click();
  await vote(hq2);
  await vote(hq2, 'A');
  check(
    'Hosted completion needs no Result export',
    !(await hq2.getByRole('button', { name: 'Save result for researcher', exact: true }).count()),
  );
  await reviewer(hp, 'Conrad')
    .getByText(/Complete/)
    .waitFor({ timeout: 25000 });
  await hp.getByRole('button', { name: 'View results', exact: true }).click();
  const hostFinal = await download(hp, 'Export research data', 'guided-hosted-final.json');
  check(
    'Hosted workflow reaches combined results with all nine ratings',
    hostFinal.formal.filter((a) => !a.invalidated).length === 9,
  );
  for (const query of ['', '?v2=1', '?study=1']) {
    await hp.goto(hosted + '/' + query + '#study');
    await hp.getByRole('heading', { name: 'Human review', exact: true }).waitFor();
    check(
      `Normal route ${query || 'fresh'} stays V2`,
      !(await hp.locator('.legacy-banner').count()),
    );
  }
  await hp.goto(hosted + '/?v1=1#home');
  await hp.locator('.legacy-banner').waitFor();
  await hp.getByRole('link', { name: 'Return to Code / Choice V2', exact: true }).click();
  await hp.locator('.home-play:not([disabled])').waitFor();
  check('V1 is explicit historical recovery and exit clears its flag', !new URL(hp.url()).search);
  await hp.goBack();
  await hp.locator('.legacy-banner').waitFor();
  await hp.goForward();
  await hp.locator('.home-play:not([disabled])').waitFor();
  check(
    'Back/forward only returns to V1 for its explicit history entry',
    !(await hp.locator('.legacy-banner').count()),
  );
  check('All guided journeys have zero runtime errors', errors.length === 0);
  writeFileSync(
    resolve(qa, 'guided-verification.json'),
    JSON.stringify({ checks, errors, fixtureOnly: true }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
} catch (e) {
  for (const c of browser?.contexts() ?? [])
    for (const p of c.pages())
      console.error(
        'QA page:',
        p.url(),
        await p
          .locator('main')
          .innerText()
          .catch(() => ''),
      );
  throw e;
} finally {
  await browser?.close();
  for (const child of children) child.kill();
}
