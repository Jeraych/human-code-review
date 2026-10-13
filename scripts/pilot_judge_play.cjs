const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const app = path.resolve(__dirname, '..'),
  qa = path.join(app, 'qa');
fs.mkdirSync(qa, { recursive: true });
const profile = path.join(qa, `judge-play-profile-${Date.now()}`),
  key = 'human-code-evaluation.v1';
const judge = JSON.parse(fs.readFileSync(path.join(app, 'public/pools/evaluation-02-v1.json')));
const keys = {
  Style: JSON.parse(fs.readFileSync(path.join(app, 'public/play/evaluation-01-v1.json'))),
  Judge: JSON.parse(fs.readFileSync(path.join(app, 'public/play/evaluation-02-v1.json'))),
};
const checks = [],
  errors = [];
let context, page;
const check = (label, ok) => {
  assert.ok(ok, label);
  checks.push(label);
};
const state = async () => JSON.parse(await page.evaluate((key) => localStorage.getItem(key), key));
const active = (store) => store.sessions.find((s) => s.sessionId === store.activeSessionId);
const start = async () => {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: process.argv[3],
    viewport: { width: 1440, height: 1050 },
  });
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
};
const card = (side) =>
  page.getByRole('button', { name: `Choose implementation ${side}`, exact: true });
