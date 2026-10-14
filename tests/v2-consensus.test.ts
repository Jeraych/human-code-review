import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_CONFIG,
  LEGACY_CONFIG,
  CONTRASTS,
  FORMAL_REVIEWERS,
  workload,
  initialProtocol,
  lockCalibration,
  generateFormal,
  validateConfiguration,
  validateState,
  validateTransition,
  submitFormal,
  undoFormal,
  configureProtocol,
  replaceProtocol,
  analyse,
  researchExport,
  responsePhase,
  formalAssignments,
} from '../src/v2';
import { exportStudy, importStudy, exportResult, importResult } from '../src/v2Transfer';
import type { DatabaseV2, ProtocolState } from '../src/v2';
const read = (name: string) =>
  JSON.parse(readFileSync(new URL('../public/v2/' + name, import.meta.url), 'utf8'));
const db: DatabaseV2 = {
  ...read('catalog.json'),
  outputs: Object.fromEntries(
    ['B', 'C', 'S', 'J', 'SJ']
      .flatMap((c) => read(`outputs-${c}.json`))
      .map((o) => [o.outputId, o]),
  ),
};
const at = '2026-10-14T02:00:00Z';
function generated(config = DEFAULT_CONFIG) {
  const s = initialProtocol(db, config);
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
  return s;
}
function complete(s: ProtocolState) {
  for (const r of FORMAL_REVIEWERS)
    for (const _ of formalAssignments(s, r)) {
      submitFormal(s, r, 'Equal', at, crypto.randomUUID());
      delete s.pending[r];
    }
  validateState(s, db, true);
  s.unblindedAt = at;
}
it('new defaults derive 10 Calibration, 50 consensus, 50/50 Independent, 10 overlap, 150 ratings and 140 distinct', () => {
  const w = workload(DEFAULT_CONFIG);
  expect([w.calibration, w.joint, w.Jacky, w.Conrad, w.overlap, w.ratings, w.distinct]).toEqual([
    10, 50, 50, 50, 10, 150, 140,
  ]);
  const s = generated();
  validateState(s, db);
  expect(s.formal!.joint).toHaveLength(w.joint);
  expect(
    new Set(
      [...s.formal!.joint!, ...Object.values(s.formal!.assignments).flat()].map((p) => p.pairId),
    ).size,
  ).toBe(w.distinct);
  expect(generated().formal).toEqual(s.formal);
  for (const row of w.perContrast) expect(row.distinct).toBe(35);
});
it('total allocation is exact, balanced and deterministic for subsets, small counts and remainders', () => {
  for (let n = 1; n <= 4; n++)
    for (let independent = 0; independent <= 20; independent++)
      for (let overlap = 0; overlap <= independent; overlap++) {
        const cfg = {
          ...DEFAULT_CONFIG,
          contrasts: CONTRASTS.slice(0, n),
          totals: {
            calibration: independent % 13,
            joint: (independent + overlap) % 21,
            independent,
            overlap,
          },
        };
        const w = workload(cfg);
        expect(w.perContrast.reduce((s, a) => s + a.Jacky, 0)).toBe(independent);
        expect(w.perContrast.reduce((s, a) => s + a.Conrad, 0)).toBe(independent);
        for (const key of ['calibration', 'joint', 'Jacky', 'Conrad', 'overlap'] as const) {
          const values = w.perContrast.map((a) => a[key]);
          expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
        }
        for (const a of w.perContrast) {
          expect(a.overlap).toBeLessThanOrEqual(Math.min(a.Jacky, a.Conrad));
          expect(a.distinct).toBe(a.joint + a.Jacky + a.Conrad - a.overlap);
        }
      }
});
it('Calibration/consensus/Independent sets are disjoint and every Formal mapping is eligible and balanced', () => {
  const s = generated(),
    cal = new Set(s.calibration.assignments.map((p) => p.pairId)),
    joint = new Set(s.formal!.joint!.map((p) => p.pairId));
  for (const r of FORMAL_REVIEWERS)
    for (const c of CONTRASTS) {
      const rows = formalAssignments(s, r).filter(
        (p) => db.pairs.find((x) => x.pairId === p.pairId)!.contrast === c,
      );
      const left = rows.filter(
        (p) => p.a === db.pairs.find((x) => x.pairId === p.pairId)!.left,
      ).length;
      expect(Math.abs(left - (rows.length - left))).toBeLessThanOrEqual(1);
      for (const p of rows) {
        expect(cal.has(p.pairId)).toBe(false);
        if (r !== 'Joint') expect(joint.has(p.pairId)).toBe(false);
        expect(db.pairs.find((x) => x.pairId === p.pairId)!.eligible).toBe(true);
      }
    }
  const bad = structuredClone(s);
  bad.formal!.assignments.Jacky[0] = bad.formal!.joint![0];
  expect(() => validateState(bad, db)).toThrow();
});
it('rejects infeasible totals exactly, including negative/fractional counts, overlap and small contrast pool', () => {
  for (const edit of [
    { overlap: 51 },
    { calibration: -1 },
    { joint: 1.5 },
    { independent: 1000 },
    { joint: 10000 },
  ])
    expect(() =>
      validateConfiguration(
        { ...DEFAULT_CONFIG, totals: { ...DEFAULT_CONFIG.totals!, ...edit } },
        db,
      ),
    ).toThrow();
  expect(() =>
    validateConfiguration(
      {
        ...DEFAULT_CONFIG,
        contrasts: ['S-SJ'],
        totals: { calibration: 10, joint: 50, independent: 100, overlap: 10 },
      },
      db,
    ),
  ).toThrow(/S-SJ.*250.*226 eligible unused/);
});
it('zero Joint, zero Independent and all-overlap totals remain exact', () => {
  for (const totals of [
    { calibration: 0, joint: 5, independent: 0, overlap: 0 },
    { calibration: 2, joint: 0, independent: 7, overlap: 0 },
    { calibration: 1, joint: 3, independent: 4, overlap: 4 },
  ]) {
    const s = generated({ ...DEFAULT_CONFIG, totals });
    complete(s);
    expect(researchExport(s, db).formal).toHaveLength(totals.joint + 2 * totals.independent);
  }
});
it('Joint Submit/Undo/recovery freezes config and retains original response, with no replay after Next', () => {
  const s = generated(),
    before = structuredClone(s);
  submitFormal(s, 'Joint', 'A', at, 'fixture-joint');
  expect(s.answers[0].phase).toBe('joint_consensus_formal');
  undoFormal(s, 'Joint', at);
  expect(s.answers[0].invalidated?.kind).toBe('undo');
  expect(() =>
    configureProtocol(s, db, { ...DEFAULT_CONFIG, seed: 42 }, s.calibration.guideline, at),
  ).toThrow();
  submitFormal(s, 'Joint', 'Equal', at, 'fixture-again');
  delete s.pending.Joint;
  validateTransition(before, s, db);
  expect(formalAssignments(s, 'Joint')[0].pairId).not.toBe(
    formalAssignments(s, 'Joint').find(
      (p) => !s.answers.some((a) => a.pairId === p.pairId && !a.invalidated),
    )!.pairId,
  );
  replaceProtocol(s, db, 'Fixture deliberate reset', at);
  expect(s.archives!.at(-1)!.state.answers).toHaveLength(2);
  const oldJoint = new Set(s.archives!.at(-1)!.state.formal!.joint!.map((p) => p.pairId));
  s.calibration.answers = s.calibration.assignments.map((p, i) => ({
    ...p,
    responseId: `fixture-recal-${i}`,
    reviewer: 'Joint',
    phase: 'joint_calibration',
    choice: 'Equal',
    at,
  }));
  lockCalibration(s, at);
  generateFormal(s, db, at);
  expect(
    Object.values(s.formal!.assignments)
      .flat()
      .some((p) => oldJoint.has(p.pairId)),
  ).toBe(false);
});
it('analysis splits phases/reviewers and kappa is unchanged when consensus choices change', () => {
  const s = generated();
  complete(s);
  const original = analyse(s, db);
  const changed = structuredClone(s);
  changed.answers.filter((a) => a.reviewer === 'Joint').forEach((a) => (a.choice = 'A'));
  const other = analyse(changed, db);
  expect(other.results.map((r) => [r.rawAgreement, r.kappa, r.overlapPairs])).toEqual(
    original.results.map((r) => [r.rawAgreement, r.kappa, r.overlapPairs]),
  );
  expect(other.jointConsensus).not.toEqual(original.jointConsensus);
  expect(original.jointConsensus.reduce((n, r) => n + r.ratings, 0)).toBe(50);
  expect(original.independent.Jacky.reduce((n, r) => n + r.ratings, 0)).toBe(50);
  const out = researchExport(s, db);
  expect(out.jointConsensusFormal).toHaveLength(50);
  expect(out.independentFormal.Conrad).toHaveLength(50);
  expect(out.combinedFormal).toHaveLength(150);
  expect(out.calibration.every((a) => a.phase === 'joint_calibration')).toBe(true);
  expect(new Set(out.formal.map((a) => a.phase))).toEqual(
    new Set(['joint_consensus_formal', 'independent_formal']),
  );
});
it('Joint and independent packages/results use the same protocol identity and merge safely', async () => {
  let s = generated({
    ...DEFAULT_CONFIG,
    totals: { calibration: 1, joint: 3, independent: 2, overlap: 1 },
  });
  const ids = [];
  for (const r of FORMAL_REVIEWERS) {
    const pack = await exportStudy(s, r, db);
    ids.push(pack.studyId);
    const session = await importStudy(JSON.stringify(pack), db);
    for (const _ of formalAssignments(session.state, r)) {
      submitFormal(session.state, r, 'Equal', at, crypto.randomUUID());
      delete session.state.pending[r];
    }
    s = await importResult(s, JSON.stringify(await exportResult(session)), `${r}.json`, r, db);
  }
  expect(new Set(ids).size).toBe(1);
  validateState(s, db, true);
  expect(s.resultImports).toHaveLength(3);
  expect(s.answers.every((a) => responsePhase(a) !== 'joint_calibration')).toBe(true);
});
it('absent totals/Joint fields preserve legacy protocol and normalize phase labels only in exported rows', () => {
  const s = generated(LEGACY_CONFIG);
  complete(s);
  expect(s.formal!.joint).toBeUndefined();
  expect(s.formal!.assignments.Jacky).toHaveLength(workload(LEGACY_CONFIG).Jacky);
  const raw = JSON.stringify(s);
  validateState(s, db, true);
  expect(JSON.stringify(s)).toBe(raw);
});
