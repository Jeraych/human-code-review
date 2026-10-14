// Exact local and hosted journeys, using isolated SQLite files and synthetic answers only.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const root = resolve(import.meta.dirname, '..'),
  qa = resolve(root, 'qa/v2');
mkdirSync(qa, { recursive: true });
const checks = [],
  errors = [],
  children = [];
const code = 'fixture-' + crypto.randomUUID();
let browser;
function check(name, ok = true) {
  assert.ok(ok, name);
  checks.push(name);
}
function start(port, transport, path) {
  const child = spawn(process.execPath, ['server/api.ts'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      STUDY_TRANSPORT: transport,
      STUDY_ACCESS_CODE: code,
      STUDY_DB_PATH: path,
    },
    windowsHide: true,
    stdio: 'ignore',
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
  throw Error('Service unavailable');
}
const card = (page, r) =>
  page.locator('.study-card').filter({ has: page.getByRole('heading', { name: r, exact: true }) });
async function login(page, url) {
  await page.goto(url + '/#study');
  await page.reload();
  await page.getByLabel('Study access code').fill(code);
  await page.getByRole('button', { name: 'Enter Study', exact: true }).click();
  await card(page, 'Researcher').waitFor();
}
async function openResearch(page) {
  await card(page, 'Researcher').getByRole('button').click();
  await page.getByRole('heading', { name: 'Study Setup', exact: true }).waitFor();
}
async function setup(page) {
  await openResearch(page);
  const form = page.getByRole('region', { name: 'Study Setup' });
  await form.getByRole('checkbox', { name: 'C vs J', exact: true }).uncheck();
  await form.getByRole('checkbox', { name: 'S vs SJ', exact: true }).uncheck();
  await form.getByLabel('Joint Consensus Formal pairs', { exact: true }).fill('0');
  await form.getByLabel('Calibration pairs', { exact: true }).fill('2');
  await form.getByLabel('Independent Formal pairs per reviewer', { exact: true }).fill('7');
  await form.getByLabel('Independent overlap pairs', { exact: true }).fill('4');
  check(
    'Live preview derives tiny fixture workload',
    /Calibration: 2 pairs/.test(await form.innerText()) &&
      /Jacky independent: 7/.test(await form.innerText()),
  );
  await form.getByRole('button', { name: 'Save Setup', exact: true }).click();
  await page.getByRole('button', { name: 'Start Joint Calibration', exact: true }).click();
  for (let i = 0; i < 2; i++) {
    if (i) await page.getByRole('button', { name: 'Next calibration comparison' }).click();
    await page.getByRole('button', { name: 'Equal', exact: true }).click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await page.getByRole('button', { name: 'Next calibration comparison' }).waitFor();
  }
  await page
    .getByLabel('Reviewer guideline', { exact: true })
    .fill(
      'Synthetic QA: prefer clear readable and maintainable code; choose Equal for no preference.',
    );
  await page.getByRole('button', { name: 'Lock Calibration', exact: true }).click();
  await page.getByRole('heading', { name: 'Calibration complete', exact: true }).waitFor();
  check(
    'Locked Calibration leads directly to Generate Study',
    await page.getByRole('button', { name: 'Generate Study', exact: true }).isEnabled(),
  );
  await page.getByRole('button', { name: 'Generate Study', exact: true }).click();
  await page.getByRole('heading', { name: 'Study Setup', exact: true }).waitFor();
}
async function saveDownload(page, button, path) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const file = await event;
  await file.saveAs(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}
async function vote(page, undo = false) {
  await page.getByRole('button', { name: 'Equal', exact: true }).click();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).waitFor();
  if (undo) {
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('button', { name: 'B', exact: true }).click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
}
try {
  browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  const dbPath = resolve(qa, `transport-local-${Date.now()}.sqlite`);
  start(18794, 'local', dbPath);
  await ready('http://127.0.0.1:18794');
  const local = 'http://127.0.0.1:18794';
  const main = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const research = await main.newPage();
  research.on('pageerror', (e) => errors.push(e.message));
  await login(research, local);
  await setup(research);
  check(
    'Local Researcher shows obvious Offline Transfer',
    await research.getByRole('heading', { name: 'Offline Transfer', exact: true }).isVisible(),
  );
  check(
    'Early analysis stays disabled',
    await research.getByRole('button', { name: 'Merge & Analyse', exact: true }).isDisabled(),
  );
  await research.screenshot({
    path: resolve(qa, 'workflow-local-researcher-desktop.png'),
    fullPage: true,
  });
  await research.setViewportSize({ width: 390, height: 844 });
  check(
    'Local researcher fits mobile',
    await research.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await research.screenshot({
    path: resolve(qa, 'workflow-local-researcher-mobile.png'),
    fullPage: true,
  });
  const packages = {};
  for (const r of ['Jacky', 'Conrad'])
    packages[r] = await saveDownload(
      research,
      `Export ${r} Study`,
      resolve(qa, `transport-${r}.study.json`),
    );
  check(
    'Both packages share exactly one frozen Study',
    packages.Jacky.studyId === packages.Conrad.studyId,
  );
  // Clean computers, deliberately without API access: reviewer packages require no code or manual identity.
  for (const r of ['Jacky', 'Conrad']) {
    const c = await browser.newContext({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
    });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.route('**/api/**', (route) => route.abort());
    await p.goto(local + '/#study');
    await p.waitForFunction(
      () => !document.querySelector('input[aria-label="Import Study"]')?.disabled,
    );
    await p
      .getByLabel('Import Study', { exact: true })
      .setInputFiles(resolve(qa, `transport-${r}.study.json`));
    await card(p, r).waitFor();
    check(
      `${r} import identifies reviewer and hides researcher workflow`,
      (await p.getByText(`Reviewer: ${r}`, { exact: true }).isVisible()) &&
        (await p.getByRole('heading', { name: 'Researcher', exact: true }).count()) === 0,
    );
    await card(p, r).getByRole('button').click();
    check(
      `${r} Formal is blind and has no configuration`,
      !/Ruff|Judge-trained|Style-trained|Pretrained Base|Study Setup|Randomisation seed/.test(
        await p.locator('main').innerText(),
      ) && (await p.getByRole('spinbutton').count()) === 0,
    );
    await vote(p, r === 'Jacky');
    await vote(p);
    await p.getByRole('button', { name: 'Exit Study', exact: true }).click();
    await p.reload();
    await card(p, r).waitFor();
    check(
      `${r} Exit and reload retain 2 of 7`,
      await card(p, r).getByText('2 / 7', { exact: true }).isVisible(),
    );
    if (r === 'Jacky') {
      await p.evaluate(() =>
        dispatchEvent(new StorageEvent('storage', { key: 'code-choice.v2-reviewer-package' })),
      );
      await p.getByRole('alert').waitFor();
      const saved = await saveDownload(
        p,
        'Export cached backup',
        resolve(qa, 'transport-reviewer-recovery.json'),
      );
      check(
        'Reviewer recovery exports own Result rather than researcher state',
        saved.format === 'code-choice-v2-reviewer-result' &&
          saved.reviewer === 'Jacky' &&
          saved.answers.filter((a) => !a.invalidated).length === 2,
      );
      await p.getByRole('button', { name: 'Return to Study', exact: true }).click();
      check(
        'Reviewer recovery returns without an access or identity step',
        (await card(p, r).isVisible()) && !(await p.getByLabel('Study access code').count()),
      );
    }
    await card(p, r).getByRole('button', { name: 'Continue', exact: true }).click();
    for (let i = 2; i < 7; i++) await vote(p);
    await p.getByRole('heading', { name: 'Study complete', exact: true }).waitFor();
    check(
      `${r} completion offers Export Result`,
      await p.getByRole('button', { name: 'Export Result', exact: true }).isVisible(),
    );
    await saveDownload(p, 'Export Result', resolve(qa, `transport-${r}-result.json`));
    await c.close();
  }
  // Friendly incompatibility and conflict failures, without altering good responses.
  const bad = {
    ...JSON.parse(readFileSync(resolve(qa, 'transport-Jacky-result.json'), 'utf8')),
    studyId: 'different',
  };
  const { digest } = await import('../src/v2Transfer.ts');
  const { checksum, ...content } = bad;
  bad.checksum = await digest(content);
  writeFileSync(resolve(qa, 'transport-wrong-result.json'), JSON.stringify(bad));
  await research
    .getByLabel('Import Jacky Result', { exact: true })
    .setInputFiles(resolve(qa, 'transport-wrong-result.json'));
  await research.getByRole('alert').waitFor();
  check(
    'Wrong Study gives friendly error',
    await research
      .getByRole('alert')
      .getByText('This result belongs to a different Study.', { exact: true })
      .first()
      .isVisible(),
  );
  await research.getByRole('button', { name: 'Dismiss', exact: true }).click();
  for (const r of ['Jacky', 'Conrad']) {
    await research
      .getByLabel(`Import ${r} Result`, { exact: true })
      .setInputFiles(resolve(qa, `transport-${r}-result.json`));
    await research
      .getByRole('status')
      .filter({ hasText: `${r} Result imported.` })
      .waitFor();
  }
  check(
    'Local result imports show complete reviewers and full overlap',
    (await research
      .getByText('Overlap: 4 / 4 available for agreement analysis', { exact: true })
      .isVisible()) &&
      (await research.getByText('7 / 7 · ✓ Complete', { exact: true }).count()) === 2,
  );
  const fork = JSON.parse(readFileSync(resolve(qa, 'transport-Jacky-result.json'), 'utf8'));
  fork.answers.find((a) => !a.invalidated).choice = 'A';
  const { checksum: _old, ...forkContent } = fork;
  fork.checksum = await digest(forkContent);
  writeFileSync(resolve(qa, 'transport-fork.json'), JSON.stringify(fork));
  await research
    .getByLabel('Import Jacky Result', { exact: true })
    .setInputFiles(resolve(qa, 'transport-fork.json'));
  await research.getByRole('alert').waitFor();
  check(
    'Conflicting responses cannot overwrite original',
    await research
      .getByRole('alert')
      .getByText(/Conflicting responses/)
      .first()
      .isVisible(),
  );
  await research.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await research.getByRole('button', { name: 'Merge & Analyse', exact: true }).click();
  await research.getByRole('heading', { name: 'Summary', exact: true }).waitFor();
  const final = await saveDownload(
    research,
    'Export Final Research Data',
    resolve(qa, 'transport-local-final.json'),
  );
  check(
    'Local final export preserves both source files, Undo and configuration',
    final.protocol.resultImports.length === 2 &&
      final.formal.filter((a) => !a.invalidated).length === 14 &&
      final.formal.some((a) => a.invalidated?.kind === 'undo') &&
      final.analysis.results.length === 2,
  );
  // Reset is one confirmation, and preserves all valuable data internally.
  await research
    .getByRole('region', { name: 'Study Setup' })
    .getByText('Advanced', { exact: true })
    .click();
  research.once('dialog', (d) => d.accept());
  await research.getByRole('button', { name: 'Reset Study', exact: true }).click();
  await research.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.archives.at(-1)
        .state.unblindedAt,
  );
  check(
    'Reset preserves completed protocol and source files in history',
    await research.evaluate(
      () =>
        JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.archives.at(-1)
          .state.resultImports.length === 2,
    ),
  );
  // Hosted: independent reviewer browser contexts, automatic progress and persisted responses after restart.
  const hosted = 'http://127.0.0.1:18796',
    hostDb = resolve(qa, `transport-hosted-${Date.now()}.sqlite`);
  let service = start(18796, 'hosted', hostDb);
  await ready(hosted);
  const hc = await browser.newContext({ acceptDownloads: true });
  const hp = await hc.newPage();
  hp.on('pageerror', (e) => errors.push(e.message));
  await login(hp, hosted);
  await setup(hp);
  check(
    'Hosted Researcher shows Remote Study with file controls hidden',
    (await hp.getByRole('heading', { name: 'Remote Study', exact: true }).isVisible()) &&
      !(await hp.getByRole('button', { name: 'Export Jacky Study', exact: true }).isVisible()),
  );
  const contexts = {};
  for (const r of ['Jacky', 'Conrad']) {
    const c = await browser.newContext();
    let p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await login(p, hosted);
    await card(p, r).getByRole('button').click();
    await vote(p);
    await p.close();
    p = await c.newPage();
    await login(p, hosted);
    check(
      `${r} hosted close/reopen resumes own count`,
      await card(p, r).getByText('1 / 7', { exact: true }).isVisible(),
    );
    contexts[r] = { c, p };
  }
  await hp.waitForFunction(
    () => {
      const s = JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state;
      return ['Jacky', 'Conrad'].every(
        (r) => s.answers.filter((a) => a.reviewer === r && !a.invalidated).length === 1,
      );
    },
    null,
    { timeout: 25000 },
  );
  check(
    'Researcher receives both independent progress values automatically',
    (await hp.getByText('1 / 7', { exact: true }).count()) === 2,
  );
  await hp.screenshot({ path: resolve(qa, 'workflow-hosted-progress.png'), fullPage: true });
  const before = await hc.request.get(hosted + '/api/state').then((r) => r.json());
  service.kill();
  await new Promise((r) => service.once('exit', r));
  service = start(18796, 'hosted', hostDb);
  await ready(hosted);
  await login(hp, hosted);
  await openResearch(hp);
  const after = await hc.request.get(hosted + '/api/state').then((r) => r.json());
  check(
    'Restart preserves exact reviewer responses and assignment mappings',
    JSON.stringify(before) === JSON.stringify(after),
  );
  await contexts.Conrad.p.getByLabel('Study access code').waitFor({ timeout: 20000 });
  check(
    'Expired shared session reconnects without losing reviewer cache',
    await contexts.Conrad.p.evaluate(
      () =>
        JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state.answers.filter(
          (a) => a.reviewer === 'Conrad' && !a.invalidated,
        ).length === 1,
    ),
  );
  for (const r of ['Jacky', 'Conrad']) {
    const { p } = contexts[r];
    await login(p, hosted);
    await card(p, r).getByRole('button').click();
    for (let i = 1; i < 7; i++) await vote(p);
    await p.getByRole('heading', { name: 'Study complete', exact: true }).waitFor();
    check(
      `${r} hosted completion needs no result export`,
      (await p.getByRole('button', { name: 'Export Result', exact: true }).count()) === 0,
    );
  }
  await hp
    .getByRole('button', { name: 'Unblind & Analyse', exact: true })
    .waitFor({ state: 'visible' });
  await hp.waitForFunction(
    () => {
      const s = JSON.parse(localStorage.getItem('code-choice.human-validation-v2')).state;
      return s.answers.filter((a) => !a.invalidated).length === 14;
    },
    null,
    { timeout: 25000 },
  );
  await hp.getByRole('button', { name: 'Unblind & Analyse', exact: true }).click();
  await hp.getByRole('heading', { name: 'Summary', exact: true }).waitFor();
  const hostedFinal = await saveDownload(
    hp,
    'Export Final Research Data',
    resolve(qa, 'transport-hosted-final.json'),
  );
  check(
    'Hosted final export uses same responses and analysis counts',
    hostedFinal.formal.length === 14 &&
      hostedFinal.analysis.results.length === 2 &&
      hostedFinal.analysis.results.every((r) => r.overlapPairs === 2),
  );
  // Routing: old local state, false flags, hash and browser history cannot implicitly select V1.
  const routePage = await main.newPage();
  routePage.on('pageerror', (e) => errors.push(e.message));
  const catalog = JSON.parse(readFileSync(resolve(root, 'public/v2/catalog.json'), 'utf8'));
  await routePage.route('**/api/health', (route) =>
    route.fulfill({
      json: { protocolVersion: catalog.protocolVersion, catalogHash: catalog.catalogHash },
    }),
  );
  await routePage.goto(local + '/#study');
  await routePage
    .getByText(
      'Restart the Study service to use this update. Your browser progress is preserved.',
      { exact: true },
    )
    .waitFor();
  check(
    'Stale service requests restart and retains V2 without old backend writes',
    (await routePage.locator('.legacy-banner').count()) === 0,
  );
  await routePage.unroute('**/api/health');
  for (const query of ['?v1=0', '?v1=false', '?v1', '?mode=v1', '']) {
    await routePage.goto(local + '/' + query + '#study');
    await routePage.getByRole('heading', { name: 'Human Validation', exact: true }).waitFor();
    check(
      `V2 remains default for ${query || 'no query'}`,
      (await routePage.locator('.legacy-banner').count()) === 0,
    );
  }
  await routePage.goto(local + '/?v1=1#home');
  await routePage.locator('.legacy-banner').waitFor();
  check('Only explicit legacy request loads V1', true);
  await routePage.getByRole('link', { name: 'Return to Code / Choice V2', exact: true }).click();
  await routePage.locator('.home-play:not([disabled])').waitFor();
  check('Legacy exit clears query and returns to V2', new URL(routePage.url()).search === '');
  await routePage.goBack();
  await routePage.locator('.legacy-banner').waitFor();
  await routePage.goForward();
  await routePage.locator('.home-play:not([disabled])').waitFor();
  check(
    'Back/Forward preserves explicit app selection',
    (await routePage.locator('.legacy-banner').count()) === 0,
  );
  await routePage.evaluate(() => {
    localStorage.setItem(
      'human-code-evaluation.v1',
      JSON.stringify({ activeSessionId: 'stale-v1', sessions: [] }),
    );
    history.pushState(null, '', '?v1=1#home');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await routePage.locator('.legacy-banner').waitFor();
  await routePage.evaluate(() => {
    history.pushState(null, '', '#study');
    const url = new URL(location.href);
    url.search = '';
    history.replaceState(null, '', url);
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await routePage.getByRole('heading', { name: 'Human Validation', exact: true }).waitFor();
  check(
    'Same-document history and persisted V1 state cannot keep stale app mode',
    (await routePage.locator('.legacy-banner').count()) === 0,
  );
  check('Both journeys have zero browser runtime errors', errors.length === 0);
  writeFileSync(
    resolve(qa, 'transport-verification.json'),
    JSON.stringify({ checks, errors, fixtureOnly: true }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2));
} catch (e) {
  for (const c of browser?.contexts() || [])
    for (const p of c.pages()) {
      console.error(
        'QA page:',
        p.url(),
        await p
          .locator('main')
          .innerText()
          .catch(() => ''),
      );
    }
  console.error(e);
  throw e;
} finally {
  await browser?.close();
  for (const child of children) child.kill();
}
