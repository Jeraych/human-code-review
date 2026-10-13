import { assert, initialProtocol, mergeBackup, validateState, validateTransition } from './v2';
import type { Catalog, ProtocolState } from './v2';
import { assetUrl } from './navigation';
export const V2_KEY = 'code-choice.human-validation-v2';
export interface Cache {
  state: ProtocolState;
  base: ProtocolState;
  dirty: boolean;
}
export function loadCache(db: Catalog): Cache {
  const raw = localStorage.getItem(V2_KEY);
  if (!raw) {
    const s = initialProtocol(db);
    return { state: s, base: structuredClone(s), dirty: false };
  }
  const cache = JSON.parse(raw) as Cache;
  validateState(cache.state, db);
  validateState(cache.base, db);
  assert(typeof cache.dirty === 'boolean', 'Invalid cache.');
  return cache;
}
export function writeCache(cache: Cache, expected: string | null) {
  assert(
    localStorage.getItem(V2_KEY) === expected,
    'Progress changed in another tab. Export and reload before continuing.',
  );
  const text = JSON.stringify(cache);
  localStorage.setItem(V2_KEY, text);
  assert(
    localStorage.getItem(V2_KEY) === text,
    'Browser backup failed. Do not continue until progress is saved.',
  );
  return text;
}
export async function api(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(assetUrl('api/' + path), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(new Error(data.error || 'Hosted persistence failed'), {
      status: res.status,
      data,
    });
  return data;
}
// Three-way merge only independent edits. Same-field changes fail closed.
export function reconcile(
  base: ProtocolState,
  local: ProtocolState,
  remote: ProtocolState,
  db: Catalog,
) {
  validateState(base, db);
  validateState(local, db);
  validateState(remote, db);
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const field = <T>(b: T, l: T, r: T): T => {
    if (equal(l, b)) return r;
    if (equal(r, b) || equal(l, r)) return l;
    throw new Error(
      'Conflicting progress. Export this backup and use Researcher Recovery; no response was overwritten.',
    );
  };
  const answerMap = (s: ProtocolState) =>
    Object.fromEntries(s.answers.map((a) => [a.responseId, a]));
  const bm = answerMap(base),
    lm = answerMap(local),
    rm = answerMap(remote);
  const result: ProtocolState = {
    ...remote,
    calibration: field(base.calibration, local.calibration, remote.calibration),
    formal: field(base.formal, local.formal, remote.formal),
    unblindedAt: field(base.unblindedAt, local.unblindedAt, remote.unblindedAt),
    answers: [...new Set([...Object.keys(bm), ...Object.keys(lm), ...Object.keys(rm)])]
      .map((id) => field(bm[id], lm[id], rm[id]))
      .filter(Boolean),
    pending: {
      Jacky: field(base.pending.Jacky, local.pending.Jacky, remote.pending.Jacky),
      Conrad: field(base.pending.Conrad, local.pending.Conrad, remote.pending.Conrad),
    },
  };
  validateTransition(remote, result, db);
  return result;
}
export function importProgress(current: ProtocolState, raw: string, db: Catalog) {
  const value = JSON.parse(raw);
  assert(value.format === 'code-choice-v2-backup', 'Choose a V2 progress backup.');
  return mergeBackup(current, value.state, db);
}