const count = async () => Number(await page.locator('.play-stat strong').innerText());
async function labelsCorrect(condition) {
  const panels = await page.locator('.play-selectable').all();
  const texts = await Promise.all(panels.map((p) => p.locator('.code-scroll pre').textContent()));
  const pool = JSON.parse(
    fs.readFileSync(
      path.join(app, `public/pools/evaluation-0${condition === 'Style' ? 1 : 2}-v1.json`),
    ),
  );
  const pair = pool.pairs.find(
    (p) =>
      p.candidates.some((c) => c.code === texts[0]) &&
      p.candidates.some((c) => c.code === texts[1]),
  );
  check(`Valid ${condition} Play pair`, !!pair);
  for (let i = 0; i < 2; i++) {
    const label = await panels[i].locator('.code-heading>span').innerText();
    check(
      `${condition} reveal ${i ? 'B' : 'A'} agrees with frozen identity`,
      pair.candidates
        .filter((c) => c.code === texts[i])
        .some((c) => keys[condition].labels[c.candidateId] === label),
    );
  }
}
(async () => {
  await start();
  await page.getByRole('button', { name: /Enter Study/ }).click();
  await page.getByRole('combobox', { name: 'Study condition' }).selectOption('evaluation-02');
  await page.getByLabel('Evaluator ID', { exact: true }).fill('judge-pilot-only');
  await page.getByRole('button', { name: 'Start study', exact: true }).click();
  await page.getByText('Read the code. Make your choice.', { exact: true }).waitFor();
  let s = active(await state()),
    schedule = JSON.stringify(s.assignments);
  check('Judge Study uses its own frozen pool', s.poolId === 'evaluation-02');
  check(
    'Judge Study remains neutral',
    !/(Base|Style-trained|Judge-trained|Judge Study)/.test(await page.locator('main').innerText()),
  );
  const first = s.assignments[0],
    pair = judge.pairs.find((p) => p.pairId === first.pairId);
  await page.locator('.code-scroll .shiki').first().waitFor();
  for (const side of ['A', 'B'])
    check(
      `Judge Study rendered ${side} matches assignment`,
      (await page
        .getByRole('region', { name: `Code ${side}`, exact: true })
        .locator('pre')
        .textContent()) ===
        pair.candidates.find(
          (c) => c.candidateId === (side === 'A' ? first.aCandidateId : first.bCandidateId),
        ).code,
    );
  await page.screenshot({ path: path.join(qa, 'judge-study-desktop.png'), fullPage: true });
  await page.getByRole('radio', { name: /Prefer B/ }).check();
  await page.getByRole('checkbox', { name: 'Maintainability', exact: true }).check();
  await page.getByRole('button', { name: /Submit & next/ }).click();
  await context.close();
  await start();
  await page.getByText('Read the code. Make your choice.', { exact: true }).waitFor();
  s = active(await state());
  check(
    'Judge browser restart resumes fixed schedule',
    s.poolId === 'evaluation-02' &&
      Object.keys(s.responses).length === 1 &&
      JSON.stringify(s.assignments) === schedule,
  );
  for (let i = 1; i < 30; i++) {
    await page.getByRole('radio', { name: /About equal/ }).check();
    await page.getByRole('button', { name: /Submit & next/ }).click();
    await page.waitForFunction(
      ({ key, n }) =>
        Object.keys(JSON.parse(localStorage.getItem(key)).sessions[0].responses).length === n,
      { key, n: i + 1 },
    );
  }
  await page.getByText('One final step: export your results.', { exact: true }).waitFor();
  s = active(await state());
  check('Judge completes all 30 once', Object.keys(s.responses).length === 30);
  for (const [button, name] of [
    ['Download JSON result', 'judge-pilot-result.json'],
    ['Download CSV', 'judge-pilot-result.csv'],
  ]) {
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: button, exact: true }).click();
    await (await waiting).saveAs(path.join(qa, name));
  }
  check(
    'Judge downloaded JSON retains pool and mapping',
    JSON.parse(fs.readFileSync(path.join(qa, 'judge-pilot-result.json'))).session.poolId ===
      'evaluation-02',
  );
  await page.getByRole('button', { name: 'Researcher setup', exact: true }).click();
  await page.getByRole('combobox', { name: 'Study condition' }).selectOption('evaluation-01');
  await page.getByLabel('Evaluator ID', { exact: true }).fill('same-browser-style-pilot');
  await page.getByRole('button', { name: 'Start a new study', exact: true }).click();
  check(
    'Style/Judge sessions coexist without overwrite',
    (await state()).sessions.length === 2 &&
      active(await state()).poolId === 'evaluation-01' &&
      (await state()).sessions[0].poolId === 'evaluation-02',
  );
  await page.getByRole('button', { name: 'Researcher setup', exact: true }).click();
  await page
    .locator('.session-row')
    .filter({ hasText: 'judge-pilot-only' })
    .getByRole('button', { name: 'Continue', exact: true })
    .click();
  await page.getByText('One final step: export your results.', { exact: true }).waitFor();
  check(
    'Researcher continues correct Judge session independently',
    active(await state()).poolId === 'evaluation-02',
  );
  const studyBackup = JSON.stringify((await state()).sessions);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Judge', exact: true }).click();
  check(
    'Play has no Study radio/submit form',
    (await page.getByRole('radio').count()) === 0 &&
      (await page.getByRole('button', { name: /Submit & next/ }).count()) === 0,
  );
  await card('A').dblclick({ position: { x: 60, y: 25 } });
  await page.getByText('THE REVEAL', { exact: true }).waitFor();
  check(
    'Double click A records one immediate vote',
    (await count()) === 1 && (await card('A').getAttribute('aria-pressed')) === 'true',
  );
  await labelsCorrect('Judge');
  await page.screenshot({ path: path.join(qa, 'judge-play-reveal-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: /Next round/ }).click();
  check(
    'Next hides identity and opens an unvoted round',
    (await page.locator('.reveal').count()) === 0 &&
      (await card('A').getAttribute('aria-pressed')) === 'false',
  );
  await card('B').click({ position: { x: 60, y: 25 } });
  await page.getByText('THE REVEAL', { exact: true }).waitFor();
  check(
    'B votes immediately',
    (await count()) === 2 && (await card('B').getAttribute('aria-pressed')) === 'true',
  );
  await page.getByRole('button', { name: /Next round/ }).click();
  await page.getByRole('button', { name: 'About equal', exact: true }).click();
  await page.getByText('THE REVEAL', { exact: true }).waitFor();
  check(
    'Equal is immediate and distinct',
    (await count()) === 3 && /about equal/.test(await page.locator('.reveal').innerText()),
  );
  await page.getByRole('button', { name: /Next round/ }).click();
  await page.getByRole('button', { name: 'Both poor', exact: true }).click();
  await page.getByText('THE REVEAL', { exact: true }).waitFor();
  check(
    'Both poor is immediate and distinct',
    (await count()) === 4 &&
      /Neither implementation/.test(await page.locator('.reveal').innerText()),
  );
  await page.getByRole('button', { name: 'Style', exact: true }).click();
  await card('A').focus();
  await page.keyboard.press('Enter');
  await page.getByText('THE REVEAL', { exact: true }).waitFor();
  check('Keyboard card vote works', (await count()) === 5);
  await labelsCorrect('Style');
  await page.getByRole('button', { name: 'Judge', exact: true }).click();
  let found = false;
  for (let i = 0; i < 50; i++) {
    const overflow = await page
      .locator('.code-scroll')
      .evaluateAll((nodes) => nodes.some((n) => n.scrollHeight > n.clientHeight + 8));
    if (overflow) {
      found = true;
      break;
    }
    await page.getByRole('button', { name: 'Judge', exact: true }).click();
  }
  check('A genuinely scrollable real example is available', found);
  const scrollIndex = await page
    .locator('.code-scroll')
    .evaluateAll((nodes) => nodes.findIndex((n) => n.scrollHeight > n.clientHeight + 8));
  const viewer = page.locator('.code-scroll').nth(scrollIndex);
  await viewer.hover();
  await page.mouse.wheel(0, 180);
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.code-scroll')).some((n) => n.scrollTop > 0),
  );
  check(
    'Scrolling real code never votes',
    (await count()) === 5 && (await page.locator('.reveal').count()) === 0,
  );
  const box = await viewer.boundingBox();
  await page.mouse.move(box.x + 35, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 50, { steps: 10 });
  await page.mouse.up();
  check(
    'Dragging/selecting code never votes',
    (await count()) === 5 && (await page.locator('.reveal').count()) === 0,
  );
  await page.evaluate(() => getSelection().removeAllRanges());
  const target = card(scrollIndex ? 'B' : 'A');
  const targetBox = await target.boundingBox();
  await page.mouse.move(targetBox.x + 60, targetBox.y + 25);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  check(
    'Long press never votes',
    (await count()) === 5 && (await page.locator('.reveal').count()) === 0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(qa, 'play-mobile.png'), fullPage: true });
  check(
    'Mobile Play has no document overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await card('B').click({ position: { x: 60, y: 25 } });
  await page.getByText('THE REVEAL', { exact: true }).waitFor();
  check('Mobile deliberate card choice works', (await count()) === 6);
  await page.screenshot({ path: path.join(qa, 'play-reveal-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Random', exact: true }).click();
  for (let i = 0; i < 6; i++) {
    await card('A').click({ position: { x: 60, y: 25 } });
    await page.getByText('THE REVEAL', { exact: true }).waitFor();
    const heading = await page.locator('.reveal').innerText();
    check(
      'Random reveal comes from an available real pool',
      /(Style-trained|Judge-trained)/.test(heading),
    );
    await page.getByRole('button', { name: /Next round/ }).click();
  }
  check(
    'Play never changes either Study session',
    JSON.stringify((await state()).sessions) === studyBackup,
  );
  check(
    'Per-comparison preference counts remain separate',
    (await page.locator('.play-preferences tbody tr').count()) === 2,
  );
  check('No runtime errors', errors.length === 0);
  fs.writeFileSync(
    path.join(qa, 'judge-play-report.json'),
    JSON.stringify(
      {
        checks,
        errors,
        syntheticParticipantOnly: true,
        viewports: ['1440x1050', '390x844'],
        judgeStudyResponses: 30,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: checks.length, errors }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await context?.close();
  });
