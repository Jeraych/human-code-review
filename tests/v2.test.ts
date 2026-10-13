import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  activeAnswers,
  analyse,
  canonical,
  CONTRASTS,
  generateFormal,
  initialProtocol,
  invalidate,
  lockCalibration,
  mergeBackup,
  nextUnanswered,
  REVIEWERS,
  researchExport,
  submitFormal,
  undoFormal,
  validateCatalog,
  validateState,
  validateTransition,
} from '../src/v2';
import type { DatabaseV2, ProtocolState } from '../src/v2';
import { reconcile, importProgress } from '../src/v2Storage';
const at = '2026-10-14T01:00:00.000Z';
const read = (p: string) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const db: DatabaseV2 = {
  ...read('public/v2/catalog.json'),
  outputs: Object.fromEntries(
    ['B', 'C', 'S', 'J', 'SJ']
      .flatMap((c) => read(`public/v2/outputs-${c}.json`))
      .map((o) => [o.outputId, o]),
  ),
};
// Synthetic response fixtures exist only in this test process, never in app/research storage.
function calibration(s: ProtocolState) {
  s.calibration.answers = s.calibration.assignments.map((p, i) => ({
    ...p,
    responseId: `fixture-cal-${i}`,
    reviewer: 'Joint',
    phase: 'Calibration',
    choice: 'Equal',
    at,
  }));
  lockCalibration(s, at);
}
function formal() {
  const s = initialProtocol(db);
  calibration(s);
  generateFormal(s, db, at);
  return s;
}
function completed() {
  const s = formal();
  for (const r of REVIEWERS)
    for (let i = 0; i < 48; i++) {
      submitFormal(s, r, i % 3 === 0 ? 'Equal' : 'A', at, `fixture-${r}-${i}`);
      delete s.pending[r];
    }
  return s;
}
describe('V2 frozen real artifacts', () => {
  it('validates identities, holdout, both-correct eligibility, duplicates and canonical hash', () => {
    validateCatalog(db);
    const { outputs, catalogHash, ...content } = db;
    expect(createHash('sha256').update(JSON.stringify(content)).digest('hex')).toBe(catalogHash);
    expect(db.pairs).toHaveLength(2400);
    expect(Object.keys(outputs)).toHaveLength(3000);
    for (const o of Object.values(outputs))
      expect(createHash('sha256').update(o.code).digest('hex')).toBe(o.codeHash);
    expect(
      CONTRASTS.map((c) => db.pairs.filter((p) => p.contrast === c && p.eligible).length),
    ).toEqual([354, 380, 332, 226]);
    expect(
      CONTRASTS.map(
        (c) => db.pairs.filter((p) => p.contrast === c && p.bothCorrect && p.exactCodeMatch).length,
      ),
    ).toEqual([177, 133, 199, 286]);
    expect(
      CONTRASTS.map((c) => db.pairs.filter((p) => p.contrast === c && p.exactCodeMatch).length),
    ).toEqual([182, 139, 201, 304]);
  });
  it('rejects training tasks, changed conditions and incorrect source flags', () => {
    for (const edit of [
      (copy: DatabaseV2) => {
        copy.pairs[0].taskId = 'HumanEval/1';
      },
      (copy: DatabaseV2) => {
        copy.outputs[copy.pairs[0].left].condition = 'SJ';
      },
      (copy: DatabaseV2) => {
        copy.pairs[0].eligible = !copy.pairs[0].eligible;
      },
    ]) {
      const copy = structuredClone(db);
      edit(copy);
      expect(() => validateCatalog(copy)).toThrow();
    }
  });
  it('preserves historical V1 content hashes', () => {
    for (const [pool, hash] of [
      ['evaluation-01', '3bd17a5a0a0810b3e7c9ef3ad48ffe8775ceb5ebfea4b534e6e4afe4451c1d70'],
      ['evaluation-02', 'b6918be4a841b8bb06c158314508a3bdbcb752b0ec80a9a5e967dec0205c0935'],
    ])
      expect(
        createHash('sha256')
          .update(JSON.stringify(read(`public/pools/${pool}-v1.json`)))
          .digest('hex'),
      ).toBe(hash);
  });
});
describe('V2 actual assignment invariants', () => {
  it('freezes 80 distinct pairs, 16 overlaps, 48 per reviewer and excludes all calibration pairs', () => {
    const s = formal();
    validateState(s, db);
    const f = s.formal!;
    expect(Object.values(f.assignments).flat()).toHaveLength(96);
    expect(
      new Set(
        Object.values(f.assignments)
          .flat()
          .map((p) => p.pairId),
      ).size,
    ).toBe(80);
    expect(f.overlap).toHaveLength(16);
    for (const c of CONTRASTS) {
      const distinct = [
        ...new Set(
          Object.values(f.assignments)
            .flat()
            .map((p) => p.pairId),
        ),
      ]
        .map((id) => db.pairs.find((p) => p.pairId === id)!)
        .filter((p) => p.contrast === c);
      expect(distinct).toHaveLength(20);
      expect(new Set(distinct.map((p) => p.taskId)).size).toBe(20);
      expect(
        [3407, 3408, 3409].map((seed) => distinct.filter((p) => p.seed === seed).length).sort(),
      ).toEqual([6, 7, 7]);
      expect(
        f.overlap.filter((id) => db.pairs.find((p) => p.pairId === id)!.contrast === c),
      ).toHaveLength(4);
    }
    expect(JSON.stringify(f)).toBe(JSON.stringify(formal().formal));
    expect(() => generateFormal(s, db, at)).toThrow();
  });
  it('does not let reviewer selection or Play consume assignments', () => {
    const s = formal(),
      before = JSON.stringify(s);
    nextUnanswered(s, 'Jacky');
    nextUnanswered(s, 'Conrad');
    expect(JSON.stringify(s)).toBe(before);
    const shared = s.formal!.overlap[0],
      a = s.formal!.assignments.Jacky.find((p) => p.pairId === shared)!;
    s.answers.push({
      ...a,
      responseId: 'fixture-overlap',
      reviewer: 'Jacky',
      phase: 'Formal',
      choice: 'Equal',
      at,
    });
    expect(activeAnswers(s, 'Conrad')).toHaveLength(0);
    expect(s.formal!.assignments.Conrad.some((p) => p.pairId === shared)).toBe(true);
  });
  it('preserves order, A/B and next unanswered across refresh/backup', () => {
    const s = formal();
    submitFormal(s, 'Jacky', 'Equal', at, 'fixture-answer');
    delete s.pending.Jacky;
    const restored = JSON.parse(JSON.stringify(s));
    validateState(restored, db);
    expect(nextUnanswered(restored, 'Jacky')).toEqual(nextUnanswered(s, 'Jacky'));
    expect(
      importProgress(formal(), JSON.stringify({ format: 'code-choice-v2-backup', state: s }), db),
    ).toEqual(s);
    expect(() =>
      importProgress(formal(), JSON.stringify({ format: 'wrong', state: s }), db),
    ).toThrow();
  });
});
describe('V2 auditable response and locking semantics', () => {
  it('requires a valid choice; Undo only immediately prior; preserves original response', () => {
    const s = formal();
    expect(() => submitFormal(s, 'Jacky', 'both_poor' as any, at, 'bad')).toThrow();
    submitFormal(s, 'Jacky', 'Equal', at, 'fixture-equal');
    expect(s.answers[0].choice).toBe('Equal');
    undoFormal(s, 'Jacky', at);
    expect(s.answers[0].invalidated?.kind).toBe('undo');
    expect(activeAnswers(s, 'Jacky')).toHaveLength(0);
    submitFormal(s, 'Jacky', 'B', at, 'fixture-b');
    delete s.pending.Jacky;
    expect(() => undoFormal(s, 'Jacky', at)).toThrow();
    invalidate(s, 'fixture-b', 'wrong reviewer', at);
    expect(s.answers[1].choice).toBe('B');
    expect(activeAnswers(s, 'Jacky')).toHaveLength(0);
    validateState(s, db);
  });
  it('rejects incomplete unblinding, tampered mapping, duplicate active answers and calibration leaks', () => {
    const s = formal();
    expect(() => validateState(s, db, true)).toThrow();
    const invalid = structuredClone(s);
    invalid.formal!.assignments.Jacky[0].a = invalid.formal!.assignments.Jacky[0].b;
    expect(() => validateState(invalid, db)).toThrow();
    const leak = structuredClone(s);
    leak.formal!.assignments.Jacky[0] = leak.calibration.assignments[0];
    expect(() => validateState(leak, db)).toThrow();
    submitFormal(s, 'Jacky', 'A', at, 'fixture-a');
    s.answers.push({ ...s.answers[0], responseId: 'fixture-duplicate' });
    expect(() => validateState(s, db)).toThrow();
  });
  it('locks criterion, assignments and historical evidence on transition', () => {
    const before = formal();
    const after = structuredClone(before);
    after.calibration.guideline += ' edited';
    expect(() => validateTransition(before, after, db)).toThrow();
    after.calibration = structuredClone(before.calibration);
    after.formal!.assignments.Jacky.reverse();
    expect(() => validateTransition(before, after, db)).toThrow();
    const s = completed();
    s.unblindedAt = at;
    const changed = structuredClone(s);
    changed.answers[0].choice = 'B';
    expect(() => validateTransition(s, changed, db)).toThrow();
  });
  it('canonicalises independently oriented overlap preferences before agreement/export', () => {
    const s = completed();
    for (const a of s.answers) {
      const p = db.pairs.find((p) => p.pairId === a.pairId)!;
      a.choice = a.a === p.left ? 'A' : 'B';
    }
    s.unblindedAt = at;
    const report = analyse(s, db);
    expect(report.results.every((r) => r.rawAgreement === 1)).toBe(true);
    const exported = researchExport(s, db);
    expect(exported.formal).toHaveLength(96);
    expect(exported.calibration).toHaveLength(12);
    expect(exported.play).toHaveLength(0);
    expect(exported.formal.every((a) => a.canonicalPreference === a.contrast.split('-')[0])).toBe(
      true,
    );
    const a = s.answers[0];
    expect(canonical({ ...a, choice: 'Equal' }, db)).toBe('Equal');
  });
});
describe('shared/local fallback and conflicts', () => {
  it('merges independent reviewers and fails closed on same-reviewer conflicts', () => {
    const base = formal(),
      local = structuredClone(base),
      remote = structuredClone(base);
    submitFormal(local, 'Jacky', 'A', at, 'fixture-j');
    submitFormal(remote, 'Conrad', 'B', at, 'fixture-c');
    remote.revision = 1;
    const merged = reconcile(base, local, remote, db);
    expect(activeAnswers(merged, 'Jacky')).toHaveLength(1);
    expect(activeAnswers(merged, 'Conrad')).toHaveLength(1);
    const conflicting = structuredClone(base);
    submitFormal(conflicting, 'Jacky', 'B', at, 'fixture-other');
    expect(() => reconcile(base, local, conflicting, db)).toThrow();
  });
  it('accepts cumulative compatible backups and rejects altered response histories', () => {
    const s = formal(),
      next = structuredClone(s);
    submitFormal(next, 'Jacky', 'Equal', at, 'fixture-new');
    expect(mergeBackup(s, next, db).answers).toHaveLength(1);
    const bad = structuredClone(next);
    bad.answers[0].choice = 'B';
    expect(() => mergeBackup(next, bad, db)).toThrow();
    const wrong = structuredClone(next);
    wrong.protocolVersion = 'v3';
    expect(() => mergeBackup(s, wrong, db)).toThrow();
  });
});
