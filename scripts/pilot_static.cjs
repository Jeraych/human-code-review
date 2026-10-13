// Local QA server only: prove the built app works under a static subdirectory.
const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const app = path.resolve(__dirname, '..'),
  dist = path.join(app, 'dist'),
  qa = path.join(app, 'qa');
fs.mkdirSync(qa, { recursive: true });
const checks = [],
  errors = [],
  failures = [],
  requests = [];
let browser, server;
function check(label, ok) {
  assert.ok(ok, label);
  checks.push(label);
}
(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith('/demo/')) {
      response.writeHead(404);
      response.end();
      return;
    }
    const file = path.resolve(dist, pathname.slice(6) || 'index.html');
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }
    const types = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
    };
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': file.endsWith('.html') ? 'no-cache' : 'public,max-age=60',
    });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/demo/`;
  browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push(r.url());
  });
  await page.goto(url);
  await page.waitForFunction(
    () => document.querySelector('.home-play') && !document.querySelector('.home-play').disabled,
  );
  check(
    'Static subdirectory home loads with correct title',
    (await page.title()) === 'Code / Choice — AI code. Human preference.',
  );
  check(
    'Home defers the highlighting WASM download',
    !requests.some((r) => /assets\/wasm-/.test(r)),
  );
  check(
    'Favicon and description are configured',
    (await page
      .locator('link[rel=icon]')
      .getAttribute('href')
      .then((s) => s.includes('favicon.svg'))) &&
      (await page.locator('meta[name=description]').count()) === 1,
  );
  await page.goto(url + '#play');
  await page.getByRole('button', { name: 'Choose implementation A', exact: true }).waitFor();
  await page.locator('.shiki').first().waitFor();
  check(
    'Direct Play route loads pools and highlighting under subdirectory',
    requests.some((r) => r.includes('/demo/pools/evaluation-02-v1.json')) &&
      requests.some((r) => /assets\/wasm-/.test(r)),
  );
  await page.getByRole('button', { name: 'Choose implementation A', exact: true }).click();
  await page.getByText('THE REVEAL', { exact: true }).waitFor();
  check(
    'Reveal asset respects static base path',
    requests.some((r) => r.includes('/demo/play/')),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Choose implementation A', exact: true }).waitFor();
  check(
    'Refresh of direct Play route succeeds',
    (await page.locator('.play-reveal').count()) === 0,
  );
  await page.goto(url + '#study');
  await page.getByLabel('Evaluator ID', { exact: true }).fill('static-pilot-only');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Start study', exact: true }).click();
  await page.getByText('Read the code. Make your choice.', { exact: true }).waitFor();
  await page.getByRole('radio', { name: /About equal/ }).check();
  await page.getByRole('button', { name: /Submit & next/ }).click();
  const saved = await page.evaluate(() => localStorage.getItem('human-code-evaluation.v1'));
  await page.goto(url + '#play');
  await page.getByText('Read the code. Make your choice.', { exact: true }).waitFor();
  check(
    'Direct Play link cannot bypass active Study protection',
    page.url().endsWith('#study') &&
      (await page.getByRole('button', { name: 'Choose implementation A', exact: true }).count()) ===
        0,
  );
  await page.reload();
  await page.getByText('Read the code. Make your choice.', { exact: true }).waitFor();
  check(
    'Study direct-route refresh preserves exact saved state',
    (await page.evaluate(() => localStorage.getItem('human-code-evaluation.v1'))) === saved,
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true })),
  );
  await page.getByRole('alert').waitFor();
  check(
    'Outdated deployment prompts manual recovery instead of reloading',
    (await page
      .getByRole('alert')
      .innerText()
      .then((t) => t.includes('A newer app version'))) &&
      (await page.evaluate(() => localStorage.getItem('human-code-evaluation.v1'))) === saved,
  );
  check('All requested production assets succeeded', failures.length === 0);
  check('No production browser errors', errors.length === 0);
  fs.writeFileSync(
    path.join(qa, 'static-pilot-report.json'),
    JSON.stringify({ checks, errors, failures, privateLocalTest: true }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, errors, failures }, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  });
