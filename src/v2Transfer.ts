// File transport around the existing protocol engine; no separate sampling or response rules.
import {
  activeAnswers,
  assert,
  calibrationExclusions,
  configuration,
  protocolEdition,
  REVIEWERS,
  FORMAL_REVIEWERS,
  formalAssignments,
  responsePhase,
  validateState,
  validateTransition,
} from './v2.ts';
import type { Answer, DatabaseV2, ProtocolState, FormalReviewer } from './v2.ts';

export const REVIEWER_KEY = 'code-choice.v2-reviewer-package';
export interface StudyPackage {
  format: 'code-choice-v2-reviewer-study';
  studyId: string;
  reviewer: FormalReviewer;
  state: ProtocolState;
  comparisons: {
    pairId: string;
    a: string;
    b: string;
    prompt: string;
    codeA: string;
    codeB: string;
  }[];
  checksum: string;
}
export interface ReviewerSession {
  package: StudyPackage;
  state: ProtocolState;
  paused?: boolean;
}
export interface ReviewerResult {
  format: 'code-choice-v2-reviewer-result';
  studyId: string;
  reviewer: FormalReviewer;
  answers: Answer[];
  pending?: string;
  exportedAt: string;
  checksum: string;
}
// Key ordering does not affect compatibility. Array order (especially presentation order) does.
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + stable(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export async function digest(value: unknown, raw = false) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw ? String(value) : stable(value)),
  );
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
}
export async function studyId(s: ProtocolState) {
  assert(s.formal, 'Generate Study first.');
  return digest({
    protocolVersion: s.protocolVersion,
    poolVersion: s.poolVersion,
    catalogHash: s.catalogHash,
    edition: protocolEdition(s),
    config: configuration(s),
    calibration: s.calibration,
    formal: s.formal,
    excluded: [...calibrationExclusions(s)].sort(),
  });
}
function onlyReviewer(s: ProtocolState, reviewer: FormalReviewer) {
  const state = structuredClone(s);
  state.answers = state.answers.filter((a) => a.reviewer === reviewer);
  state.pending = state.pending[reviewer] ? { [reviewer]: state.pending[reviewer] } : {};
  delete state.unblindedAt;
  delete state.resultImports;
  // Keep archived Calibration exclusions for the same validator, without historical reviewer data.
  for (const archive of state.archives ?? []) {
    archive.state.answers = [];
    archive.state.pending = {};
    delete archive.state.unblindedAt;
    delete archive.state.resultImports;
    archive.disposition = 'superseded';
  }
  return state;
}
export async function exportStudy(
  s: ProtocolState,
  reviewer: FormalReviewer,
  db: DatabaseV2,
): Promise<StudyPackage> {
  validateState(s, db);
  assert(s.formal && !s.unblindedAt, 'Study is not available for review.');
  const state = onlyReviewer(s, reviewer);
  const content = {
    format: 'code-choice-v2-reviewer-study' as const,
    studyId: await studyId(s),
    reviewer,
    state,
    comparisons: formalAssignments(s, reviewer).map((p) => {
      const pair = db.pairs.find((x) => x.pairId === p.pairId)!;
      return {
        ...p,
        prompt: db.prompts[pair.taskId],
        codeA: db.outputs[p.a].code,
        codeB: db.outputs[p.b].code,
      };
    }),
  };
  return { ...content, checksum: await digest(content) };
}
async function checkChecksum(value: StudyPackage | ReviewerResult) {
  const { checksum, ...content } = value;
  assert(
    checksum === (await digest(content)),
    'File integrity check failed. Request the original file again.',
  );
}
export async function importStudy(
  raw: string,
  db: DatabaseV2,
  current?: ReviewerSession,
): Promise<ReviewerSession> {
  const value = JSON.parse(raw) as StudyPackage;
  assert(
    value.format === 'code-choice-v2-reviewer-study' && FORMAL_REVIEWERS.includes(value.reviewer),
    'Choose a reviewer Study file.',
  );
  await checkChecksum(value);
  validateState(value.state, db);
  assert(
    value.state.formal &&
      !value.state.unblindedAt &&
      value.studyId === (await studyId(value.state)),
    'Study compatibility check failed.',
  );
  assert(
    value.state.answers.every((a) => a.reviewer === value.reviewer) &&
      Object.keys(value.state.pending).every((r) => r === value.reviewer),
    'Study contains another reviewer’s progress.',
  );
  const expected = await exportStudy(value.state, value.reviewer, db);
  assert(
    stable(value.comparisons) === stable(expected.comparisons),
    'Study code or presentation differs from the frozen pool.',
  );
  let state = structuredClone(value.state);
  if (current) {
    assert(
      current.package.studyId === value.studyId && current.package.reviewer === value.reviewer,
      'A different reviewer Study is saved here. Export its Result before replacing it.',
    );
    const merged = mergeReviewer(
      current.state,
      value.state.answers,
      value.state.pending[value.reviewer],
      value.reviewer,
      db,
    );
    state = merged;
  }
  return { package: value, state };
}
export async function exportResult(session: ReviewerSession): Promise<ReviewerResult> {
  const content = {
    format: 'code-choice-v2-reviewer-result' as const,
    studyId: session.package.studyId,
    reviewer: session.package.reviewer,
    answers: session.state.answers.filter((a) => a.reviewer === session.package.reviewer),
    pending: session.state.pending[session.package.reviewer],
    exportedAt: new Date().toISOString(),
  };
  return { ...content, checksum: await digest(content) };
}
function mergeReviewer(
  current: ProtocolState,
  incoming: Answer[],
  pending: string | undefined,
  reviewer: FormalReviewer,
  db: DatabaseV2,
) {
  assert(
    Array.isArray(incoming) &&
      incoming.every(
        (a) =>
          a.reviewer === reviewer &&
          responsePhase(a) ===
            (reviewer === 'Joint' ? 'joint_consensus_formal' : 'independent_formal'),
      ),
    'Result contains another reviewer’s responses.',
  );
  const next = structuredClone(current);
  const local = next.answers.filter((a) => a.reviewer === reviewer);
  const received = structuredClone(current);
  received.answers = [...received.answers.filter((a) => a.reviewer !== reviewer), ...incoming];
  if (pending) received.pending[reviewer] = pending;
  else delete received.pending[reviewer];
  // Even a stale file must have valid responses and progress before we retain it as evidence.
  validateState(received, db);
  // Accept only cumulative histories in this reviewer namespace. Independent forks fail closed.
  const extendsHistory = (old: Answer[], newer: Answer[]) =>
    old.every((a) =>
      newer.some(
        (b) =>
          stable({ ...a, invalidated: undefined }) === stable({ ...b, invalidated: undefined }) &&
          (!a.invalidated || stable(a.invalidated) === stable(b.invalidated)),
      ),
    );
  if (extendsHistory(incoming, local) && local.length >= incoming.length) {
    if (stable(local) === stable(incoming) && !pending) delete next.pending[reviewer];
    validateTransition(current, next, db);
    return next;
  }
  assert(
    extendsHistory(local, incoming),
    'Conflicting responses. No saved response was overwritten.',
  );
  next.answers = [
    ...next.answers.filter((a) => a.reviewer !== reviewer),
    ...structuredClone(incoming),
  ];
  if (pending) next.pending[reviewer] = pending;
  else delete next.pending[reviewer];
  // A result may contain several Submit → Undo → Submit steps since the last transfer.
  // Original answers and invalidations must remain immutable; newly received Undo records are audited.
  for (const a of local) {
    const b = next.answers.find((b) => b.responseId === a.responseId)!;
    if (!a.invalidated && b.invalidated?.kind === 'undo')
      assert(
        current.pending[reviewer] === a.responseId,
        'A finalized saved response cannot be undone by an imported result.',
      );
  }
  validateState(next, db);
  validateTransition(current, next, db);
  return next;
}
export async function importResult(
  current: ProtocolState,
  raw: string,
  filename: string,
  reviewer: FormalReviewer,
  db: DatabaseV2,
): Promise<ProtocolState> {
  const value = JSON.parse(raw) as ReviewerResult;
  assert(value.format === 'code-choice-v2-reviewer-result', 'Choose a reviewer Result file.');
  await checkChecksum(value);
  assert(!isNaN(Date.parse(value.exportedAt)), 'Invalid Result export timestamp.');
  assert(value.studyId === (await studyId(current)), 'This result belongs to a different Study.');
  assert(
    value.reviewer === reviewer,
    `This is ${value.reviewer}’s Result. Use Import ${value.reviewer} Result.`,
  );
  assert(!current.unblindedAt, 'This Study has already been analysed. Its evidence is frozen.');
  const next = mergeReviewer(current, value.answers, value.pending, reviewer, db);
  const sha256 = await digest(raw, true);
  if (!(next.resultImports ?? []).some((s) => s.sha256 === sha256)) {
    next.resultImports = [
      ...(next.resultImports ?? []),
      { filename, raw, sha256, at: new Date().toISOString(), reviewer, studyId: value.studyId },
    ];
  }
  validateTransition(current, next, db);
  return next;
}
export function overlapAvailable(s: ProtocolState) {
  const ids = REVIEWERS.map((r) => new Set(activeAnswers(s, r).map((a) => a.pairId)));
  return s.formal?.overlap.filter((id) => ids.every((set) => set.has(id))).length ?? 0;
}
