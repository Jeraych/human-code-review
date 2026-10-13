// Shared protocol rules: used unchanged by the browser, API and offline analysis.
export const PROTOCOL = 'human-validation-v2';
export const SEED = 7002026;
export const CONTRASTS = ['B-C', 'C-S', 'C-J', 'S-SJ'] as const;
export const REVIEWERS = ['Jacky', 'Conrad'] as const;
export type Reviewer = (typeof REVIEWERS)[number];
export type Preference = 'A' | 'Equal' | 'B';
export type Condition = 'B' | 'C' | 'S' | 'J' | 'SJ';
export interface Output {
  outputId: string;
  condition: Condition;
  run: number;
  seed: number;
  taskId: string;
  ordinal: number;
  sourceFile: string;
  sourceRow: number;
  sourceKey: [string, number];
  sourceHash: string;
  code: string;
  codeHash: string;
  rawHash: string;
  testStatus: string;
  runtimeStatus: string;
  syntaxStatus: string;
  error: string | null;
  ruffStatus: string;
  ruffViolations: number;
  ruffScore: number | null;
  judgeStatus: string;
  judgeScore: number | null;
}
export interface PairV2 {
  pairId: string;
  contrast: string;
  taskId: string;
  seed: number;
  ordinal: number;
  left: string;
  right: string;
  exactCodeMatch: boolean;
  normalizedCodeMatch: boolean;
  bothCorrect: boolean;
  eligible: boolean;
}
export interface Catalog {
  schemaVersion: 2;
  protocolVersion: string;
  poolVersion: string;
  playPoolVersion: string;
  catalogHash: string;
  prompts: Record<string, string>;
  pairs: PairV2[];
  stats: Record<string, Record<string, number>>;
  aggregates: Record<string, Record<string, number>>;
  limitations: string[];
}
export interface DatabaseV2 extends Catalog {
  outputs: Record<string, Output>;
}
export interface Presentation {
  pairId: string;
  a: string;
  b: string;
}
export interface Answer extends Presentation {
  responseId: string;
  reviewer: Reviewer | 'Joint';
  phase: 'Formal' | 'Calibration';
  choice: Preference;
  at: string;
  invalidated?: { at: string; reason: string; kind: 'recovery' | 'undo' };
}
export interface ProtocolState {
  schemaVersion: 2;
  protocolVersion: string;
  poolVersion: string;
  catalogHash: string;
  revision: number;
  calibration: {
    assignments: Presentation[];
    answers: Answer[];
    guideline: string;
    lockedAt?: string;
    criterionVersion?: string;
  };
  formal?: {
    assignmentVersion: string;
    seed: number;
    createdAt: string;
    criterionVersion: string;
    assignments: Record<Reviewer, Presentation[]>;
    overlap: string[];
  };
  answers: Answer[];
  pending: Partial<Record<Reviewer, string>>;
  unblindedAt?: string;
}
export const GUIDELINE =
  'Judge based on readability and maintainability as if you were a developer who may need to understand, review, modify, or debug the code. Prefer only meaningful differences. Choose Equal when neither solution is clearly preferable.';
