import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  aggregatePlay,
  curatePlay,
  visibleCode,
  comparisonKey,
  newPlayHistory,
  selectPlay,
  rememberPlay,
} from '../src/playV2';
import {
  initialProtocol,
  lockCalibration,
  generateFormal,
  submitFormal,
  validateTransition,
  validateState,
  researchExport,
  analyse,
  FORMAL_REVIEWERS,
  formalAssignments,
} from '../src/v2';
import type { DatabaseV2 } from '../src/v2';
const read = (f: string) =>
  JSON.parse(readFileSync(new URL('../public/v2/' + f, import.meta.url), 'utf8'));
const db: DatabaseV2 = {
  ...read('catalog.json'),
  outputs: Object.fromEntries(
    ['B', 'C', 'S', 'J', 'SJ']
      .flatMap((c) => read(`outputs-${c}.json`))
      .map((o) => [o.outputId, o]),
  ),
};
const pool = curatePlay(db),
  pair = pool[0];
const vote = (id: string, choice = 'A', reversed = false) => ({
  responseId: id,
  sessionId: 'fixture-isolated',
  pairId: pair.pairId,
  a: reversed ? pair.right : pair.left,
  b: reversed ? pair.left : pair.right,
  choice,
  canonicalPreference:
    choice === 'Equal'
      ? 'Equal'
      : db.outputs[(choice === 'A') !== reversed ? pair.left : pair.right].condition,
  phase: 'Play',
  playPoolVersion: db.playPoolVersion,
  protocolVersion: db.protocolVersion,
  catalogHash: db.catalogHash,
});
it('curates invisible equal and duplicate comparisons without discarding names, comments or indentation', () => {
  expect(pool).toHaveLength(883);
  expect(
    pool.every(
      (p) => visibleCode(db.outputs[p.left].code) !== visibleCode(db.outputs[p.right].code),
    ),
  ).toBe(true);
  expect(new Set(pool.map((p) => p.contrast + comparisonKey(p, db))).size).toBe(pool.length);
  expect(visibleCode('\r\nx = 1  \r\n')).toBe('x = 1');
  for (const [a, b] of [
    ['x = 1', 'y = 1'],
    ['x = 1', 'x = 1 # comment'],
    [' if x:', 'if x:'],
    ['a\n\nb', 'a\nb'],
  ])
    expect(visibleCode(a)).not.toBe(visibleCode(b));
});
it('balances contrasts and avoids recent tasks and visible implementations when possible', () => {
  let h = newPlayHistory(db),
    seen = [] as typeof pool;
  for (let i = 0; i < 80; i++) {
    const p = selectPlay(db, pool, h, 'All contrasts', 0.23)!;
    expect(seen.slice(-12).some((q) => q.taskId === p.taskId)).toBe(false);
    const code = new Set(
      seen
        .slice(-12)
        .flatMap((q) => [q.left, q.right].map((id) => visibleCode(db.outputs[id].code))),
    );
    expect([p.left, p.right].some((id) => code.has(visibleCode(db.outputs[id].code)))).toBe(false);
    seen.push(p);
    h = rememberPlay(h, p);
    expect(
      Math.max(...Object.values(h.contrasts)) - Math.min(...Object.values(h.contrasts)),
    ).toBeLessThanOrEqual(1);
  }
});
it('exhausts without a repeated pair and resumes from serialized history', () => {
  let h = newPlayHistory(db);
  for (let i = 0; i < pool.length; i++) {
    const p = selectPlay(db, pool, h, 'All contrasts', 0.41)!;
    expect(p).toBeDefined();
    h = rememberPlay(h, p);
    if (i === 40) h = JSON.parse(JSON.stringify(h));
  }
  expect(new Set(h.seen).size).toBe(pool.length);
  expect(selectPlay(db, pool, h, 'All contrasts', 0.4)).toBeUndefined();
  expect(selectPlay(db, [], h, 'All contrasts', 0)).toBeUndefined();
  const replay = newPlayHistory(db, h.recent);
  expect(selectPlay(db, pool, replay, 'All contrasts', 0)).toBeDefined();
});
it('relaxes the recent window for tiny pools, preserves hard exclusion across playlist switches', () => {
  let h = newPlayHistory(db);
  h = rememberPlay(h, pair);
  const tiny = [pair, { ...pool[1], taskId: pair.taskId }];
  expect(selectPlay(db, tiny, h, 'All contrasts', 0)?.pairId).toBe(pool[1].pairId);
  expect(selectPlay(db, [pair], h, pair.contrast, 0)).toBeUndefined();
});
it('maps reversed A/B to actual conditions, retains Equal, deduplicates response IDs', () => {
  const rows = [vote('1'), vote('2', 'B', true), vote('3', 'Equal'), vote('1')];
  const stats = aggregatePlay(rows, db, pair.pairId);
  expect(stats.total).toBe(3);
  expect(stats.pair.preferences[db.outputs[pair.left].condition]).toBe(2);
  expect(stats.pair.preferences.Equal).toBe(1);
  expect(stats.contrasts[pair.contrast].total).toBe(3);
  expect(JSON.stringify(stats)).not.toMatch(/sessionId|responseId|fixture-isolated/);
});
it('filters incompatible versions, Study records, invalid mappings and forged canonical preference', () => {
  const good = vote('ok');
  const rows = [
    { ...good, responseId: 'old', playPoolVersion: 'old' },
    { ...good, responseId: 'hash', catalogHash: 'other' },
    { ...good, responseId: 'formal', phase: 'Formal' },
    { ...good, responseId: 'mapped', b: good.a },
    { ...good, responseId: 'forged', canonicalPreference: 'SJ' },
    { ...good, responseId: 'protocol', protocolVersion: 'old' },
    good,
  ];
  expect(aggregatePlay(rows, db, pair.pairId).total).toBe(1);
  const { catalogHash: _, ...legacy } = vote('legacy');
  expect(aggregatePlay([legacy], db, pair.pairId).total).toBe(1);
});
it('has explicit zero statistics and pair-specific denominators', () => {
  expect(aggregatePlay([], db, pair.pairId).total).toBe(0);
  expect(aggregatePlay([vote('1')], db, pool[1].pairId).pair.total).toBe(0);
});
it('atomic one-click Formal transitions preserve completed exports and agreement', () => {
  const at = '2026-10-15T00:00:00Z',
    s = initialProtocol(db);
  s.calibration.answers = s.calibration.assignments.map((p, i) => ({
    ...p,
    responseId: `fixture-cal-${i}`,
    reviewer: 'Joint',
    phase: 'joint_calibration',
    choice: 'Equal',
    at,
  }));
  lockCalibration(s, at);
  generateFormal(s, db, at);
  const assignments = JSON.stringify(s.formal);
  for (const r of FORMAL_REVIEWERS)
    for (const [i] of formalAssignments(s, r).entries()) {
      const before = structuredClone(s);
      submitFormal(s, r, 'Equal', at, `fixture-${r}-${i}`);
      delete s.pending[r];
      validateTransition(before, s, db);
    }
  validateState(s, db, true);
  s.unblindedAt = at;
  const exported = JSON.stringify(researchExport(s, db)),
    analysis = JSON.stringify(analyse(s, db));
  curatePlay(db);
  aggregatePlay([vote('1')], db, pair.pairId);
  expect(JSON.stringify(s.formal)).toBe(assignments);
  expect(JSON.stringify(researchExport(s, db))).toBe(exported);
  expect(JSON.stringify(analyse(s, db))).toBe(analysis);
  expect(() => {
    const after = structuredClone(s);
    after.answers[0].choice = 'A';
    validateTransition(s, after, db);
  }).toThrow();
});
