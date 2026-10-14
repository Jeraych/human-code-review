import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  activeAnswers,
  analyse,
  canonical,
  CONTRASTS,
  configuration,
  configureProtocol,
  LEGACY_CONFIG as DEFAULT_CONFIG,
  formalStarted,
  workload,
  resetCalibration,
  regenerateFormal,
  replaceProtocol,
  validateConfiguration,
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
import type { DatabaseV2, ProtocolState, ProtocolConfig } from '../src/v2';
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
function formal(config: ProtocolConfig = DEFAULT_CONFIG) {
  const s = initialProtocol(db, config);
  calibration(s);
  generateFormal(s, db, at);
  return s;
}
function completed() {
  const s = formal();
  for (const r of REVIEWERS)
    for (let i = 0; i < s.formal!.assignments[r].length; i++) {
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
    const config = configuration(s),
      expected = workload(config);
    expect(Object.values(f.assignments).flat()).toHaveLength(expected.Jacky + expected.Conrad);
    expect(
      new Set(
        Object.values(f.assignments)
          .flat()
          .map((p) => p.pairId),
      ).size,
    ).toBe(expected.distinct);
    expect(f.overlap).toHaveLength(expected.overlap);
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
      expect(distinct).toHaveLength(config.formalPerContrast);
      expect(new Set(distinct.map((p) => p.taskId)).size).toBe(config.formalPerContrast);
      expect(
        [3407, 3408, 3409].map((seed) => distinct.filter((p) => p.seed === seed).length).sort(),
      ).toEqual([6, 7, 7]);
      expect(
        f.overlap.filter((id) => db.pairs.find((p) => p.pairId === id)!.contrast === c),
      ).toHaveLength(config.overlapPerContrast);
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
    const expected = workload(configuration(s));
    expect(exported.formal).toHaveLength(expected.Jacky + expected.Conrad);
    expect(exported.calibration).toHaveLength(expected.calibration);
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

describe('Researcher-configurable V2', () => {
  it('retains the official defaults in one explicit configuration', () => {
    expect(DEFAULT_CONFIG).toEqual({
      contrasts: [...CONTRASTS],
      calibrationPerContrast: 3,
      formalPerContrast: 20,
      overlapPerContrast: 4,
      seed: 7002026,
    });
    expect(workload(DEFAULT_CONFIG)).toMatchObject({
      calibration: 12,
      distinct: 80,
      overlap: 16,
      Jacky: 48,
      Conrad: 48,
    });
  });
  it('trusts a concise non-empty Researcher criterion and rejects only empty wording', () => {
    const s = initialProtocol(db, DEFAULT_CONFIG);
    configureProtocol(s, db, DEFAULT_CONFIG, 'Clarity', at);
    calibration(s);
    generateFormal(s, db, at);
    validateState(s, db);
    expect(s.calibration.guideline).toBe('Clarity');
    expect(() => configureProtocol(initialProtocol(db), db, DEFAULT_CONFIG, '   ', at)).toThrow();
  });
  it.each([
    {
      contrasts: ['C-S'],
      calibrationPerContrast: 1,
      formalPerContrast: 5,
      overlapPerContrast: 2,
      seed: 19,
    },
    {
      contrasts: ['B-C', 'S-SJ'],
      calibrationPerContrast: 2,
      formalPerContrast: 7,
      overlapPerContrast: 2,
      seed: 123,
    },
    {
      contrasts: ['B-C', 'C-J', 'S-SJ'],
      calibrationPerContrast: 1,
      formalPerContrast: 5,
      overlapPerContrast: 0,
      seed: 0,
    },
    {
      contrasts: ['C-J'],
      calibrationPerContrast: 0,
      formalPerContrast: 1,
      overlapPerContrast: 0,
      seed: 4294967295,
    },
    {
      contrasts: ['C-S'],
      calibrationPerContrast: 1,
      formalPerContrast: 4,
      overlapPerContrast: 4,
      seed: 77,
    },
  ] as ProtocolConfig[])(
    'derives membership/workloads, breadth and A/B balance for %j',
    (config) => {
      const s = formal(config);
      validateState(s, db);
      const assignments = s.formal!.assignments;
      const ids = Object.fromEntries(
        REVIEWERS.map((r) => [r, new Set(assignments[r].map((a) => a.pairId))]),
      );
      const distinct = new Set([...ids.Jacky, ...ids.Conrad]);
      expect(distinct.size).toBe(config.contrasts.length * config.formalPerContrast);
      expect([...ids.Jacky].filter((id) => ids.Conrad.has(id))).toHaveLength(
        config.contrasts.length * config.overlapPerContrast,
      );
      expect(Math.abs(assignments.Jacky.length - assignments.Conrad.length)).toBeLessThanOrEqual(1);
      expect(s.calibration.assignments).toHaveLength(
        config.contrasts.length * config.calibrationPerContrast,
      );
      for (const c of config.contrasts) {
        const pairs = [...distinct]
          .map((id) => db.pairs.find((p) => p.pairId === id)!)
          .filter((p) => p.contrast === c);
        expect(pairs).toHaveLength(config.formalPerContrast);
        expect(new Set(pairs.map((p) => p.taskId)).size).toBe(config.formalPerContrast);
        const seedCounts = [3407, 3408, 3409].map(
          (seed) => pairs.filter((p) => p.seed === seed).length,
        );
        expect(Math.max(...seedCounts) - Math.min(...seedCounts)).toBeLessThanOrEqual(1);
        for (const r of REVIEWERS) {
          const items = assignments[r].filter(
            (a) => db.pairs.find((p) => p.pairId === a.pairId)!.contrast === c,
          );
          const leftA = items.filter(
            (a) => db.pairs.find((p) => p.pairId === a.pairId)!.left === a.a,
          ).length;
          expect(Math.abs(leftA - (items.length - leftA))).toBeLessThanOrEqual(1);
        }
      }
      expect(
        [...distinct].every((id) => !s.calibration.assignments.some((a) => a.pairId === id)),
      ).toBe(true);
      expect(s.formal).toEqual(formal(config).formal);
      for (const r of REVIEWERS)
        for (let i = 0; i < assignments[r].length; i++) {
          submitFormal(s, r, 'Equal', at, `fixture-config-${r}-${i}`);
          delete s.pending[r];
        }
      s.unblindedAt = at;
      const analysis = analyse(s, db);
      expect(analysis.results.map((r) => r.contrast)).toEqual(config.contrasts);
      expect(analysis.results.every((r) => r.distinctPairs === config.formalPerContrast)).toBe(
        true,
      );
      if (!config.overlapPerContrast)
        expect(analysis.results.every((r) => r.rawAgreement === null && r.kappa === null)).toBe(
          true,
        );
      expect(researchExport(s, db).configuration).toEqual(config);
    },
  );
  it('rejects empty, fractional, negative, excessive-overlap, excessive-pool and invalid seed settings', () => {
    for (const config of [
      { ...DEFAULT_CONFIG, contrasts: [] },
      { ...DEFAULT_CONFIG, contrasts: ['B-C', 'B-C'] },
      { ...DEFAULT_CONFIG, calibrationPerContrast: 1.5 },
      { ...DEFAULT_CONFIG, formalPerContrast: 0 },
      { ...DEFAULT_CONFIG, overlapPerContrast: 21 },
      { ...DEFAULT_CONFIG, overlapPerContrast: -1 },
      { ...DEFAULT_CONFIG, contrasts: ['S-SJ'], calibrationPerContrast: 0, formalPerContrast: 227 },
      { ...DEFAULT_CONFIG, seed: -1 },
      { ...DEFAULT_CONFIG, seed: 4294967296 },
    ] as ProtocolConfig[])
      expect(() => validateConfiguration(config, db)).toThrow();
  });
  it('archives deliberate Calibration resets and excludes all previously assigned Calibration pairs', () => {
    const before = initialProtocol(db, DEFAULT_CONFIG);
    before.calibration.answers.push({
      ...before.calibration.assignments[0],
      responseId: 'fixture-before-reset',
      reviewer: 'Joint',
      phase: 'Calibration',
      choice: 'Equal',
      at,
    });
    const after = structuredClone(before);
    resetCalibration(after, db, at);
    validateTransition(before, after, db);
    expect(after.archives![0].state.calibration.answers).toEqual(before.calibration.answers);
    expect(after.calibration.answers).toHaveLength(0);
    expect(
      after.calibration.assignments.every(
        (a) => !before.calibration.assignments.some((b) => a.pairId === b.pairId),
      ),
    ).toBe(true);
    calibration(after);
    generateFormal(after, db, at);
    validateState(after, db);
    expect(
      Object.values(after.formal!.assignments)
        .flat()
        .every((a) => !before.calibration.assignments.some((b) => a.pairId === b.pairId)),
    ).toBe(true);
  });
  it('edits criterion/seed before any Formal answer and archives explicit unstarted regeneration', () => {
    const before = formal(),
      after = structuredClone(before);
    const criterion =
      'Fixture reviewer criterion: prefer clear structures that are straightforward to maintain and debug.';
    configureProtocol(after, db, { ...DEFAULT_CONFIG, seed: 2027 }, criterion, at);
    expect(after.calibration.answers).toEqual(before.calibration.answers);
    expect(after.calibration.lockedAt).toBe(before.calibration.lockedAt);
    expect(after.formal).toBeUndefined();
    expect(after.archives![0].state.formal).toEqual(before.formal);
    validateTransition(before, after, db);
    generateFormal(after, db, at);
    const generated = structuredClone(after);
    regenerateFormal(after, db, at);
    validateTransition(generated, after, db);
    expect(after.archives![1].state.formal).toEqual(generated.formal);
    expect(after.formal!.seed).toBe(2027);
    expect(after.formal!.criterionVersion).toBe(after.calibration.criterionVersion);
  });
  it('freezes after first response even when Undo or recovery leaves zero active answers', () => {
    const before = formal();
    submitFormal(before, 'Jacky', 'A', at, 'fixture-freeze');
    undoFormal(before, 'Jacky', at);
    expect(activeAnswers(before, 'Jacky')).toHaveLength(0);
    expect(formalStarted(before)).toBe(true);
    expect(() =>
      configureProtocol(
        before,
        db,
        { ...DEFAULT_CONFIG, seed: 99 },
        before.calibration.guideline,
        at,
      ),
    ).toThrow();
    expect(() => resetCalibration(before, db, at)).toThrow();
    expect(() => regenerateFormal(before, db, at)).toThrow();
    const tampered = structuredClone(before);
    tampered.config!.seed = 99;
    tampered.formal!.seed = 99;
    expect(() => validateTransition(before, tampered, db)).toThrow();
  });
  it('requires explicit version replacement preserving full old state and immutable history', () => {
    const before = formal();
    submitFormal(before, 'Jacky', 'B', at, 'fixture-started');
    const after = structuredClone(before);
    replaceProtocol(after, db, 'Fixture invalidation: change research protocol', at);
    validateTransition(before, after, db);
    const { archives, ...oldState } = before;
    expect(after.archives![0].state).toEqual(oldState);
    expect(after.archives![0].disposition).toBe('invalidated');
    expect(after.edition).toBe(2);
    expect(after.answers).toHaveLength(0);
    expect(after.formal).toBeUndefined();
    expect(mergeBackup(before, after, db)).toEqual(after);
    const edited = structuredClone(after);
    edited.archives![0].state.answers[0].choice = 'A';
    expect(() => validateTransition(after, edited, db)).toThrow();
    const lost = structuredClone(after);
    lost.archives = [];
    expect(() => validateState(lost, db)).toThrow();
  });
  it('imports offline successive editions without losing prior Calibration records', () => {
    const before = initialProtocol(db),
      after = structuredClone(before);
    calibration(after);
    resetCalibration(after, db, at);
    calibration(after);
    resetCalibration(after, db, at);
    expect(mergeBackup(before, after, db).archives).toHaveLength(2);
  });
  it('archives completed unblinded evidence without rewriting it when explicitly replacing', () => {
    const before = completed();
    before.unblindedAt = at;
    const after = structuredClone(before);
    replaceProtocol(after, db, 'Fixture explicit replacement after completion', at);
    validateTransition(before, after, db);
    expect(after.archives![0].state.answers).toEqual(before.answers);
    expect(after.archives![0].state.unblindedAt).toBe(at);
    expect(after.unblindedAt).toBeUndefined();
  });
  it('accepts legacy V2 shape in place without migrating or reshuffling', () => {
    const legacy = formal();
    delete legacy.config;
    delete legacy.edition;
    delete legacy.calibration.seed;
    legacy.calibration.criterionVersion = 'readability-maintainability-v2';
    legacy.formal!.criterionVersion = legacy.calibration.criterionVersion;
    const raw = JSON.stringify(legacy);
    validateState(legacy, db);
    expect(JSON.stringify(legacy)).toBe(raw);
    expect(configuration(legacy)).toEqual(DEFAULT_CONFIG);
    expect(nextUnanswered(legacy, 'Conrad')).toEqual(legacy.formal!.assignments.Conrad[0]);
    const responded = structuredClone(legacy);
    submitFormal(responded, 'Conrad', 'Equal', at, 'fixture-legacy-answer');
    validateTransition(legacy, responded, db);
    expect(responded.formal).toEqual(legacy.formal);
  });
});
