// Shared protocol rules: used unchanged by the browser, API and offline analysis.
export const PROTOCOL = 'human-validation-v2';
export const SEED = 7002026;
export const CONTRASTS = ['B-C', 'C-S', 'C-J', 'S-SJ'] as const;
export type Contrast = (typeof CONTRASTS)[number];
export interface ProtocolConfig {
  contrasts: Contrast[];
  calibrationPerContrast: number;
  formalPerContrast: number;
  overlapPerContrast: number;
  seed: number;
}
export const DEFAULT_CONFIG: ProtocolConfig = {
  contrasts: [...CONTRASTS],
  calibrationPerContrast: 3,
  formalPerContrast: 20,
  overlapPerContrast: 4,
  seed: SEED,
};
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
  // Optional fields preserve already-saved V2 records without rewriting them.
  config?: ProtocolConfig;
  edition?: number;
  archives?: ProtocolArchive[];
  calibration: {
    assignments: Presentation[];
    answers: Answer[];
    guideline: string;
    lockedAt?: string;
    criterionVersion?: string;
    seed?: number;
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
export interface ProtocolArchive {
  at: string;
  reason: string;
  disposition: 'superseded' | 'invalidated';
  state: Omit<ProtocolState, 'archives'>;
}
export const configuration = (s: ProtocolState): ProtocolConfig => s.config ?? DEFAULT_CONFIG;
export const protocolEdition = (s: ProtocolState) => s.edition ?? 1;
export const formalStarted = (s: ProtocolState) => s.answers.length > 0 || !!s.unblindedAt;
export function workload(config: ProtocolConfig) {
  const remaining = config.formalPerContrast - config.overlapPerContrast;
  const perContrast = config.contrasts.map((contrast, i) => ({
    contrast,
    Jacky:
      config.overlapPerContrast + Math.floor(remaining / 2) + (i % 2 === 0 ? remaining % 2 : 0),
    Conrad:
      config.overlapPerContrast + Math.floor(remaining / 2) + (i % 2 === 1 ? remaining % 2 : 0),
  }));
  return {
    calibration: config.contrasts.length * config.calibrationPerContrast,
    distinct: config.contrasts.length * config.formalPerContrast,
    overlap: config.contrasts.length * config.overlapPerContrast,
    Jacky: perContrast.reduce((n, c) => n + c.Jacky, 0),
    Conrad: perContrast.reduce((n, c) => n + c.Conrad, 0),
    perContrast,
  };
}
function pastCalibration(s?: ProtocolState) {
  return new Set(
    s?.archives?.flatMap((a) => a.state.calibration.assignments.map((p) => p.pairId)) ?? [],
  );
}
export function calibrationExclusions(s: ProtocolState) {
  return new Set([...pastCalibration(s), ...s.calibration.assignments.map((p) => p.pairId)]);
}
export function validateConfiguration(
  config: ProtocolConfig,
  db: Catalog,
  excluded = new Set<string>(),
  reserveCalibration = true,
) {
  assert(
    Array.isArray(config.contrasts) &&
      config.contrasts.length > 0 &&
      new Set(config.contrasts).size === config.contrasts.length &&
      config.contrasts.every((c) => CONTRASTS.includes(c)),
    'Enable at least one supported contrast, without duplicates.',
  );
  for (const [key, value] of Object.entries(config).filter(([key]) => key !== 'contrasts'))
    assert(
      Number.isInteger(value) && (value as number) >= 0,
      `${key} must be a non-negative integer.`,
    );
  assert(config.formalPerContrast >= 1, 'Formal pairs per contrast must be at least 1.');
  assert(
    config.overlapPerContrast <= config.formalPerContrast,
    'Overlap cannot exceed Formal pairs per contrast.',
  );
  assert(config.seed <= 0xffffffff, 'Randomisation seed must be between 0 and 4294967295.');
  for (const c of config.contrasts) {
    const available = db.pairs.filter(
      (p) => p.contrast === c && p.eligible && !excluded.has(p.pairId),
    ).length;
    assert(
      (reserveCalibration ? config.calibrationPerContrast : 0) + config.formalPerContrast <=
        available,
      `${c}: requested ${config.calibrationPerContrast} Calibration + ${config.formalPerContrast} Formal pairs, but only ${available} eligible pairs are available after archived Calibration exclusions.`,
    );
  }
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
function orientBalanced(pairs: PairV2[], next: () => number): Presentation[] {
  const leftInA = new Set(
    shuffle(pairs, next)
      .slice(0, Math.floor(pairs.length / 2) + (pairs.length % 2 && next() < 0.5 ? 1 : 0))
      .map((p) => p.pairId),
  );
  return pairs.map((p) =>
    leftInA.has(p.pairId)
      ? { pairId: p.pairId, a: p.left, b: p.right }
      : { pairId: p.pairId, a: p.right, b: p.left },
  );
}
export function initialProtocol(
  db: Catalog,
  config = DEFAULT_CONFIG,
  guideline = GUIDELINE,
  excluded = new Set<string>(),
): ProtocolState {
  validateConfiguration(config, db, excluded);
  const next = random(config.seed);
  const assignments = config.contrasts.flatMap((c) =>
    orientBalanced(sample(db, c, config.calibrationPerContrast, excluded, next), next),
  );
  return {
    schemaVersion: 2,
    protocolVersion: PROTOCOL,
    poolVersion: db.poolVersion,
    catalogHash: db.catalogHash,
    revision: 0,
    config: structuredClone(config),
    edition: 1,
    calibration: {
      assignments: shuffle(assignments, next),
      answers: [],
      guideline,
      seed: config.seed,
    },
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
    s.calibration.answers.length === workload(configuration(s)).calibration &&
      new Set(s.calibration.answers.map((a) => a.pairId)).size === s.calibration.assignments.length,
    `Complete all ${s.calibration.assignments.length} calibration comparisons.`,
  );
  assert(s.calibration.guideline.trim().length > 0, 'Enter a reviewer criterion/guideline.');
  s.calibration.lockedAt = at;
  s.calibration.criterionVersion = `criterion-v2-${protocolEdition(s)}`;
}
export function generateFormal(s: ProtocolState, db: Catalog, at: string) {
  assert(
    s.calibration.lockedAt && !s.formal && !s.answers.length,
    'Lock Calibration first. Existing Formal protocols cannot be regenerated.',
  );
  const config = configuration(s);
  const next = random(config.seed),
    excluded = calibrationExclusions(s);
  validateConfiguration(config, db, excluded, false);
  const assignments: Record<Reviewer, Presentation[]> = { Jacky: [], Conrad: [] },
    overlap: string[] = [];
  for (const allocation of workload(config).perContrast) {
    const pairs = sample(db, allocation.contrast, config.formalPerContrast, excluded, next);
    // Membership and orientation are frozen independently per reviewer.
    const common = pairs.slice(0, config.overlapPerContrast);
    const split = allocation.Jacky;
    overlap.push(...common.map((p) => p.pairId));
    assignments.Jacky.push(
      ...orientBalanced([...common, ...pairs.slice(config.overlapPerContrast, split)], next),
    );
    assignments.Conrad.push(...orientBalanced([...common, ...pairs.slice(split)], next));
  }
  s.formal = {
    assignmentVersion: `formal-v2-assignment-${protocolEdition(s)}`,
    seed: config.seed,
    createdAt: at,
    criterionVersion: s.calibration.criterionVersion!,
    assignments: {
      Jacky: shuffle(assignments.Jacky, next),
      Conrad: shuffle(assignments.Conrad, next),
    },
    overlap,
  };
}
function archive(
  s: ProtocolState,
  at: string,
  reason: string,
  disposition: ProtocolArchive['disposition'],
) {
  assert(
    reason.trim().length >= 3 && !isNaN(Date.parse(at)),
    'Provide an audit reason and timestamp.',
  );
  const { archives, ...state } = structuredClone(s);
  s.archives = [...(archives ?? []), { at, reason: reason.trim(), disposition, state }];
  s.edition = protocolEdition(state) + 1;
  s.config = structuredClone(configuration(state));
}
export function configureProtocol(
  s: ProtocolState,
  db: Catalog,
  config: ProtocolConfig,
  guideline: string,
  at: string,
) {
  assert(!formalStarted(s), 'Formal has started. Invalidate and replace the protocol explicitly.');
  assert(guideline.trim().length > 0, 'Enter a reviewer criterion/guideline.');
  validateConfiguration(config, db);
  if (
    JSON.stringify(configuration(s)) === JSON.stringify(config) &&
    s.calibration.guideline === guideline
  )
    return;
  const old = configuration(s);
  const keepCalibration =
    old.calibrationPerContrast === config.calibrationPerContrast &&
    JSON.stringify(old.contrasts) === JSON.stringify(config.contrasts);
  archive(
    s,
    at,
    'Researcher deliberately changed protocol configuration or criterion',
    'superseded',
  );
  s.config = structuredClone(config);
  if (!keepCalibration) {
    const next = initialProtocol(db, config, guideline, pastCalibration(s));
    s.calibration = next.calibration;
  } else {
    s.calibration.guideline = guideline;
    if (s.calibration.lockedAt)
      s.calibration.criterionVersion = `criterion-v2-${protocolEdition(s)}`;
    validateConfiguration(config, db, calibrationExclusions(s), false);
  }
  delete s.formal;
  s.pending = {};
  delete s.unblindedAt;
}
export function resetCalibration(s: ProtocolState, db: Catalog, at: string) {
  assert(!formalStarted(s), 'Formal has started. Replace the protocol explicitly.');
  archive(s, at, 'Researcher deliberately reset/regenerated Calibration', 'superseded');
  s.calibration = initialProtocol(
    db,
    configuration(s),
    s.calibration.guideline,
    pastCalibration(s),
  ).calibration;
  delete s.formal;
  s.pending = {};
}
export function regenerateFormal(s: ProtocolState, db: Catalog, at: string) {
  assert(!formalStarted(s) && s.formal, 'Only an unstarted Formal assignment can be regenerated.');
  archive(s, at, 'Researcher deliberately regenerated unstarted Formal assignments', 'superseded');
  delete s.formal;
  generateFormal(s, db, at);
}
export function replaceProtocol(s: ProtocolState, db: Catalog, reason: string, at: string) {
  assert(formalStarted(s), 'Only a started protocol requires explicit invalidation/replacement.');
  archive(s, at, reason, 'invalidated');
  const fresh = initialProtocol(db, configuration(s), s.calibration.guideline, pastCalibration(s));
  s.calibration = fresh.calibration;
  s.answers = [];
  s.pending = {};
  delete s.formal;
  delete s.unblindedAt;
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
function validateActiveState(s: ProtocolState, db: Catalog, requireComplete = false) {
  assert(
    s?.schemaVersion === 2 &&
      s.protocolVersion === PROTOCOL &&
      s.poolVersion === db.poolVersion &&
      s.catalogHash === db.catalogHash,
    'Protocol/pool/hash mismatch.',
  );
  assert(Number.isInteger(s.revision) && s.revision >= 0, 'Invalid revision.');
  const config = configuration(s),
    expected = workload(config);
  validateConfiguration(config, db, calibrationExclusions(s), false);
  const byId = new Map(db.pairs.map((p) => [p.pairId, p]));
  const checkPresentation = (a: Presentation) => {
    const p = byId.get(a.pairId);
    assert(
      p && p.eligible && a.a !== a.b && [a.a, a.b].every((id) => id === p.left || id === p.right),
      'Invalid or ineligible assignment/mapping.',
    );
  };
  assert(
    s.calibration.assignments.length === expected.calibration &&
      new Set(s.calibration.assignments.map((p) => p.pairId)).size === expected.calibration,
    `Expected ${expected.calibration} distinct calibration pairs.`,
  );
  s.calibration.assignments.forEach(checkPresentation);
  for (const c of CONTRASTS)
    assert(
      s.calibration.assignments.filter((p) => byId.get(p.pairId)!.contrast === c).length ===
        (config.contrasts.includes(c) ? config.calibrationPerContrast : 0),
      'Calibration contrasts/counts disagree with configuration.',
    );
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
      s.calibration.answers.length === expected.calibration &&
        !!s.calibration.criterionVersion &&
        s.calibration.guideline.trim().length > 0,
      'Incomplete locked calibration.',
    );
  if (!s.formal) {
    assert(!s.answers.length && !s.unblindedAt, 'Answers without Formal assignments.');
    assert(!requireComplete, 'Formal is not generated.');
    return;
  }
  assert(
    s.calibration.lockedAt &&
      s.formal.seed === config.seed &&
      s.formal.criterionVersion === s.calibration.criterionVersion &&
      s.formal.assignmentVersion === `formal-v2-assignment-${protocolEdition(s)}`,
    'Invalid Formal protocol metadata.',
  );
  const ids: Record<Reviewer, Set<string>> = { Jacky: new Set(), Conrad: new Set() };
  const calibration = calibrationExclusions(s);
  for (const r of REVIEWERS) {
    const list = s.formal.assignments[r];
    assert(list.length === expected[r], `Expected ${expected[r]} assignments for ${r}.`);
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
        list.filter((p) => byId.get(p.pairId)!.contrast === c).length ===
          (expected.perContrast.find((item) => item.contrast === c)?.[r] ?? 0),
        'Assignments per contrast/reviewer disagree with configuration.',
      );
    const active = activeAnswers(s, r);
    assert(
      new Set(active.map((a) => a.pairId)).size === active.length,
      'Duplicate active responses.',
    );
    if (requireComplete) assert(active.length === expected[r], `${r} is incomplete.`);
    if (s.pending[r])
      assert(
        active.some((a) => a.responseId === s.pending[r]),
        'Invalid pending answer.',
      );
  }
  const union = new Set([...ids.Jacky, ...ids.Conrad]),
    common = [...ids.Jacky].filter((id) => ids.Conrad.has(id));
  assert(
    union.size === expected.distinct &&
      common.length === expected.overlap &&
      new Set(s.formal.overlap).size === expected.overlap &&
      common.every((id) => s.formal!.overlap.includes(id)),
    'Wrong distinct/overlap membership.',
  );
  for (const c of CONTRASTS)
    assert(
      [...union].filter((id) => byId.get(id)!.contrast === c).length ===
        (config.contrasts.includes(c) ? config.formalPerContrast : 0) &&
        common.filter((id) => byId.get(id)!.contrast === c).length ===
          (config.contrasts.includes(c) ? config.overlapPerContrast : 0),
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
  if (s.unblindedAt && !requireComplete) validateActiveState(s, db, true);
}
export function validateState(s: ProtocolState, db: Catalog, requireComplete = false) {
  validateActiveState(s, db, requireComplete);
  const archives = s.archives ?? [];
  assert(
    Number.isInteger(protocolEdition(s)) && protocolEdition(s) === archives.length + 1,
    'Protocol edition/history mismatch.',
  );
  for (const [i, entry] of archives.entries()) {
    assert(
      entry &&
        typeof entry.reason === 'string' &&
        entry.reason.trim().length >= 3 &&
        !isNaN(Date.parse(entry.at)),
      'Invalid protocol archive metadata.',
    );
    assert(
      !('archives' in entry.state) && protocolEdition(entry.state) === i + 1,
      'Invalid archived protocol edition.',
    );
    assert(
      entry.disposition === (formalStarted(entry.state) ? 'invalidated' : 'superseded'),
      'Started protocols must be explicitly invalidated before replacement.',
    );
    validateActiveState({ ...entry.state, archives: archives.slice(0, i) }, db);
  }
}
export function validateTransition(before: ProtocolState, after: ProtocolState, db: Catalog) {
  validateState(after, db);
  assert(after.revision === before.revision, 'Revision changed by client.');
  const oldArchives = before.archives ?? [],
    newArchives = after.archives ?? [];
  assert(
    JSON.stringify(oldArchives) === JSON.stringify(newArchives.slice(0, oldArchives.length)),
    'Archived protocols changed or removed.',
  );
  if (protocolEdition(after) !== protocolEdition(before)) {
    assert(
      protocolEdition(after) > protocolEdition(before),
      'Protocol edition cannot move backwards.',
    );
    const first = newArchives[oldArchives.length];
    assert(first, 'Protocol replacement must preserve the previous state.');
    // An offline backup may contain legitimate edits followed by several deliberate replacements.
    const preserved = { ...first.state, archives: oldArchives };
    preserved.revision = before.revision;
    validateTransition(before, preserved, db);
    return;
  }
  assert(
    newArchives.length === oldArchives.length,
    'Archive appended without a new protocol edition.',
  );
  assert(
    JSON.stringify(configuration(before)) === JSON.stringify(configuration(after)),
    'Configuration changed without deliberate version replacement.',
  );
  if (before.calibration.lockedAt && formalStarted(before))
    assert(
      JSON.stringify(before.calibration) === JSON.stringify(after.calibration),
      'Locked calibration changed.',
    );
  if (before.formal)
    assert(
      JSON.stringify(before.formal) === JSON.stringify(after.formal),
      'Frozen Formal assignments changed.',
    );
  if (before.formal)
    assert(
      JSON.stringify(before.calibration) === JSON.stringify(after.calibration),
      'Formal criterion/calibration changed without version replacement.',
    );
  if (before.unblindedAt) {
    const { archives: _oldHistory, ...oldActive } = before;
    const { archives: _newHistory, ...newActive } = after;
    assert(
      JSON.stringify(oldActive) === JSON.stringify(newActive),
      'Unblinded evidence is archived.',
    );
  }
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
    protocolEdition(incoming) !== protocolEdition(current)
      ? protocolEdition(incoming) > protocolEdition(current)
        ? incoming
        : current
      : incoming.answers.length + incoming.calibration.answers.length >=
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
  const results = configuration(s).contrasts.map((contrast) => {
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
    const observed = paired.length
      ? paired.filter(([a, b]) => a === b).length / paired.length
      : null;
    const expected = labels.reduce(
      (n, label) =>
        n +
        (paired.filter((p) => p[0] === label).length *
          paired.filter((p) => p[1] === label).length) /
          (paired.length ** 2 || 1),
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
      distinctPairs: new Set(responses.map((a) => a.pairId)).size,
      ratings: responses.length,
      overlapPairs: paired.length,
      rawAgreement: observed,
      kappa: observed === null || expected === 1 ? null : (observed - expected) / (1 - expected),
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
    note: `${workload(configuration(s)).distinct} distinct pairs; ${workload(configuration(s)).Jacky + workload(configuration(s)).Conrad} correlated ratings. No treatment of ratings as independent tasks. Missing Judge measurements are not metric ties.`,
    results,
  };
}
export function researchExport(s: ProtocolState, db: DatabaseV2, play: unknown[] = []) {
  assert(s.unblindedAt, 'Research results remain blinded until both reviewers complete.');
  return {
    protocol: s,
    configuration: structuredClone(configuration(s)),
    protocolEdition: protocolEdition(s),
    archivedProtocols: s.archives ?? [],
    analysis: analyse(s, db),
    duplicateStats: db.stats,
    limitations: db.limitations,
    calibration: s.calibration.answers,
    formal: s.answers.map((a) => {
      const p = db.pairs.find((p) => p.pairId === a.pairId)!;
      return {
        ...a,
        protocolVersion: s.protocolVersion,
        protocolEdition: protocolEdition(s),
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
