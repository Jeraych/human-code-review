// Isolated browser/API regression fixtures. Never opens .runtime or a production database.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { initialProtocol, DEFAULT_CONFIG, canonical, researchExport, analyse } from '../src/v2.ts';
import { exportStudy } from '../src/v2Transfer.ts';
import { visibleCode, curatePlay } from '../src/playV2.ts';
const { chromium } = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const root = resolve(import.meta.dirname, '..'),
  qa = resolve(root, 'qa/play-polish');
mkdirSync(qa, { recursive: true });
const db = {
  ...JSON.parse(readFileSync(resolve(root, 'public/v2/catalog.json'), 'utf8')),
  outputs: Object.fromEntries(
    ['B', 'C', 'S', 'J', 'SJ']
      .flatMap((c) =>
        JSON.parse(readFileSync(resolve(root, `public/v2/outputs-${c}.json`), 'utf8')),
      )
      .map((o) => [o.outputId, o]),
  ),
};
const fixture = resolve(qa, `fixture-${crypto.randomUUID()}.sqlite`),
  code = 'isolated-fixture-' + crypto.randomUUID(),
  url = 'http://127.0.0.1:8896';
const sql = new DatabaseSync(fixture);
sql.exec('CREATE TABLE protocol (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
sql.prepare('INSERT INTO protocol VALUES (1,?)').run(
  JSON.stringify(
    initialProtocol(db, {
      ...DEFAULT_CONFIG,
      totals: { calibration: 2, joint: 2, independent: 2, overlap: 1 },
    }),
  ),
);
sql.close();
const child = spawn(process.execPath, ['server/api.ts'], {
  cwd: root,
  windowsHide: true,
  stdio: 'pipe',
  env: {
    ...process.env,
    PORT: '8896',
    STUDY_TRANSPORT: 'hosted',
    STUDY_ACCESS_CODE: code,
    STUDY_DB_PATH: fixture,
  },
});
let serverLog = '';
child.stderr.on('data', (d) => (serverLog += d));
const checks = [],
  errors = [];
let browser;
const check = (name, ok = true) => {
  assert.ok(ok, name);
  checks.push(name);
  console.log('PASS ' + name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await sleep(100);
  }
  throw Error('Condition timed out');
}
async function state(ctx) {
  return (await ctx.request.get(url + '/api/state')).json();
}
async function saved(p, n, r) {
  await p.waitForFunction(
    ([n, r]) => {
      const c = JSON.parse(localStorage.getItem('code-choice.human-validation-v2') || 'null');
      return (
        c &&
        !c.dirty &&
        c.state.answers.filter((a) => a.reviewer === r && !a.invalidated).length === n
      );
    },
    [n, r],
  );
}
async function formalVote(p, n, r) {
  await sleep(420);
  await p.getByRole('button', { name: 'Equal', exact: true }).click();
  await saved(p, n, r);
}
try {
  await waitFor(async () => {
    try {
      return (await fetch(url + '/api/health')).ok;
    } catch {
      return false;
    }
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    }),
    p = await ctx.newPage();
  p.setDefaultTimeout(10000);
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url + '/#play');
  await p.locator('.code-panel').first().waitFor();
  check(
    'Community hidden before voting',
    (await p.getByRole('region', { name: 'Community preferences' }).count()) === 0,
  );
  await p.getByRole('checkbox', { name: 'Play without storing new responses' }).check();
  const pairId = await p.evaluate(() =>
      JSON.parse(sessionStorage.getItem('code-choice.play-history')).seen.at(-1),
    ),
    pair = db.pairs.find((p) => p.pairId === pairId);
  const codeA = visibleCode(await p.locator('#code-A .code-scroll').innerText()),
    a = visibleCode(db.outputs[pair.left].code) === codeA ? pair.left : pair.right,
    b = a === pair.left ? pair.right : pair.left;
  const row = {
    pairId,
    a,
    b,
    choice: 'A',
    responseId: 'fixture-a-' + crypto.randomUUID(),
    sessionId: 'fixture-session-private',
    at: new Date().toISOString(),
    playPoolVersion: db.playPoolVersion,
    protocolVersion: db.protocolVersion,
    catalogHash: db.catalogHash,
  };
  check(
    'Isolated Play write accepted',
    (await ctx.request.post(url + '/api/play', { data: row })).ok(),
  );
  check(
    'Retry accepted idempotently',
    (await ctx.request.post(url + '/api/play', { data: row })).ok(),
  );
  check(
    'Conflicting response ID rejected',
    (await ctx.request.post(url + '/api/play', { data: { ...row, choice: 'B' } })).status() === 400,
  );
  await ctx.request.post(url + '/api/play', {
    data: { ...row, responseId: 'fixture-reverse-' + crypto.randomUUID(), a: b, b: a, choice: 'B' },
  });
  await ctx.request.post(url + '/api/play', {
    data: { ...row, responseId: 'fixture-equal-' + crypto.randomUUID(), choice: 'Equal' },
  });
  check(
    'Wrong catalog rejected',
    (
      await ctx.request.post(url + '/api/play', { data: { ...row, catalogHash: 'wrong' } })
    ).status() === 400,
  );
  const statsURL = url + `/api/play/stats?pairId=${pairId}&catalogHash=${db.catalogHash}`;
  let stats = await ctx.request.get(statsURL).then((r) => r.json());
  check(
    'Reversal Equal and retry aggregate correctly',
    stats.total === 3 &&
      stats.pair.preferences[db.outputs[a].condition] === 2 &&
      stats.pair.preferences.Equal === 1,
  );
  check(
    'Public endpoint exposes aggregates only',
    !JSON.stringify(stats).match(/sessionId|responseId|fixture-session-private|reviewer|answers/),
  );
  check(
    'Raw Play endpoint remains private',
    (await ctx.request.get(url + '/api/play')).status() === 401,
  );
  check(
    'Version mismatch fails closed',
    (await ctx.request.get(statsURL.replace(db.catalogHash, 'wrong'))).status() === 400,
  );
  await p.getByRole('button', { name: 'Equal', exact: true }).click();
  await p.getByText('3 recorded votes on this pair', { exact: true }).waitFor();
  await p.getByText('Across Play · 3 recorded votes', { exact: true }).click();
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: resolve(qa, 'play-community-desktop.png'), fullPage: true });
  check(
    'Opt-out not collected',
    (await ctx.request.get(statsURL).then((r) => r.json())).total === 3,
  );
  await p.setViewportSize({ width: 390, height: 844 });
  check(
    'Mobile has no page overflow',
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: resolve(qa, 'play-community-mobile.png'), fullPage: true });
  await p.getByRole('button', { name: 'Next round →', exact: true }).click();
  await p.locator('.code-panel').first().waitFor();
  check(
    'Statistics hidden on new round',
    (await p.getByRole('region', { name: 'Community preferences' }).count()) === 0,
  );
  const beforeRefresh = await p.evaluate(
    () => JSON.parse(sessionStorage.getItem('code-choice.play-history')).seen,
  );
  await p.reload();
  await p.locator('.code-panel').first().waitFor();
  const afterRefresh = await p.evaluate(
    () => JSON.parse(sessionStorage.getItem('code-choice.play-history')).seen,
  );
  check(
    'Refresh excludes previous pairs',
    new Set(afterRefresh).size === afterRefresh.length &&
      afterRefresh.length > beforeRefresh.length,
  );
  check(
    'Opt-out survives refresh',
    await p.getByRole('checkbox', { name: 'Play without storing new responses' }).isChecked(),
  );
  await p.route('**/api/play/stats?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'isolated outage' } }),
  );
  await p.getByRole('button', { name: 'Equal', exact: true }).click();
  await p.getByText('Community votes are unavailable.', { exact: false }).waitFor();
  check(
    'Statistics outage leaves Next usable',
    await p.getByRole('button', { name: 'Next round →' }).isEnabled(),
  );
  await p.unroute('**/api/play/stats?*');
  await p.getByRole('button', { name: 'Try again', exact: true }).click();
  await p.getByText('No recorded votes on this pair yet.', { exact: true }).waitFor();
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.goto(url + '/#study');
  await p.getByLabel('Study access code').fill(code);
  await p.getByRole('button', { name: 'Open study', exact: true }).click();
  await p.getByRole('button', { name: 'Start Calibration', exact: true }).click();
  check(
    'Study has no Submit or Undo',
    (await p.getByRole('button', { name: /^(Submit|Undo)$/ }).count()) === 0,
  );
  for (let i = 0; i < 2; i++) {
    await sleep(420);
    await p.getByRole('button', { name: 'Equal', exact: true }).click();
    await p
      .getByText('Choice saved. Discuss the revealed conditions and refine your guideline.', {
        exact: true,
      })
      .waitFor();
    check(
      `Calibration ${i + 1} saves and reveals without advancing`,
      !!(await p.locator('.code-panel').count()),
    );
    await p
      .getByRole('button', { name: i === 1 ? 'Agree guideline' : 'Next', exact: true })
      .click();
  }
  await p
    .getByLabel('Review guideline', { exact: true })
    .fill('Compare clarity, names, structure and maintainability.');
  await p.getByRole('button', { name: 'Finish Calibration', exact: true }).click();
  await p.getByRole('button', { name: 'Start together', exact: true }).click();
  await sleep(420);
  await p.getByRole('button', { name: 'A', exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await saved(p, 1, 'Joint');
  check('Double activation records exactly one response', (await state(ctx)).answers.length === 1);
  const comparisonBefore = await p.locator('#code-A .code-scroll').innerText();
  await p.route('**/api/state', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 503, json: { error: 'isolated save failure' } })
      : route.continue(),
  );
  await sleep(420);
  await p.getByRole('button', { name: 'B', exact: true }).click();
  await p.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
  check(
    'Failed save retains comparison and choice',
    (await p.locator('#code-A .code-scroll').innerText()) === comparisonBefore &&
      (await state(ctx)).answers.length === 1,
  );
  await p.getByRole('button', { name: 'Exit', exact: true }).click();
  await p.reload();
  await p.getByRole('button', { name: 'Continue together', exact: true }).click();
  await p.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
  check(
    'Failed vote survives refresh',
    (await p.locator('#code-A .code-scroll').innerText()) === comparisonBefore,
  );
  await p.unroute('**/api/state');
  await p.getByRole('button', { name: 'Retry save', exact: true }).click();
  await saved(p, 2, 'Joint');
  await p.getByRole('heading', { name: 'You’re finished.', exact: true }).waitFor();
  check('Retry safely completes Joint', (await state(ctx)).answers.length === 2);
  await p.getByRole('button', { name: 'Back to study', exact: true }).click();
  const frozen = JSON.stringify((await state(ctx)).formal);
  for (const r of ['Jacky', 'Conrad']) {
    await p
      .getByRole('region', { name: `${r} review`, exact: true })
      .getByRole('button', { name: 'Review on this device', exact: true })
      .click();
    if (r === 'Jacky') {
      await sleep(420);
      await p.getByRole('button', { name: 'Equal', exact: true }).focus();
      await p.keyboard.down('Enter');
      await saved(p, 1, r);
      await sleep(500);
      await p.getByRole('button', { name: 'Equal', exact: true }).focus();
      await p.keyboard.down('Enter');
      await p.keyboard.up('Enter');
      check(
        'Held keyboard does not submit the next comparison',
        (await state(ctx)).answers.filter((a) => a.reviewer === r).length === 1,
      );
    } else {
      await p.route('**/api/state', async (route) => {
        if (route.request().method() === 'PUT') {
          await route.fetch();
          await route.abort();
        } else await route.continue();
      });
      await sleep(420);
      await p.getByRole('button', { name: 'Equal', exact: true }).click();
      await p.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
      await p.unroute('**/api/state');
      await p.getByRole('button', { name: 'Retry save', exact: true }).click();
      await saved(p, 1, r);
      check(
        'Lost server acknowledgment retries without duplicate answer',
        (await state(ctx)).answers.filter((a) => a.reviewer === r).length === 1,
      );
    }
    await p.getByRole('button', { name: 'Exit', exact: true }).click();
    await p.reload();
    await p
      .getByRole('region', { name: `${r} review`, exact: true })
      .getByRole('button', { name: 'Continue', exact: true })
      .click();
    await formalVote(p, 2, r);
    await p.getByRole('heading', { name: 'You’re finished.', exact: true }).waitFor();
    await p.getByRole('button', { name: 'Back to study', exact: true }).click();
  }
  check(
    'Independent resumes and completes with frozen assignments',
    JSON.stringify((await state(ctx)).formal) === frozen,
  );
  await p.getByRole('button', { name: 'View results', exact: true }).click();
  const completed = await state(ctx),
    exported = JSON.stringify(researchExport(completed, db)),
    analysis = JSON.stringify(analyse(completed, db));
  check('Completed Results remain available', !!completed.unblindedAt);
  await p.getByRole('button', { name: 'Play', exact: true }).click();
  await p.getByRole('checkbox', { name: 'Play without storing new responses' }).uncheck();
  await p.getByRole('button', { name: 'Equal', exact: true }).click();
  await waitFor(async () => (await ctx.request.get(statsURL).then((r) => r.json())).total === 4);
  check(
    'Opted-in vote saved once',
    (await ctx.request.get(statsURL).then((r) => r.json())).total === 4,
  );
  const unchanged = await state(ctx);
  check(
    'Play leaves completed Study state exports and agreement unchanged',
    JSON.stringify(unchanged) === JSON.stringify(completed) &&
      JSON.stringify(researchExport(unchanged, db)) === exported &&
      JSON.stringify(analyse(unchanged, db)) === analysis,
  );
  // Local offline reviewer uses the same one-click UI without a service.
  const local = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    lp = await local.newPage();
  lp.setDefaultTimeout(10000);
  lp.on('pageerror', (e) => errors.push(e.message));
  const packageState = structuredClone(completed);
  delete packageState.unblindedAt;
  packageState.answers = [];
  packageState.pending = {};
  const pkg = await exportStudy(packageState, 'Jacky', db);
  await lp.route('**/api/**', (route) => route.abort());
  await lp.goto(url + '/#study');
  await waitFor(async () => await lp.getByLabel('Open reviewer file', { exact: true }).isEnabled());
  await lp.getByLabel('Open reviewer file', { exact: true }).setInputFiles({
    name: 'isolated.study.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(pkg)),
  });
  await lp.getByRole('button', { name: 'Start', exact: true }).click();
  await lp.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'code-choice.v2-reviewer-package') throw new Error('isolated quota failure');
      return window.originalSetItem.call(this, k, v);
    };
  });
  const localBefore = await lp.locator('#code-A .code-scroll').innerText();
  await lp.getByRole('button', { name: 'A', exact: true }).click();
  await lp.getByRole('button', { name: 'Retry save', exact: true }).waitFor();
  check(
    'Local storage failure retains the comparison',
    (await lp.locator('#code-A .code-scroll').innerText()) === localBefore,
  );
  await lp.evaluate(() => {
    Storage.prototype.setItem = window.originalSetItem;
    delete window.originalSetItem;
  });
  await lp.getByRole('button', { name: 'Retry save', exact: true }).click();
  await lp
    .waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('code-choice.v2-reviewer-package') || 'null')?.state.answers
          .length === 1,
    )
    .catch(async () => {
      await lp.waitForFunction(() =>
        Object.keys(localStorage).some(
          (k) =>
            k.includes('reviewer') && JSON.parse(localStorage[k])?.state?.answers?.length === 1,
        ),
      );
    });
  check(
    'Offline reviewer one-click persistence',
    (await lp.getByRole('button', { name: 'Submit', exact: true }).count()) === 0,
  );
  await lp.reload();
  await lp.getByRole('button', { name: 'Continue', exact: true }).click();
  await sleep(420);
  await lp.getByRole('button', { name: 'Equal', exact: true }).click();
  await lp.getByRole('heading', { name: 'You’re finished.', exact: true }).waitFor();
  check(
    'Offline reviewer refresh completion and Result workflow',
    await lp.getByRole('button', { name: 'Save result for researcher', exact: true }).isEnabled(),
  );
  const extra = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      storageState: await ctx.storageState(),
    }),
    ep = await extra.newPage();
  ep.on('pageerror', (e) => errors.push(e.message));
  await ep.goto(url + '/#play');
  await ep.locator('.code-panel').first().waitFor();
  const returningHistory = await ep.evaluate(() =>
    JSON.parse(sessionStorage.getItem('code-choice.play-history')),
  );
  check(
    'Returning player gets fresh history with recent avoidance',
    returningHistory.seen.length === 1,
  );
  await ep.getByRole('checkbox', { name: 'Play without storing new responses' }).check();
  await ep.locator('#code-A .code-scroll').evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await ep.locator('#code-A').click();
  check(
    'Selecting code text does not vote',
    (await ep.getByRole('region', { name: 'Community preferences' }).count()) === 0,
  );
  await ep.evaluate(() => getSelection().removeAllRanges());
  await ep.locator('#code-A .code-scroll').focus();
  await ep.keyboard.press('ArrowDown');
  check(
    'Keyboard code scrolling does not vote',
    (await ep.getByRole('region', { name: 'Community preferences' }).count()) === 0,
  );
  const ids = curatePlay(db).map((p) => p.pairId);
  await ep.evaluate((ids) => {
    const h = JSON.parse(sessionStorage.getItem('code-choice.play-history'));
    h.seen = ids;
    h.round = ids.length;
    sessionStorage.setItem('code-choice.play-history', JSON.stringify(h));
  }, ids);
  await ep.reload();
  await ep.getByRole('heading', { name: 'Playlist complete.', exact: true }).waitFor();
  check(
    'Exhausted playlist has a replay state and no vote controls',
    (await ep.getByRole('button', { name: 'Equal', exact: true }).count()) === 0,
  );
  await ep.getByRole('button', { name: 'Play again', exact: true }).click();
  await ep.locator('.code-panel').first().waitFor();
  check(
    'Explicit replay starts a new cycle',
    (await ep.evaluate(() => JSON.parse(sessionStorage.getItem('code-choice.play-history')).seen))
      .length === 1,
  );
  check('No browser runtime errors', errors.length === 0);
  writeFileSync(resolve(qa, 'checks.json'), JSON.stringify({ checks, errors, fixture }, null, 2));
} catch (e) {
  writeFileSync(
    resolve(qa, 'failure.json'),
    JSON.stringify({ message: String(e), checks, errors, serverLog }, null, 2),
  );
  throw e;
} finally {
  await browser?.close();
  child.kill();
}
