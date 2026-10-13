const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const qa = path.resolve(__dirname, '../qa');
fs.mkdirSync(qa, { recursive: true });
const checks = [],
  errors = [];
let browser;
const check = (label, ok) => {
  assert.ok(ok, label);
  checks.push(label);
};
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?v1=1#play');
  await page.getByRole('button', { name: 'Choose implementation A', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Judge', exact: true }).tap();
  let index = -1;
  for (let i = 0; i < 50; i++) {
    index = await page
      .locator('.code-scroll')
      .evaluateAll((nodes) => nodes.findIndex((n) => n.scrollHeight > n.clientHeight + 30));
    if (index >= 0) break;
    await page.getByRole('button', { name: 'Judge', exact: true }).tap();
  }
  check('Real long code is available for touch scrolling', index >= 0);
  const viewer = page.locator('.code-scroll').nth(index);
  await viewer.scrollIntoViewIfNeeded();
  const box = await viewer.boundingBox(),
    cdp = await context.newCDPSession(page),
    x = box.x + 80,
    y = box.y + Math.min(box.height - 30, 250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - i * 22 }],
    });
    await page.waitForTimeout(35);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  check(
    'Touch swiping scrolls code without casting a vote',
    (await viewer.evaluate((n) => n.scrollTop)) > 0 &&
      (await page.locator('.play-reveal').count()) === 0 &&
      Number(await page.locator('.play-stat strong').innerText()) === 0,
  );
  await page.getByRole('button', { name: 'Choose implementation B', exact: true }).tap();
  await page.getByText('THE REVEAL', { exact: true }).waitFor();
  await page.waitForTimeout(200);
  check(
    'Deliberate touch tap votes once and clearly marks B',
    Number(await page.locator('.play-stat strong').innerText()) === 1 &&
      (await page
        .getByRole('button', { name: 'Choose implementation B', exact: true })
        .getAttribute('aria-pressed')) === 'true',
  );
  check(
    'Reduced motion disables reveal animation',
    (await page.locator('.play-reveal').evaluate((n) => getComputedStyle(n).animationName)) ===
      'none',
  );
  await page.screenshot({ path: path.join(qa, 'release-touch-reveal.png') });
  await page.getByRole('button', { name: /Next comparison/ }).tap();
  check(
    'Touch Next opens an unvoted comparison',
    (await page.locator('.play-reveal').count()) === 0,
  );
  await page.getByRole('button', { name: 'Read A', exact: true }).tap();
  check(
    'Phone reading shortcut never casts a vote',
    Number(await page.locator('.play-stat strong').innerText()) === 1,
  );
  check(
    'Touch viewport has no horizontal overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  check('No touch browser runtime errors', errors.length === 0);
  fs.writeFileSync(
    path.join(qa, 'touch-pilot-report.json'),
    JSON.stringify({ checks, errors, emulatedTouch: true, actualDeviceTested: false }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, errors }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
  });