export function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(items: T[], next: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sample(
  db: Catalog,
  contrast: string,
  count: number,
  excluded: Set<string>,
  next: () => number,
) {
  const candidates = shuffle(
    db.pairs.filter((p) => p.contrast === contrast && p.eligible && !excluded.has(p.pairId)),
    next,
  );
  const usedTasks = new Set<string>(),
    usedIds = new Set<string>(),
    seeds: Record<number, number> = { 3407: 0, 3408: 0, 3409: 0 };
  const picked: PairV2[] = [];
  for (let i = 0; i < count; i++) {
    const available = candidates.filter((p) => !usedIds.has(p.pairId));
    const broad = available.filter((p) => !usedTasks.has(p.taskId));
    const list = broad.length ? broad : available;
    list.sort((a, b) => seeds[a.seed] - seeds[b.seed]);
    assert(list.length, `Insufficient eligible pairs for ${contrast}`);
    const p = list[0];
    picked.push(p);
    usedTasks.add(p.taskId);
    usedIds.add(p.pairId);
    seeds[p.seed]++;
  }
  return picked;
}
function orient(p: PairV2, next: () => number): Presentation {
  return next() < 0.5
    ? { pairId: p.pairId, a: p.left, b: p.right }
    : { pairId: p.pairId, a: p.right, b: p.left };
}
export function initialProtocol(db: Catalog): ProtocolState {
  const next = random(SEED);
  const assignments = CONTRASTS.flatMap((c) =>
    sample(db, c, 3, new Set(), next).map((p) => orient(p, next)),
  );
  return {
    schemaVersion: 2,
    protocolVersion: PROTOCOL,
    poolVersion: db.poolVersion,
    catalogHash: db.catalogHash,
    revision: 0,
    calibration: { assignments: shuffle(assignments, next), answers: [], guideline: GUIDELINE },
    answers: [],
    pending: {},
  };
}
export function activeAnswers(s: ProtocolState, r: Reviewer) {
  return s.answers.filter((a) => a.reviewer === r && !a.invalidated);
}
export function nextUnanswered(s: ProtocolState, r: Reviewer) {
  const answered = new Set(activeAnswers(s, r).map((a) => a.pairId));
  return s.formal?.assignments[r].find((a) => !answered.has(a.pairId));
}
export function lockCalibration(s: ProtocolState, at: string) {
  assert(!s.calibration.lockedAt && !s.formal, 'Calibration is already frozen.');
  assert(
    s.calibration.answers.length === 12 &&
      new Set(s.calibration.answers.map((a) => a.pairId)).size === 12,
    'Complete all 12 calibration comparisons.',
  );
  assert(s.calibration.guideline.trim().length >= 20, 'Enter a meaningful reviewer guideline.');
  s.calibration.lockedAt = at;
  s.calibration.criterionVersion = 'readability-maintainability-v2';
}
export function generateFormal(s: ProtocolState, db: Catalog, at: string) {
  assert(
    s.calibration.lockedAt && !s.formal && !s.answers.length,
    'Lock Calibration first. Existing Formal protocols cannot be regenerated.',
  );
  const next = random(SEED),
    excluded = new Set(s.calibration.assignments.map((p) => p.pairId));
  const assignments: Record<Reviewer, Presentation[]> = { Jacky: [], Conrad: [] },
    overlap: string[] = [];
  for (const contrast of CONTRASTS) {
    const pairs = sample(db, contrast, 20, excluded, next);
    // Membership and orientation are frozen independently per reviewer.
    overlap.push(...pairs.slice(0, 4).map((p) => p.pairId));
    assignments.Jacky.push(
      ...[...pairs.slice(0, 4), ...pairs.slice(4, 12)].map((p) => orient(p, next)),
    );
    assignments.Conrad.push(
      ...[...pairs.slice(0, 4), ...pairs.slice(12, 20)].map((p) => orient(p, next)),
    );
  }
  s.formal = {
    assignmentVersion: 'formal-v2-assignment-1',
    seed: SEED,
    createdAt: at,
    criterionVersion: s.calibration.criterionVersion!,
    assignments: {
      Jacky: shuffle(assignments.Jacky, next),
      Conrad: shuffle(assignments.Conrad, next),
    },
    overlap,
  };
}
export function submitFormal(
  s: ProtocolState,
  reviewer: Reviewer,
  choice: Preference,
  at: string,
  id: string,
) {
  assert(!s.unblindedAt && !s.pending[reviewer], 'Continue after the saved answer first.');
  assert(['A', 'Equal', 'B'].includes(choice), 'Invalid choice.');
  const p = nextUnanswered(s, reviewer);
  assert(p, 'No unanswered assignment.');
  s.answers.push({ ...p, responseId: id, reviewer, phase: 'Formal', choice, at });
  s.pending[reviewer] = id;
}
export function undoFormal(s: ProtocolState, r: Reviewer, at: string) {
  const answer = s.answers.find((a) => a.responseId === s.pending[r]);
  assert(
    answer && !answer.invalidated && !s.unblindedAt,
    'Only the immediately saved answer may be undone before Next.',
  );
  answer.invalidated = { at, reason: 'Immediate Undo before continuing', kind: 'undo' };
  delete s.pending[r];
}
export function invalidate(s: ProtocolState, id: string, reason: string, at: string) {
  assert(!s.unblindedAt, 'Unblinded protocols are archived; do not revise evidence.');
  const a = s.answers.find((a) => a.responseId === id);
  assert(a && !a.invalidated, 'Active response not found.');
  a.invalidated = { at, reason, kind: 'recovery' };
  if (s.pending[a.reviewer as Reviewer] === id) delete s.pending[a.reviewer as Reviewer];
}
export function canonical(
  answer: Presentation & { choice: Preference },
  db: DatabaseV2,
): Condition | 'Equal' {
  return answer.choice === 'Equal'
    ? 'Equal'
    : db.outputs[answer.choice === 'A' ? answer.a : answer.b].condition;
}
export function ruffTied(a: Output, b: Output) {
  return (
    ['ok', 'violations'].includes(a.ruffStatus) &&
    a.ruffStatus === b.ruffStatus &&
    a.ruffViolations === b.ruffViolations &&
    a.ruffScore === b.ruffScore
  );
}
export function validateCatalog(db: DatabaseV2) {
  assert(
    db.schemaVersion === 2 && db.protocolVersion === PROTOCOL && db.poolVersion === 'formal-v2',
    'Unsupported catalog.',
  );
  assert(new Set(db.pairs.map((p) => p.pairId)).size === db.pairs.length, 'Duplicate pair IDs.');
  for (const p of db.pairs) {
    const a = db.outputs[p.left],
      b = db.outputs[p.right];
    assert(
      a && b && CONTRASTS.includes(p.contrast as (typeof CONTRASTS)[number]),
      'Missing outputs or unexpected contrast.',
    );
    assert(
      p.contrast === `${a.condition}-${b.condition}` &&
        a.taskId === b.taskId &&
        p.taskId === a.taskId &&
        a.seed === b.seed &&
        p.seed === a.seed &&
        a.ordinal === b.ordinal &&
        p.ordinal === a.ordinal,
      'Invalid matching dimensions.',
    );
    const task = Number(p.taskId.split('/')[1]);
    assert(task >= 50 && task <= 99, 'Training data entered V2.');
    assert(
      p.exactCodeMatch === (a.code === b.code) &&
        p.bothCorrect === (a.testStatus === 'passed' && b.testStatus === 'passed'),
      'Eligibility record disagrees with outputs.',
    );
    assert(
      p.eligible === (p.bothCorrect && !p.exactCodeMatch && !!a.code.trim() && !!b.code.trim()),
      'Incorrect Formal filter.',
    );
  }
}
export function validateState(s: ProtocolState, db: Catalog, requireComplete = false) {
  assert(
    s?.schemaVersion === 2 &&
      s.protocolVersion === PROTOCOL &&
      s.poolVersion === db.poolVersion &&
      s.catalogHash === db.catalogHash,
    'Protocol/pool/hash mismatch.',
  );
  assert(Number.isInteger(s.revision) && s.revision >= 0, 'Invalid revision.');
  const byId = new Map(db.pairs.map((p) => [p.pairId, p]));
  const checkPresentation = (a: Presentation) => {
    const p = byId.get(a.pairId);
    assert(
      p && p.eligible && a.a !== a.b && [a.a, a.b].every((id) => id === p.left || id === p.right),
      'Invalid or ineligible assignment/mapping.',
    );
  };
  assert(
    s.calibration.assignments.length === 12 &&
      new Set(s.calibration.assignments.map((p) => p.pairId)).size === 12,
    'Expected 12 distinct calibration pairs.',
  );
  s.calibration.assignments.forEach(checkPresentation);
  assert(
    new Set(s.calibration.answers.map((a) => a.pairId)).size === s.calibration.answers.length,
    'Duplicate calibration answers.',
  );
  const checkAnswer = (a: Answer, phase: Answer['phase'], presentations: Presentation[]) => {
    assert(
      a.phase === phase &&
        ['A', 'Equal', 'B'].includes(a.choice) &&
        typeof a.responseId === 'string' &&
        !isNaN(Date.parse(a.at)),
      'Invalid response.',
    );
    const p = presentations.find((p) => p.pairId === a.pairId);
    assert(p && p.a === a.a && p.b === a.b, 'Response does not match frozen presentation.');
    if (a.invalidated)
      assert(
        !isNaN(Date.parse(a.invalidated.at)) &&
          typeof a.invalidated.reason === 'string' &&
          ['undo', 'recovery'].includes(a.invalidated.kind),
        'Invalid audit record.',
      );
  };
  for (const a of s.calibration.answers) {
    assert(a.reviewer === 'Joint' && !a.invalidated, 'Invalid joint calibration response.');
    checkAnswer(a, 'Calibration', s.calibration.assignments);
  }
  if (s.calibration.lockedAt)
    assert(
      s.calibration.answers.length === 12 &&
        !!s.calibration.criterionVersion &&
        s.calibration.guideline.trim().length >= 20,
      'Incomplete locked calibration.',
    );
  if (!s.formal) {
    assert(!s.answers.length && !s.unblindedAt, 'Answers without Formal assignments.');
    assert(!requireComplete, 'Formal is not generated.');
    return;
  }
  assert(
    s.calibration.lockedAt &&
      s.formal.seed === SEED &&
      s.formal.criterionVersion === s.calibration.criterionVersion &&
      s.formal.assignmentVersion === 'formal-v2-assignment-1',
    'Invalid Formal protocol metadata.',
  );
  const ids: Record<Reviewer, Set<string>> = { Jacky: new Set(), Conrad: new Set() };
  const calibration = new Set(s.calibration.assignments.map((a) => a.pairId));
  for (const r of REVIEWERS) {
    const list = s.formal.assignments[r];
    assert(list.length === 48, 'Expected 48 assignments per reviewer.');
    for (const p of list) {
      checkPresentation(p);
      assert(
        !calibration.has(p.pairId) && !ids[r].has(p.pairId),
        'Calibration leak or duplicate assignment.',
      );
      ids[r].add(p.pairId);
    }
    for (const c of CONTRASTS)
      assert(
        list.filter((p) => byId.get(p.pairId)!.contrast === c).length === 12,
        'Expected 12 assignments per contrast/reviewer.',
      );
    const active = activeAnswers(s, r);
    assert(
      new Set(active.map((a) => a.pairId)).size === active.length,
      'Duplicate active responses.',
    );
    if (requireComplete) assert(active.length === 48, `${r} is incomplete.`);
    if (s.pending[r])
      assert(
        active.some((a) => a.responseId === s.pending[r]),
        'Invalid pending answer.',
      );
  }
  const union = new Set([...ids.Jacky, ...ids.Conrad]),
    common = [...ids.Jacky].filter((id) => ids.Conrad.has(id));
  assert(
    union.size === 80 &&
      common.length === 16 &&
      new Set(s.formal.overlap).size === 16 &&
      common.every((id) => s.formal!.overlap.includes(id)),
    'Wrong distinct/overlap membership.',
  );
  for (const c of CONTRASTS)
    assert(
      [...union].filter((id) => byId.get(id)!.contrast === c).length === 20 &&
        common.filter((id) => byId.get(id)!.contrast === c).length === 4,
      'Wrong per-contrast membership.',
    );
  assert(
    new Set(s.answers.map((a) => a.responseId)).size === s.answers.length,
    'Duplicate response IDs.',
  );
  for (const a of s.answers) {
    assert(REVIEWERS.includes(a.reviewer as Reviewer), 'Invalid reviewer.');
    checkAnswer(a, 'Formal', s.formal.assignments[a.reviewer as Reviewer]);
  }
  if (s.unblindedAt && !requireComplete) validateState(s, db, true);
}
export function validateTransition(before: ProtocolState, after: ProtocolState, db: Catalog) {
  validateState(after, db);
  assert(after.revision === before.revision, 'Revision changed by client.');
  if (before.calibration.lockedAt)
    assert(
      JSON.stringify(before.calibration) === JSON.stringify(after.calibration),
      'Locked calibration changed.',
    );
  if (before.formal)
    assert(
      JSON.stringify(before.formal) === JSON.stringify(after.formal),
      'Frozen Formal assignments changed.',
    );
  if (before.unblindedAt)
    assert(JSON.stringify(before) === JSON.stringify(after), 'Unblinded evidence is archived.');
  for (const a of before.calibration.answers)
    assert(
      after.calibration.answers.some((b) => JSON.stringify(a) === JSON.stringify(b)),
      'Historical calibration response changed or removed.',
    );
  for (const a of before.answers) {
    const b = after.answers.find((b) => b.responseId === a.responseId);
    assert(
      b &&
        JSON.stringify({ ...a, invalidated: undefined }) ===
          JSON.stringify({ ...b, invalidated: undefined }),
      'Historical response changed or removed.',
    );
    if (a.invalidated)
      assert(
        JSON.stringify(a.invalidated) === JSON.stringify(b.invalidated),
        'Invalidation changed.',
      );
    if (!a.invalidated && b.invalidated?.kind === 'undo')
      assert(before.pending[a.reviewer as Reviewer] === a.responseId, 'Older answer cannot Undo.');
  }
  if (after.unblindedAt) validateState(after, db, true);
}
export function mergeBackup(
  current: ProtocolState,
  incoming: ProtocolState,
  db: Catalog,
): ProtocolState {
  validateState(current, db);
  validateState(incoming, db);
  // Only compatible cumulative backups are accepted; forks are never silently combined.
  const high =
    incoming.answers.length + incoming.calibration.answers.length >=
    current.answers.length + current.calibration.answers.length
      ? incoming
      : current;
  const low = high === incoming ? current : incoming;
  const candidate = structuredClone(high);
  candidate.revision = low.revision;
  validateTransition(low, candidate, db);
  candidate.revision = current.revision;
  return candidate;
}
export function analyse(s: ProtocolState, db: DatabaseV2) {
  assert(s.unblindedAt, 'Unblind after complete validation to analyse.');
  validateState(s, db, true);
  const results = CONTRASTS.map((contrast) => {
    const responses = s.answers.filter(
      (a) => !a.invalidated && db.pairs.find((p) => p.pairId === a.pairId)!.contrast === contrast,
    );
    const overlaps = s.formal!.overlap.filter(
      (id) => db.pairs.find((p) => p.pairId === id)!.contrast === contrast,
    );
    const labels = [contrast.split('-')[0], 'Equal', contrast.split('-')[1]];
    const paired = overlaps.map((id) =>
      REVIEWERS.map((r) =>
        canonical(
          responses.find((a) => a.pairId === id && a.reviewer === r)!,
          db,
        ),
      ),
    );
    const observed = paired.filter(([a, b]) => a === b).length / paired.length;
    const expected = labels.reduce(
      (n, label) =>
        n +
        (paired.filter((p) => p[0] === label).length *
          paired.filter((p) => p[1] === label).length) /
          paired.length ** 2,
      0,
    );
    const ruffTies = responses.filter((a) => ruffTied(db.outputs[a.a], db.outputs[a.b]));
    const metricTied = ruffTies.filter((a) => {
      const x = db.outputs[a.a],
        y = db.outputs[a.b];
      return (
        x.judgeScore !== null &&
        y.judgeScore !== null &&
        x.judgeStatus === 'ok' &&
        y.judgeStatus === 'ok' &&
        x.judgeScore === y.judgeScore
      );
    });
    return {
      contrast,
      distinctPairs: 20,
      ratings: responses.length,
      overlapPairs: paired.length,
      rawAgreement: observed,
      kappa: expected === 1 ? null : (observed - expected) / (1 - expected),
      counts: Object.fromEntries(
        labels.map((l) => [l, responses.filter((a) => canonical(a, db) === l).length]),
      ),
      ruffTiedRatings: ruffTies.length,
      ruffTiedPreferences: ruffTies.filter((a) => a.choice !== 'Equal').length,
      ruffAndMeasuredJudgeTiedRatings: metricTied.length,
      ruffAndMeasuredJudgeTiedPreferences: metricTied.filter((a) => a.choice !== 'Equal').length,
    };
  });
  return {
    note: '80 distinct pairs; 96 correlated ratings. No treatment of ratings as independent tasks. Missing Judge measurements are not metric ties.',
    results,
  };
}
export function researchExport(s: ProtocolState, db: DatabaseV2, play: unknown[] = []) {
  assert(s.unblindedAt, 'Research results remain blinded until both reviewers complete.');
  return {
    protocol: s,
    analysis: analyse(s, db),
    duplicateStats: db.stats,
    limitations: db.limitations,
    calibration: s.calibration.answers,
    formal: s.answers.map((a) => {
      const p = db.pairs.find((p) => p.pairId === a.pairId)!;
      return {
        ...a,
        protocolVersion: s.protocolVersion,
        poolVersion: s.poolVersion,
        assignmentVersion: s.formal!.assignmentVersion,
        criterion: s.calibration.guideline,
        criterionVersion: s.formal!.criterionVersion,
        contrast: p.contrast,
        taskId: p.taskId,
        canonicalPreference: canonical(a, db),
        eligibility: p,
        aOutput: db.outputs[a.a],
        bOutput: db.outputs[a.b],
      };
    }),
    play,
  };
}
