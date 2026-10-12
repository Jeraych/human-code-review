import { REASONS, type Assignment, type Pool, type Session, type Vote } from './types';

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function validatePool(value: unknown): asserts value is Pool {
  assert(
    object(value) &&
      value.schemaVersion === 1 &&
      text(value.poolId) &&
      text(value.version) &&
      value.protocolVersion === '1',
    'Unsupported pool metadata.',
  );
  assert(Array.isArray(value.pairs) && value.pairs.length > 0, 'Pool must contain pairs.');
  const ids = new Set<string>(),
    candidates = new Set<string>();
  for (const p of value.pairs) {
    assert(
      object(p) && text(p.pairId) && text(p.promptId) && text(p.promptText) && text(p.language),
      'Invalid pair or missing prompt.',
    );
    assert(!ids.has(p.pairId), 'Duplicate pair ID.');
    ids.add(p.pairId);
    assert(
      Array.isArray(p.candidates) && p.candidates.length === 2,
      'Each pair needs two candidates.',
    );
    for (const c of p.candidates) {
      assert(object(c) && text(c.candidateId) && typeof c.code === 'string', 'Invalid candidate.');
      assert(!candidates.has(c.candidateId), 'Duplicate candidate ID.');
      candidates.add(c.candidateId);
    }
  }
}
export async function hashPool(pool: Pool): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(pool));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function createSession(
  pool: Pool,
  poolHash: string,
  evaluatorId: string,
  seed: number,
  sessionId: string = crypto.randomUUID(),
): Session {
  validatePool(pool);
  assert(
    text(evaluatorId) && evaluatorId.length <= 80,
    'Enter an evaluator ID (up to 80 characters).',
  );
  const random = rng(seed),
    pairs = shuffle(pool.pairs, random);
  const flipped = shuffle(
    pairs.map((_, i) => i % 2 === 0),
    random,
  );
  const assignments = pairs.map((pair, i) => ({
    pairId: pair.pairId,
    aCandidateId: pair.candidates[flipped[i] ? 1 : 0].candidateId,
    bCandidateId: pair.candidates[flipped[i] ? 0 : 1].candidateId,
  }));
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    appVersion: '1.0.0',
    mode: 'study',
    sessionId,
    evaluatorId: evaluatorId.trim(),
    poolId: pool.poolId,
    poolVersion: pool.version,
    poolHash,
    protocolVersion: pool.protocolVersion,
    seed,
    randomizationVersion: 'mulberry32-fisher-yates-v1',
    createdAt: now,
    updatedAt: now,
    revision: 0,
    assignments,
    responses: {},
  };
}
export function validateVote(vote: unknown): void {
  assert(
    object(vote) && ['A', 'B', 'tie', 'both_poor'].includes(vote.choice),
    'Choose a preference.',
  );
  assert(
    Array.isArray(vote.reasons) &&
      new Set(vote.reasons).size === vote.reasons.length &&
      vote.reasons.every((r: unknown) => REASONS.includes(r as any)),
    'Invalid taxonomy reasons.',
  );
  assert(
    typeof vote.otherText === 'string' &&
      vote.otherText.length <= 500 &&
      (vote.reasons.includes('Other') || vote.otherText === ''),
    'Invalid other reason.',
  );
}
export function validateSession(
  value: unknown,
  pool: Pool,
  poolHash: string,
): asserts value is Session {
  assert(
    object(value) &&
      value.schemaVersion === 1 &&
      value.mode === 'study' &&
      value.appVersion === '1.0.0',
    'Unsupported saved session. Export a backup before making changes.',
  );
  assert(
    value.poolId === pool.poolId &&
      value.poolVersion === pool.version &&
      value.poolHash === poolHash &&
      value.protocolVersion === pool.protocolVersion,
    'Saved study requires a different frozen pool. Progress is preserved; restore its original pool before continuing.',
  );
  assert(
    text(value.sessionId) &&
      text(value.evaluatorId) &&
      value.evaluatorId.length <= 80 &&
      date(value.createdAt) &&
      date(value.updatedAt),
    'Invalid session identity or timestamps.',
  );
  assert(
    Number.isInteger(value.seed) &&
      value.seed >= 0 &&
      value.seed <= 4294967295 &&
      Number.isInteger(value.revision) &&
      value.revision >= 0 &&
      value.randomizationVersion === 'mulberry32-fisher-yates-v1',
    'Invalid session version or seed.',
  );
  assert(
    value.priorPlayExposure === undefined || typeof value.priorPlayExposure === 'boolean',
    'Invalid prior exposure flag.',
  );
  assert(
    Array.isArray(value.assignments) &&
      value.assignments.length === pool.pairs.length &&
      object(value.responses),
    'Invalid saved schedule.',
  );
  const assignments = new Map<string, Assignment>();
  for (const a of value.assignments) {
    assert(object(a), 'Invalid assignment.');
    const pair = pool.pairs.find((p) => p.pairId === a.pairId);
    assert(pair && !assignments.has(a.pairId), 'Duplicate or unknown scheduled pair.');
    assert(
      a.aCandidateId !== a.bCandidateId &&
        pair.candidates.some((c) => c.candidateId === a.aCandidateId) &&
        pair.candidates.some((c) => c.candidateId === a.bCandidateId),
      'Invalid A/B mapping.',
    );
    assignments.set(a.pairId, a as Assignment);
  }
  for (const [pairId, response] of Object.entries(value.responses)) {
    assert(object(response), 'Invalid saved response.');
    validateVote(response);
    const assignment = assignments.get(pairId),
      pair = pool.pairs.find((p) => p.pairId === pairId);
    assert(
      assignment &&
        response.pairId === pairId &&
        response.aCandidateId === assignment.aCandidateId &&
        response.bCandidateId === assignment.bCandidateId &&
        response.promptId === pair?.promptId,
      'Response does not match its saved assignment.',
    );
    assert(
      response.sessionId === value.sessionId &&
        response.evaluatorId === value.evaluatorId &&
        response.responseId === `${value.sessionId}:${pairId}` &&
        date(response.submittedAt),
      'Invalid response identity.',
    );
  }
  if (value.draft !== undefined) {
    validateVote(value.draft);
    assert(
      value.draft.pairId === nextAssignment(value as Session)?.pairId,
      'Draft does not match the next unanswered item.',
    );
  }
}
export function nextAssignment(session: Session): Assignment | undefined {
  return session.assignments.find((a) => !Object.hasOwn(session.responses, a.pairId));
}
export function submitVote(
  session: Session,
  pool: Pool,
  assignment: Assignment,
  vote: Vote,
): Session {
  validateVote(vote);
  const current = nextAssignment(session);
  assert(
    current &&
      current.pairId === assignment.pairId &&
      current.aCandidateId === assignment.aCandidateId &&
      current.bCandidateId === assignment.bCandidateId,
    'This item is already completed or is not the next assignment.',
  );
  const pair = pool.pairs.find((p) => p.pairId === assignment.pairId);
  assert(pair, 'Missing pair.');
  const now = new Date().toISOString();
  const { draft: _draft, ...saved } = session;
  return {
    ...saved,
    revision: session.revision + 1,
    updatedAt: now,
    responses: {
      ...session.responses,
      [assignment.pairId]: {
        ...assignment,
        ...vote,
        reasons: [...vote.reasons],
        responseId: `${session.sessionId}:${assignment.pairId}`,
        sessionId: session.sessionId,
        evaluatorId: session.evaluatorId,
        promptId: pair.promptId,
        submittedAt: now,
      },
    },
  };
}
