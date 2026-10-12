import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createSession,
  hashPool,
  nextAssignment,
  submitVote,
  validatePool,
  validateSession,
} from '../src/session';
import { decodeStore, persist, STORAGE_KEY } from '../src/storage';
import { CSV_FIELDS, toCSV, toJSON } from '../src/export';
import type { Pool, Vote } from '../src/types';

const pool: Pool = JSON.parse(
  readFileSync(new URL('../public/pools/evaluation-01-v1.json', import.meta.url), 'utf8'),
);
const hash = createHash('sha256').update(JSON.stringify(pool)).digest('hex');
const session = () => createSession(pool, hash, 'participant-01', 12345, 'test-session');
const vote: Vote = {
  choice: 'tie',
  reasons: ['Readability', 'Other'],
  otherText: 'A comma, a quote " and\na new line',
};
function memoryStorage(initial: string | null = null) {
  let raw = initial;
  return {
    getItem: (_key: string) => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
}
function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && !quoted && csv[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  return rows;
}
describe('frozen instrument', () => {
  it('validates the real pool and common Python/browser content hash', async () => {
    validatePool(pool);
    expect(pool.pairs).toHaveLength(30);
    expect(await hashPool(pool)).toBe(hash);
    const provenance = JSON.parse(
      readFileSync(new URL('../researcher/provenance-v1.json', import.meta.url), 'utf8'),
    );
    expect(hash).toBe(provenance.poolHash);
  });
  it('rejects duplicate IDs, missing candidates and unsupported protocol', () => {
    for (const change of [
      (p: Pool) => p.pairs.push(p.pairs[0]),
      (p: Pool) => p.pairs[0].candidates.pop(),
      (p: Pool) => (p.protocolVersion = '2'),
    ]) {
      const copy = structuredClone(pool);
      change(copy);
      expect(() => validatePool(copy)).toThrow();
    }
  });
  it('saves a deterministic permutation and balanced valid A/B mappings', () => {
    const a = session(),
      b = session();
    expect(a.assignments).toEqual(b.assignments);
    expect(new Set(a.assignments.map((x) => x.pairId)).size).toBe(30);
    expect(
      a.assignments.filter(
        (x) =>
          x.aCandidateId ===
          pool.pairs.find((p) => p.pairId === x.pairId)!.candidates[0].candidateId,
      ),
    ).toHaveLength(15);
    validateSession(a, pool, hash);
  });
  it('does not expose condition labels or research diagnostics in public pool', () => {
    expect(JSON.stringify(pool)).not.toMatch(
      /"(?:condition|run|sourceFile|rawCompletion|styleScore|testStatus)"/,
    );
    const labels = JSON.parse(
      readFileSync(new URL('../public/play/evaluation-01-v1.json', import.meta.url), 'utf8'),
    );
    for (const p of pool.pairs)
      expect(p.candidates.map((c) => labels.labels[c.candidateId]).sort()).toEqual([
        'Base',
        'Style-trained',
      ]);
  });
});
describe('research session integrity', () => {
  it('resumes the first unanswered assignment after persistence and decoding', () => {
    let s = session();
    const schedule = structuredClone(s.assignments);
    const first = nextAssignment(s)!;
    s = submitVote(s, pool, first, vote);
    const storage = memoryStorage();
    const raw = persist(
      { schemaVersion: 1, activeSessionId: s.sessionId, sessions: [s] },
      null,
      storage,
    );
    const restored = decodeStore(raw).sessions[0];
    validateSession(restored, pool, hash);
    expect(restored.assignments).toEqual(schedule);
    expect(nextAssignment(restored)).toEqual(schedule[1]);
    expect(restored.responses[first.pairId].choice).toBe('tie');
  });
  it('prevents duplicate, stale and non-current submissions', () => {
    let s = session();
    const first = nextAssignment(s)!;
    s = submitVote(s, pool, first, vote);
    expect(() => submitVote(s, pool, first, vote)).toThrow();
    expect(() => submitVote(s, pool, s.assignments[2], vote)).toThrow();
  });
  it('completes every pair once and distinguishes tie from both poor', () => {
    let s = session();
    for (let i = 0; i < 30; i++)
      s = submitVote(s, pool, nextAssignment(s)!, { ...vote, choice: i % 2 ? 'both_poor' : 'tie' });
    expect(nextAssignment(s)).toBeUndefined();
    expect(Object.keys(s.responses)).toHaveLength(30);
    validateSession(s, pool, hash);
    const decoded = JSON.parse(toJSON(s));
    expect(decoded.status).toBe('complete');
    expect(Object.values(s.responses).filter((r) => r.choice === 'both_poor')).toHaveLength(15);
  });
  it('fails closed on changed pool, bad mapping, corrupted response or duplicate assignment', () => {
    const changed = structuredClone(pool);
    changed.pairs[0].candidates[0].code += '\n# changed';
    expect(() => validateSession(session(), changed, 'new-hash')).toThrow();
    for (const change of [
      (s: any) => (s.poolVersion = '2'),
      (s: any) => (s.assignments[0].aCandidateId = s.assignments[0].bCandidateId),
      (s: any) => (s.assignments[1] = s.assignments[0]),
      (s: any) => Object.values(s.responses).forEach((r: any) => (r.choice = 'invalid')),
    ]) {
      let s = submitVote(session(), pool, nextAssignment(session())!, vote);
      change(s);
      expect(() => validateSession(s, pool, hash)).toThrow();
    }
  });
  it('keeps saved draft separate from committed progress', () => {
    const s = session();
    s.draft = { ...vote, pairId: nextAssignment(s)!.pairId };
    validateSession(s, pool, hash);
    expect(Object.keys(s.responses)).toHaveLength(0);
    const after = submitVote(s, pool, nextAssignment(s)!, vote);
    expect(after.draft).toBeUndefined();
  });
  it('does not mutate the previous session on submit', () => {
    const s = session();
    submitVote(s, pool, nextAssignment(s)!, vote);
    expect(Object.keys(s.responses)).toHaveLength(0);
  });
});
describe('persistence failures and exports', () => {
  it('reports failed writes and rejects stale tabs without overwriting', () => {
    const store = { schemaVersion: 1 as const, activeSessionId: null, sessions: [] };
    expect(() =>
      persist(store, null, {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
      }),
    ).toThrow('quota');
    const storage = memoryStorage('different');
    expect(() => persist(store, null, storage)).toThrow('another tab');
    expect(storage.getItem(STORAGE_KEY)).toBe('different');
  });
  it('rejects corrupt storage without replacing it', () => {
    expect(() => decodeStore('{bad')).toThrow();
    expect(() => decodeStore('{"schemaVersion":2}')).toThrow();
  });
  it('JSON is traceable and CSV decodes to the same records including taxonomy', () => {
    let s = session();
    s = submitVote(s, pool, nextAssignment(s)!, vote);
    s = submitVote(s, pool, nextAssignment(s)!, {
      choice: 'both_poor',
      reasons: ['Robustness'],
      otherText: '',
    });
    const json = JSON.parse(toJSON(s));
    expect(json.status).toBe('partial');
    const csv = parseCSV(toCSV(s));
    expect(csv[0]).toEqual(CSV_FIELDS);
    expect(csv).toHaveLength(3);
    for (const cells of csv.slice(1)) {
      const row = Object.fromEntries(CSV_FIELDS.map((f, i) => [f, cells[i]]));
      const response = json.session.responses[row.pairId];
      expect(row.choice).toBe(response.choice);
      expect(JSON.parse(row.reasons)).toEqual(response.reasons);
      expect(row.otherText).toBe(response.otherText);
      expect(row.aCandidateId).toBe(response.aCandidateId);
      expect(row.bCandidateId).toBe(response.bCandidateId);
      expect(row.sessionId).toBe(s.sessionId);
    }
  });
  it('neutralizes spreadsheet formulas without changing authoritative JSON', () => {
    const s = session();
    s.evaluatorId = '=HYPERLINK("danger")';
    const voted = submitVote(s, pool, nextAssignment(s)!, { ...vote, otherText: '  @SUM(1)' });
    expect(toJSON(voted)).toContain('  @SUM(1)');
    const rows = parseCSV(toCSV(voted));
    expect(rows[1][2].startsWith("'")).toBe(true);
    expect(rows[1][13].startsWith("'")).toBe(true);
  });
});
