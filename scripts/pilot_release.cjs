const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const app = path.resolve(__dirname, '..'),
  qa = path.join(app, 'qa');
fs.mkdirSync(qa, { recursive: true });
const checks = [],
  errors = [];
let browser;
function check(label, ok) {
  assert.ok(ok, label);
  checks.push(label);
}
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto((process.argv[4] || 'http://127.0.0.1:5173') + '/?v1=1');
  await page.locator('.home-play').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.home-play').disabled);
  check(
    'New player sees clear home and primary Play action',
    await page
      .locator('.home h1')
      .innerText()
      .then((t) => t.includes('Your call')),
  );
  check(
    'Home does not expose experimental code or identities',
    (await page.locator('.code-scroll').count()) === 0 &&
      !/Style-trained|Judge-trained|Base/.test(await page.locator('.home').innerText()),
  );
  await page.screenshot({ path: path.join(qa, 'release-home-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(qa, 'release-home-mobile.png'), fullPage: true });
  check(
    'Phone home has no horizontal overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.locator('.home-play').click();
  await page.getByRole('button', { name: 'Choose implementation A', exact: true }).waitFor();
  check(
    'Home starts Random Play without setup',
    (await page.locator('.pool-switch button.active').innerText()) === 'Random',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Choose implementation A', exact: true }).click();
  await page.getByText('THE REVEAL', { exact: true }).waitFor();
  check(
    'Native button votes and reveal receives reading focus',
    await page.evaluate(() => document.activeElement?.id === 'reveal-title'),
  );
  const revealBox = await page.locator('.play-reveal').boundingBox();
  check(
    'Reveal and Next are visible in the desktop viewport',
    revealBox.y >= 0 && revealBox.y + revealBox.height <= 1000,
  );
  await page.screenshot({ path: path.join(qa, 'release-play-desktop.png'), fullPage: true });
  await page.keyboard.press('n');
  await page.waitForFunction(() => !document.querySelector('.play-reveal'));
  check(
    'Discoverable N shortcut starts the next unvoted comparison',
    (await page
      .getByRole('button', { name: 'Choose implementation A', exact: true })
      .getAttribute('aria-pressed')) === 'false',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Read B', exact: true }).click();
  await page.waitForTimeout(400);
  check(
    'Mobile reader can jump to B without voting',
    (await page.locator('.play-reveal').count()) === 0 &&
      (await page
        .locator('#code-B')
        .boundingBox()
        .then((box) => box.y < 200)),
  );
  await page.getByRole('button', { name: 'Choose implementation B', exact: true }).click();
  await page.getByText('THE REVEAL', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(qa, 'release-play-mobile.png'), fullPage: true });
  check(
    'Phone reveal remains readable without horizontal overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await page.locator('a.brand').click();
  await page.getByRole('button', { name: /Enter Study/ }).click();
  await page.getByLabel('Evaluator ID', { exact: true }).fill('release-pilot-only');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Start study', exact: true }).click();
  await page.getByText('Read the code. Make your choice.', { exact: true }).waitFor();
  const original = await page.evaluate(() => localStorage.getItem('human-code-evaluation.v1'));
  await page.getByRole('link', { name: /Human Code Evaluation/ }).click();
  check(
    'Home protects unfinished Study and offers resume',
    (await page.getByRole('button', { name: /Resume study/ }).count()) === 1 &&
      (await page.locator('.home-play').count()) === 0 &&
      (await page.getByRole('button', { name: 'Play', exact: true }).isDisabled()),
  );
  await page.getByRole('button', { name: /Resume study/ }).click();
  check(
    'Resume navigation preserves complete saved state',
    (await page.evaluate(() => localStorage.getItem('human-code-evaluation.v1'))) === original,
  );
  await page.reload();
  await page.getByText('Read the code. Make your choice.', { exact: true }).waitFor();
  check(
    'Returning unfinished Study resumes automatically',
    (await page.getByRole('radio', { name: /Prefer A/ }).count()) === 1,
  );
  await page.getByRole('button', { name: 'Researcher setup', exact: true }).click();
  fs.writeFileSync(path.join(qa, 'malformed-backup.json'), '{broken');
  await page.locator('input[type=file]').setInputFiles(path.join(qa, 'malformed-backup.json'));
  await page.getByRole('alert').waitFor();
  check(
    'Malformed backup shows readable guidance and preserves Study',
    (await page
      .getByRole('alert')
      .innerText()
      .then((t) => t.includes('This backup could not be restored'))) &&
      (await page.evaluate(() => localStorage.getItem('human-code-evaluation.v1'))) === original,
  );
  check(
    'Technical error details stay collapsed by default',
    (await page.locator('.recovery-notice details').getAttribute('open')) === null,
  );
  check('No browser runtime errors', errors.length === 0);
  fs.writeFileSync(
    path.join(qa, 'release-pilot-report.json'),
    JSON.stringify({ checks, errors, syntheticParticipantOnly: true }, null, 2),
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
