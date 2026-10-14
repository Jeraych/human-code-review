import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  initialProtocol,
  lockCalibration,
  generateFormal,
  submitFormal,
  undoFormal,
  replaceProtocol,
  researchExport,
  validateState,
} from '../src/v2';
import type { DatabaseV2, ProtocolState } from '../src/v2';
import {
  digest,
  studyId,
  exportStudy,
  importStudy,
  exportResult,
  importResult,
  overlapAvailable,
} from '../src/v2Transfer';
const read = (p: string) =>
  JSON.parse(readFileSync(new URL('../public/v2/' + p, import.meta.url), 'utf8'));
const db: DatabaseV2 = {
  ...read('catalog.json'),
  outputs: Object.fromEntries(
    ['B', 'C', 'S', 'J', 'SJ']
      .flatMap((c) => read(`outputs-${c}.json`))
      .map((o) => [o.outputId, o]),
  ),
};
const at = '2026-10-14T01:00:00.000Z';
function study() {
  const s = initialProtocol(db, {
    contrasts: ['B-C', 'C-S'],
    calibrationPerContrast: 1,
    formalPerContrast: 5,
    overlapPerContrast: 2,
    seed: 42,
  });
  s.calibration.answers = s.calibration.assignments.map((p, i) => ({
    ...p,
    responseId: `fixture-cal-${i}`,
    reviewer: 'Joint',
    phase: 'Calibration',
    choice: 'Equal',
    at,
  }));
  lockCalibration(s, at);
  generateFormal(s, db, at);
  return s;
}
async function reviewer(s: ProtocolState, r: 'Jacky' | 'Conrad') {
  return importStudy(JSON.stringify(await exportStudy(s, r, db)), db);
}
function answer(session: Awaited<ReturnType<typeof reviewer>>, id: string = crypto.randomUUID()) {
  submitFormal(session.state, session.package.reviewer, 'Equal', at, id);
  delete session.state.pending[session.package.reviewer];
}
it('package carries criterion, exact order and A/B, code, prompt, identity and only own progress', async () => {
  const s = study();
  submitFormal(s, 'Conrad', 'B', at, 'fixture-other');
  const p = await exportStudy(s, 'Jacky', db);
  expect(p.comparisons.map(({ pairId, a, b }) => ({ pairId, a, b }))).toEqual(
    s.formal!.assignments.Jacky,
  );
  expect(p.comparisons.every((p) => p.prompt && p.codeA && p.codeB)).toBe(true);
  expect(p.state.calibration.guideline).toBe(s.calibration.guideline);
  expect(p.state.answers).toEqual([]);
  expect(p.state.pending.Conrad).toBeUndefined();
  expect(p.state.resultImports).toBeUndefined();
});
it('Study identity freezes criterion, generation, assignment order/mapping and config, but excludes progress/revision', async () => {
  const s = study(),
    id = await studyId(s);
  s.revision++;
  submitFormal(s, 'Jacky', 'A', at, 'fixture');
  expect(await studyId(s)).toBe(id);
  for (const edit of [
    (s: ProtocolState) => {
      s.formal!.createdAt = '2026-10-15';
    },
    (s: ProtocolState) => {
      s.formal!.assignments.Jacky.reverse();
    },
    (s: ProtocolState) => {
      s.calibration.guideline += ' modified';
    },
    (s: ProtocolState) => {
      s.config!.seed++;
    },
  ]) {
    const changed = structuredClone(s);
    edit(changed);
    expect(await studyId(changed)).not.toBe(id);
  }
});
it('tampered package checksum and re-signed code/mapping are rejected', async () => {
  const p = await exportStudy(study(), 'Jacky', db);
  p.comparisons[0].codeA += '# changed';
  await expect(importStudy(JSON.stringify(p), db)).rejects.toThrow('integrity');
  const { checksum, ...content } = p;
  p.checksum = await digest(content);
  await expect(importStudy(JSON.stringify(p), db)).rejects.toThrow('frozen pool');
});
it('re-importing original package keeps saved reviewer answers and refuses a different identity', async () => {
  const s = study(),
    session = await reviewer(s, 'Jacky');
  answer(session);
  const loaded = await importStudy(JSON.stringify(session.package), db, session);
  expect(loaded.state.answers).toEqual(session.state.answers);
  await expect(
    importStudy(JSON.stringify(await exportStudy(s, 'Conrad', db)), db, session),
  ).rejects.toThrow('different reviewer Study');
});
it('independent results combine in their reviewer namespaces and preserve original source files', async () => {
  let s = study();
  for (const r of ['Jacky', 'Conrad'] as const) {
    const session = await reviewer(s, r);
    for (const _p of session.state.formal!.assignments[r]) answer(session);
    const raw = JSON.stringify(await exportResult(session));
    s = await importResult(s, raw, `${r}-result.json`, r, db);
    expect(s.resultImports!.at(-1)!.raw).toBe(raw);
    expect(s.resultImports!.at(-1)!.sha256).toBe(createHash('sha256').update(raw).digest('hex'));
  }
  validateState(s, db, true);
  expect(overlapAvailable(s)).toBe(s.formal!.overlap.length);
  s.unblindedAt = at;
  expect(researchExport(s, db).protocol.resultImports).toHaveLength(2);
});
it('duplicate imports are idempotent and a stale result does not erase newer progress', async () => {
  const session = await reviewer(study(), 'Jacky');
  answer(session);
  const raw = JSON.stringify(await exportResult(session));
  let s = await importResult(study(), raw, 'same.json', 'Jacky', db);
  s = await importResult(s, raw, 'same.json', 'Jacky', db);
  expect(s.resultImports).toHaveLength(1);
  answer(session);
  s = await importResult(s, JSON.stringify(await exportResult(session)), 'later.json', 'Jacky', db);
  const older = await importResult(s, raw, 'same.json', 'Jacky', db);
  expect(older.answers).toEqual(s.answers);
});
it('different generation, wrong reviewer and changed original responses fail without overwriting', async () => {
  const s = study(),
    session = await reviewer(s, 'Jacky');
  answer(session, 'fixture-first');
  const raw = JSON.stringify(await exportResult(session));
  await expect(importResult(s, raw, 'wrong.json', 'Conrad', db)).rejects.toThrow('Jacky');
  const other = study();
  other.formal!.createdAt = '2026-10-15';
  await expect(importResult(other, raw, 'wrong.json', 'Jacky', db)).rejects.toThrow(
    'different Study',
  );
  const merged = await importResult(s, raw, 'first.json', 'Jacky', db);
  session.state.answers[0].choice = 'B';
  await expect(
    importResult(merged, JSON.stringify(await exportResult(session)), 'fork.json', 'Jacky', db),
  ).rejects.toThrow('Conflicting responses');
  expect(merged.answers[0].choice).toBe('Equal');
});
it('new offline Undo audit survives transfer but a finalized existing answer cannot be silently undone', async () => {
  const s = study(),
    session = await reviewer(s, 'Jacky');
  submitFormal(session.state, 'Jacky', 'A', at, 'fixture-undo');
  undoFormal(session.state, 'Jacky', at);
  answer(session);
  const merged = await importResult(
    s,
    JSON.stringify(await exportResult(session)),
    'undo.json',
    'Jacky',
    db,
  );
  expect(merged.answers[0].invalidated?.kind).toBe('undo');
  const fresh = await reviewer(s, 'Jacky');
  answer(fresh, 'fixture-final');
  const finalized = await importResult(
    s,
    JSON.stringify(await exportResult(fresh)),
    'finalized.json',
    'Jacky',
    db,
  );
  fresh.state.answers[0].invalidated = { at, kind: 'undo', reason: 'forged old Undo' };
  await expect(
    importResult(finalized, JSON.stringify(await exportResult(fresh)), 'fork.json', 'Jacky', db),
  ).rejects.toThrow('finalized');
});
it('replacement preserves imported source evidence in archive and cannot accept an old Study result', async () => {
  const s = study(),
    session = await reviewer(s, 'Jacky');
  answer(session);
  const raw = JSON.stringify(await exportResult(session));
  const merged = await importResult(s, raw, 'source.json', 'Jacky', db);
  replaceProtocol(merged, db, 'Fixture explicit replacement', at);
  expect(merged.resultImports).toBeUndefined();
  expect(merged.archives!.at(-1)!.state.resultImports![0].raw).toBe(raw);
  lockCalibrationFixture(merged);
  generateFormal(merged, db, at);
  await expect(importResult(merged, raw, 'old.json', 'Jacky', db)).rejects.toThrow(
    'different Study',
  );
  const pkg = await exportStudy(merged, 'Jacky', db);
  expect(
    pkg.state.archives!.every(
      (a) => !a.state.answers.length && !a.state.resultImports && !a.state.unblindedAt,
    ),
  ).toBe(true);
  await importStudy(JSON.stringify(pkg), db);
});
function lockCalibrationFixture(s: ProtocolState) {
  s.calibration.answers = s.calibration.assignments.map((p, i) => ({
    ...p,
    responseId: `fixture-new-cal-${i}`,
    reviewer: 'Joint',
    phase: 'Calibration',
    choice: 'Equal',
    at,
  }));
  lockCalibration(s, at);
}
it('stale malformed Results are rejected and a later Next clears pending without changing responses', async () => {
  const session = await reviewer(study(), 'Jacky');
  submitFormal(session.state, 'Jacky', 'Equal', at, 'fixture-pending');
  const pending = JSON.stringify(await exportResult(session));
  const merged = await importResult(study(), pending, 'pending.json', 'Jacky', db);
  delete session.state.pending.Jacky;
  const finalized = await importResult(
    merged,
    JSON.stringify(await exportResult(session)),
    'next.json',
    'Jacky',
    db,
  );
  expect(finalized.pending.Jacky).toBeUndefined();
  expect(finalized.answers).toEqual(merged.answers);
  const bad = await exportResult(session);
  bad.pending = 'unknown-response';
  const { checksum, ...content } = bad;
  bad.checksum = await digest(content);
  await expect(
    importResult(finalized, JSON.stringify(bad), 'bad.json', 'Jacky', db),
  ).rejects.toThrow('pending');
});
