import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, sep, extname, dirname } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  initialProtocol,
  validateCatalog,
  validateState,
  validateTransition,
  canonical,
  assert,
} from '../src/v2.ts';
import type { DatabaseV2, ProtocolState, Presentation, Preference } from '../src/v2.ts';
import { aggregatePlay } from '../src/playV2.ts';

const root = resolve(import.meta.dirname, '..');
const catalog: DatabaseV2 = JSON.parse(
  readFileSync(resolve(root, 'public/v2/catalog.json'), 'utf8'),
);
catalog.outputs = Object.fromEntries(
  ['B', 'C', 'S', 'J', 'SJ']
    .flatMap((c) => JSON.parse(readFileSync(resolve(root, `public/v2/outputs-${c}.json`), 'utf8')))
    .map((o) => [o.outputId, o]),
);
validateCatalog(catalog);
const password = process.env.STUDY_ACCESS_CODE;
assert(
  !process.env.STUDY_TRANSPORT || ['local', 'hosted'].includes(process.env.STUDY_TRANSPORT),
  'STUDY_TRANSPORT must be local or hosted.',
);
assert(
  password && password.length >= 8,
  'Set STUDY_ACCESS_CODE (at least 8 characters) in the server environment.',
);
const hash = (v: string) => createHash('sha256').update(v).digest();
const dbPath = resolve(process.env.STUDY_DB_PATH || resolve(root, '.runtime/study-v2.sqlite'));
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(
  'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS protocol (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS play (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history (revision INTEGER PRIMARY KEY, at TEXT NOT NULL, data TEXT NOT NULL);',
);
db.prepare('INSERT OR IGNORE INTO protocol VALUES (1, ?)').run(
  JSON.stringify(initialProtocol(catalog)),
);
function state(): ProtocolState {
  return JSON.parse(
    (db.prepare('SELECT data FROM protocol WHERE id=1').get() as { data: string }).data,
  );
}
validateState(state(), catalog);
const sessions = new Map<string, number>();
const attempts = new Map<string, { count: number; until: number }>();
const base = '/' + (process.env.APP_BASE_PATH || '').replace(/^\/+|\/+$/g, '');
const prefix = base === '/' ? '' : base;
const dist = resolve(root, 'dist');
const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    const route = pathname.slice(prefix.length);
    if (!pathname.startsWith(prefix + '/')) return send(404, { error: 'Unknown route' });
    if (!route.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return send(405, { error: 'Method not allowed' });
      const path = resolve(dist, '.' + decodeURIComponent(route === '/' ? '/index.html' : route));
      if (!path.startsWith(dist + sep) || !existsSync(path))
        return send(404, { error: 'File not found' });
      res.writeHead(200, {
        'Content-Type': mime[extname(path)] || 'application/octet-stream',
        'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      return res.end(req.method === 'HEAD' ? undefined : readFileSync(path));
    }
    // Same-origin API: deploy frontend + service together or proxy this /api path.
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}` &&
      req.headers.origin !== `https://${req.headers.host}` &&
      req.headers.origin !== process.env.APP_ORIGIN
    )
      return send(403, { error: 'Origin not allowed' });
    if (route === '/api/health' && req.method === 'GET')
      return send(200, {
        protocolVersion: catalog.protocolVersion,
        catalogHash: catalog.catalogHash,
        // A loopback service persists the researcher's local Study. Remote origins use shared transport.
        transport:
          process.env.STUDY_TRANSPORT ||
          (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(req.headers.host || '')
            ? 'local'
            : 'hosted'),
        appWorkflow: 'joint-consensus-v2',
      });
    if (route === '/api/play/stats' && req.method === 'GET') {
      const query = new URL(req.url || '/', 'http://localhost').searchParams;
      assert(query.get('catalogHash') === catalog.catalogHash, 'Incompatible Play catalog.');
      const pairId = query.get('pairId') || '';
      assert(
        catalog.pairs.some((p) => p.pairId === pairId),
        'Unknown Play pair.',
      );
      return send(
        200,
        aggregatePlay(
          db
            .prepare('SELECT data FROM play')
            .all()
            .map((r) => JSON.parse(r.data as string)),
          catalog,
          pairId,
        ),
      );
    }
    let body: any = {};
    if (req.method !== 'GET') {
      let bytes = 0,
        chunks: Buffer[] = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        assert(bytes <= 2_000_000, 'Request too large');
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    }
    if (route === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown',
        now = Date.now();
      const rate = attempts.get(ip);
      if (rate && rate.until > now && rate.count >= 20)
        return send(429, { error: 'Too many attempts. Try again in 15 minutes.' });
      if (typeof body.code !== 'string' || !timingSafeEqual(hash(body.code), hash(password!))) {
        attempts.set(ip, {
          count: (rate && rate.until > now ? rate.count : 0) + 1,
          until: now + 900_000,
        });
        return send(401, { error: 'Access code was not accepted.' });
      }
      attempts.delete(ip);
      for (const [key, expiry] of sessions) if (expiry < now) sessions.delete(key);
      const token = randomBytes(32).toString('hex');
      sessions.set(token, now + 12 * 3600_000);
      res.setHeader(
        'Set-Cookie',
        `study_v2=${token}; HttpOnly; SameSite=Strict; Path=${prefix || '/'}; Max-Age=43200${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`,
      );
      return send(200, { ok: true });
    }
    if (route === '/api/play' && req.method === 'POST') {
      const p = catalog.pairs.find((p) => p.pairId === body.pairId);
      assert(
        p &&
          p.eligible &&
          body.playPoolVersion === catalog.playPoolVersion &&
          body.protocolVersion === catalog.protocolVersion &&
          (body.catalogHash === undefined || body.catalogHash === catalog.catalogHash),
        'Invalid Play pair/version.',
      );
      assert(
        body.a !== body.b && [body.a, body.b].every((id) => id === p.left || id === p.right),
        'Invalid Play mapping.',
      );
      assert(
        ['A', 'Equal', 'B'].includes(body.choice) &&
          typeof body.sessionId === 'string' &&
          body.sessionId.length > 0 &&
          body.sessionId.length <= 80 &&
          typeof body.responseId === 'string' &&
          body.responseId.length > 0 &&
          body.responseId.length <= 80 &&
          !isNaN(Date.parse(body.at)),
        'Invalid Play response.',
      );
      const data = {
        responseId: body.responseId,
        sessionId: body.sessionId,
        pairId: p.pairId,
        a: body.a,
        b: body.b,
        choice: body.choice,
        canonicalPreference: canonical(body as Presentation & { choice: Preference }, catalog),
        at: body.at,
        playPoolVersion: catalog.playPoolVersion,
        protocolVersion: catalog.protocolVersion,
        appVersion: body.catalogHash === undefined ? '2.0.0' : '2.1.0',
        phase: 'Play',
        exploratory: true,
        ...(body.catalogHash === undefined ? {} : { catalogHash: catalog.catalogHash }),
      };
      const previous = db.prepare('SELECT data FROM play WHERE id=?').get(data.responseId) as
        { data: string } | undefined;
      if (previous) assert(previous.data === JSON.stringify(data), 'Play response ID conflict.');
      else db.prepare('INSERT INTO play VALUES (?, ?)').run(data.responseId, JSON.stringify(data));
      return send(200, { ok: true });
    }
    const token = req.headers.cookie
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('study_v2='))
      ?.slice(9);
    if (!token || (sessions.get(token) || 0) < Date.now())
      return send(401, { error: 'Enter the Study access code.' });
    if (route === '/api/state' && req.method === 'GET') return send(200, state());
    if (route === '/api/state' && req.method === 'PUT') {
      db.exec('BEGIN IMMEDIATE');
      try {
        const before = state(),
          after = body.state as ProtocolState;
        if (body.expectedRevision !== before.revision) {
          db.exec('ROLLBACK');
          return send(409, {
            error: 'Shared progress changed. Reload/merge without overwriting.',
            state: before,
          });
        }
        validateTransition(before, after, catalog);
        after.revision = before.revision + 1;
        db.prepare('INSERT INTO history VALUES (?, ?, ?)').run(
          after.revision,
          new Date().toISOString(),
          JSON.stringify(before),
        );
        db.prepare('UPDATE protocol SET data=? WHERE id=1').run(JSON.stringify(after));
        db.exec('COMMIT');
        return send(200, after);
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
    if (route === '/api/play' && req.method === 'GET')
      return send(
        200,
        db
          .prepare('SELECT data FROM play')
          .all()
          .map((r) => JSON.parse(r.data as string)),
      );
    return send(404, { error: 'Unknown API route' });
  } catch (e) {
    send(400, { error: e instanceof Error ? e.message : 'Request failed' });
  }
});
server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () =>
  console.log(
    `Code / Choice service listening on ${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 8787}${prefix}/`,
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
