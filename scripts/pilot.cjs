// Browser pilot uses the desktop's bundled Playwright, without an app dependency.
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const app = path.resolve(__dirname, '..');
const qa = path.join(app, 'qa');
fs.mkdirSync(qa, { recursive: true });
const profile = path.join(qa, `browser-profile-${Date.now()}`);
const key = 'human-code-evaluation.v1';
const pool = JSON.parse(fs.readFileSync(path.join(app, 'public/pools/evaluation-01-v1.json')));
const checks = [],
  errors = [],
  requests = [];
let context;
const start = async () => {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.argv[3] ? { executablePath: process.argv[3] } : {}),
    viewport: { width: 1440, height: 1050 },
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('http://127.0.0.1:5173');
  return page;
};
const state = async (page) => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), key));
const active = (store) => store.sessions.find((s) => s.sessionId === store.activeSessionId);
const next = (s) => s.assignments.find((a) => !Object.hasOwn(s.responses, a.pairId));
const check = (label, ok) => {
  assert.ok(ok, label);
  checks.push(label);
};
async function mapping(page, s) {
  const a = next(s);
  const p = pool.pairs.find((p) => p.pairId === a.pairId);
  await page.locator('.code-scroll .shiki').first().waitFor();
  for (const label of ['A', 'B']) {
    const id = label === 'A' ? a.aCandidateId : a.bCandidateId;
    const code = p.candidates.find((c) => c.candidateId === id).code;
    const rendered = await page
      .getByRole('region', { name: `Code ${label}`, exact: true })
      .locator('pre')
      .textContent();
    check(`Rendered ${label} maps to saved candidate`, rendered === code);
  }
}
(async () => {
  let page = await start();
  await page.getByRole('button', { name: /Enter Study/ }).click();
  await page.getByLabel('Evaluator ID', { exact: true }).fill('pilot-only-01');
  await page.getByRole('button', { name: 'Start study', exact: true }).click();
  await page.getByText('Read the code. Make your choice.', { exact: true }).waitFor();
  let s = active(await state(page));
  const schedule = JSON.stringify(s.assignments);
  check(
    '30 assignments saved before first vote',
    s.assignments.length === 30 && Object.keys(s.responses).length === 0,
  );
  check('No identity request during Study', !requests.some((r) => r.includes('/play/')));
  check(
    'No Base or Style identity text in Study',
    !/(Base|Style-trained|Before|After)/.test(await page.locator('main').innerText()),
  );
  await mapping(page, s);
  await page.screenshot({ path: path.join(qa, 'study-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(qa, 'study-mobile.png'), fullPage: true });
  check(
    'Mobile does not overflow viewport',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole('radio', { name: /About equal/ }).check();
  await page.getByRole('checkbox', { name: 'Readability', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Other', exact: true }).check();
  await page.getByLabel('Other reason', { exact: true }).fill('Naming, quotes " and\nnew line');
  await page.reload();
  check(
    'Unsubmitted draft survives refresh',
    (await page.getByRole('radio', { name: /About equal/ }).isChecked()) &&
      (await page.getByRole('checkbox', { name: 'Readability', exact: true }).isChecked()),
  );
  await page.getByRole('button', { name: /Submit & next/ }).click();
  s = active(await state(page));
  check(
    'Submitted response persists',
    Object.keys(s.responses).length === 1 && Object.values(s.responses)[0].choice === 'tie',
  );
  check(
    'Play blocked during unfinished Study',
    await page.getByRole('button', { name: 'Play', exact: true }).isDisabled(),
  );
  await context.close();
  page = await start();
  s = active(await state(page));
  await page.getByText('Read the code. Make your choice.', { exact: true }).waitFor();
  check(
    'Normal browser restart resumes next unanswered pair',
    Object.keys(s.responses).length === 1 && JSON.stringify(s.assignments) === schedule,
  );
  await mapping(page, s);
  const choices = ['Both poor', 'Prefer A', 'Prefer B', 'About equal'];
  for (let i = 1; i < 30; i++) {
    await page.getByRole('radio', { name: new RegExp(choices[(i - 1) % 4]) }).check();
    if (i === 1) await page.getByRole('checkbox', { name: 'Robustness', exact: true }).check();
    await page.getByRole('button', { name: /Submit & next/ }).click();
    await page.waitForFunction(
      ({ key, count }) =>
        Object.keys(JSON.parse(localStorage.getItem(key)).sessions[0].responses).length === count,
      { key, count: i + 1 },
    );
  }
  await page.getByText('One final step: export your results.', { exact: true }).waitFor();
  s = active(await state(page));
  check(
    'All 30 pairs completed exactly once',
    Object.keys(s.responses).length === 30 &&
      new Set(Object.values(s.responses).map((r) => r.pairId)).size === 30,
  );
  check('Schedule unchanged through completion', JSON.stringify(s.assignments) === schedule);
  await page.screenshot({ path: path.join(qa, 'study-complete.png'), fullPage: true });
  let pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON result', exact: true }).click();
  await (await pending).saveAs(path.join(qa, 'pilot-result.json'));
  pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  await (await pending).saveAs(path.join(qa, 'pilot-result.csv'));
  const exported = JSON.parse(fs.readFileSync(path.join(qa, 'pilot-result.json')));
  check(
    'Actual downloaded JSON is complete and matches saved responses',
    exported.status === 'complete' &&
      JSON.stringify(exported.session.responses) === JSON.stringify(s.responses),
  );
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Style', exact: true }).click();
  await page.getByRole('button', { name: 'Choose implementation A', exact: true }).waitFor();
  check(
    'Play has no reveal before voting',
    !(await page.getByText('THE REVEAL', { exact: true }).count()),
  );
  await page
    .getByRole('button', { name: 'Choose implementation A', exact: true })
    .click({ position: { x: 60, y: 25 } });
  await page.getByText('THE REVEAL', { exact: true }).waitFor();
  check(
    'Play reveals both condition labels after voting',
    /Base/.test(await page.locator('.reveal').innerText()) &&
      /Style-trained/.test(await page.locator('.reveal').innerText()),
  );
  await page.screenshot({ path: path.join(qa, 'play-reveal.png'), fullPage: true });
  await page.getByRole('button', { name: /Next comparison/ }).click();
  await page.getByRole('button', { name: 'Choose implementation A', exact: true }).waitFor();
  check(
    'Next Play round hides identities again',
    !(await page.getByText('THE REVEAL', { exact: true }).count()),
  );
  check(
    'Play does not mutate formal responses',
    JSON.stringify(active(await state(page)).responses) === JSON.stringify(s.responses),
  );
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Researcher setup', exact: true }).click();
  await page.getByLabel('Evaluator ID', { exact: true }).fill('pilot-only-02');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Start a new study', exact: true }).click();
  check(
    'New session preserves completed original',
    (await state(page)).sessions.length === 2 &&
      Object.keys((await state(page)).sessions[0].responses).length === 30,
  );
  // Simulate a deployment mismatch without replacing any pool assets.
  await page.evaluate((key) => {
    const store = JSON.parse(localStorage.getItem(key));
    store.sessions.find((s) => s.sessionId === store.activeSessionId).poolHash = 'changed';
    localStorage.setItem(key, JSON.stringify(store));
  }, key);
  await page.reload();
  await page.getByRole('alert').waitFor();
  check(
    'Changed pool blocks voting and preserves old responses',
    (await page
      .getByRole('alert')
      .innerText()
      .then((t) => t.includes('original examples'))) &&
      (await state(page)).sessions[0].responses !== undefined &&
      (await page.getByRole('button', { name: /Submit & next/ }).count()) === 0,
  );
  await page.evaluate(
    ({ key, hash }) => {
      const store = JSON.parse(localStorage.getItem(key));
      store.sessions.find((s) => s.sessionId === store.activeSessionId).poolHash = hash;
      localStorage.setItem(key, JSON.stringify(store));
    },
    { key, hash: s.poolHash },
  );
  await page.reload();
  await page.getByRole('radio', { name: /Prefer A/ }).waitFor();
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new Error('pilot simulated quota failure');
      return original.call(this, k, v);
    };
  }, key);
  await page.getByRole('radio', { name: /Prefer A/ }).check();
  await page.getByRole('button', { name: /Submit & next/ }).click();
  check(
    'Failed browser save does not advance or lose original responses',
    Object.keys(active(await state(page)).responses).length === 0 &&
      (await state(page)).sessions[0].responses &&
      Object.keys((await state(page)).sessions[0].responses).length === 30,
  );
  await page.getByRole('alert').waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Researcher setup', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(path.join(qa, 'pilot-result.json'));
  await page.getByText('One final step: export your results.', { exact: true }).waitFor();
  check(
    'JSON backup import restores completed session',
    Object.keys(active(await state(page)).responses).length === 30,
  );
  await page.getByRole('button', { name: 'Researcher setup', exact: true }).click();
  const conflict = structuredClone(exported);
  const first = Object.values(conflict.session.responses)[0];
  first.choice = first.choice === 'B' ? 'A' : 'B';
  fs.writeFileSync(path.join(qa, 'conflicting-backup.json'), JSON.stringify(conflict));
  await page.locator('input[type=file]').setInputFiles(path.join(qa, 'conflicting-backup.json'));
  await page.getByRole('alert').waitFor();
  check(
    'Conflicting backup import is refused',
    await page
      .getByRole('alert')
      .innerText()
      .then((t) => t.includes('different progress')),
  );
  const intact = await state(page);
  await page.evaluate((key) => localStorage.setItem(key, '{bad'), key);
  await page.reload();
  await page.getByRole('alert').waitFor();
  check(
    'Corrupt browser storage fails closed without overwriting',
    (await page.evaluate((key) => localStorage.getItem(key), key)) === '{bad',
  );
  await page.evaluate(({ key, intact }) => localStorage.setItem(key, JSON.stringify(intact)), {
    key,
    intact,
  });
  await page.reload();
  check('No browser runtime errors', errors.length === 0);
  fs.writeFileSync(
    path.join(qa, 'pilot-report.json'),
    JSON.stringify(
      {
        checks,
        errors,
        profile,
        formalResponses: 30,
        viewports: ['1440x1050', '390x844'],
        syntheticParticipantOnly: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { passed: checks.length, errors, report: path.join(qa, 'pilot-report.json') },
      null,
      2,
    ),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await context?.close();
  });
