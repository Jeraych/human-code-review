// Legacy regressions run against an isolated static preview, never the normal app service.
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..'),
  base = 'http://127.0.0.1:18802';
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '18802',
    '--strictPort',
  ],
  { cwd: root, windowsHide: true, stdio: 'ignore' },
);
(async () => {
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!ready) throw Error('QA preview unavailable');
    const results = [];
    for (const script of [
      'pilot.cjs',
      'pilot_judge_play.cjs',
      'pilot_release.cjs',
      'pilot_touch.cjs',
      'pilot_static.cjs',
    ].slice(Number(process.argv[4] || 0))) {
      const result = spawnSync(
        process.execPath,
        ['scripts/' + script, process.argv[2], process.argv[3], base],
        { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 120000 },
      );
      console.log(script + '\n' + result.stdout);
      if (result.status !== 0) throw Error(result.stderr || script + ' failed');
      results.push({ script, passed: true });
    }
    fs.writeFileSync(
      path.join(root, 'qa', 'legacy-suite-verification.json'),
      JSON.stringify({ results, fixtureOnly: true }, null, 2),
    );
  } finally {
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
