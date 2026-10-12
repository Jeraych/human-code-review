import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { poolConfigs } from '../src/poolConfig';
import { countChoice, emptyPlayCounts, sampleRound, type LoadedPool } from '../src/play';
import {
  createSession,
  nextAssignment,
  rng,
  submitVote,
  validatePool,
  validateSession,
} from '../src/session';
import { toCSV, toJSON } from '../src/export';
import type { Pool } from '../src/types';
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const style: Pool = read('public/pools/evaluation-01-v1.json'),
  judge: Pool = read('public/pools/evaluation-02-v1.json');
const sp = read('researcher/provenance-v1.json'),
  jp = read('researcher/judge-provenance-v1.json');
const hash = (pool: Pool) => createHash('sha256').update(JSON.stringify(pool)).digest('hex');
const pools: LoadedPool[] = [
  { pool: style, hash: hash(style), config: poolConfigs[0] },
  { pool: judge, hash: hash(judge), config: poolConfigs[1] },
];
describe('formal Judge matched pool', () => {
  it('validates real pool and provenance hash', () => {
    validatePool(judge);
    expect(judge.pairs).toHaveLength(30);
    expect(hash(judge)).toBe(jp.poolHash);
    expect(jp.matchedStylePoolHash).toBe(hash(style));
    expect(hash(style)).toBe('3bd17a5a0a0810b3e7c9ef3ad48ffe8775ceb5ebfea4b534e6e4afe4451c1d70');
  });
  it('reuses all 30 prompt texts and seed assignments with identical Base candidates', () => {
    for (const pair of judge.pairs) {
      const original = style.pairs.find((p) => p.promptId === pair.promptId)!;
      expect(original.promptText).toBe(pair.promptText);
      const base = pair.candidates.find((c) => jp.candidates[c.candidateId].condition === 'base')!;
      expect(original.candidates).toContainEqual(base);
      const alternative = pair.candidates.find((c) => c !== base)!;
      const meta = jp.candidates[alternative.candidateId];
      expect(meta.generationIndex).toBe(0);
      expect(meta.sourceConfig.seed).toBe(sp.candidates[base.candidateId].sourceConfig.seed);
      expect(meta.run).toBe(sp.candidates[base.candidateId].run + 3);
    }
  });
  it('preserves code hashes and one Base/one Judge identity per pair', () => {
    const reveal = read('public/play/evaluation-02-v1.json');
    for (const pair of judge.pairs) {
      expect(pair.candidates.map((c) => reveal.labels[c.candidateId]).sort()).toEqual([
        'Base',
        'Judge-trained',
      ]);
      for (const candidate of pair.candidates)
        expect(createHash('sha256').update(candidate.code).digest('hex')).toBe(
          jp.candidates[candidate.candidateId].displayedSha256,
        );
    }
  });
  it('cannot resume Style as Judge, even with the same evaluator and seed', () => {
    const s = createSession(style, hash(style), 'same-evaluator', 5, 'style-session');
    const j = createSession(judge, hash(judge), 'same-evaluator', 5, 'judge-session');
    expect(() => validateSession(s, judge, hash(judge))).toThrow('different frozen pool');
    expect(() => validateSession(j, style, hash(style))).toThrow('different frozen pool');
    expect(new Set([...s.assignments, ...j.assignments].map((a) => a.pairId)).size).toBe(60);
  });
  it('round-trips Judge response and keeps pool and A/B traceability in exports', () => {
    let j = createSession(judge, hash(judge), 'judge-test', 5, 'judge-session');
    const schedule = structuredClone(j.assignments);
    j = submitVote(j, judge, nextAssignment(j)!, {
      choice: 'B',
      reasons: ['Maintainability'],
      otherText: '',
    });
    const restored = JSON.parse(toJSON(j)).session;
    validateSession(restored, judge, hash(judge));
    expect(restored.assignments).toEqual(schedule);
    expect(nextAssignment(restored)).toEqual(schedule[1]);
    expect(toCSV(j)).toContain('evaluation-02');
    expect(toCSV(j)).toContain(nextAssignment({ ...j, responses: {} })!.bCandidateId);
  });
  it('accepts unchanged legacy V1 Style sessions', () => {
    const legacy = createSession(style, hash(style), 'legacy', 2, 'legacy-session');
    legacy.appVersion = '1.0.0';
    validateSession(legacy, style, hash(style));
  });
});
describe('Play selection and preference interpretation', () => {
  it('samples each selected real pool and keeps valid A/B mapping', () => {
    for (const selected of pools) {
      const round = sampleRound(pools, selected.pool.poolId, rng(1), 'round');
      expect(round.poolId).toBe(selected.pool.poolId);
      expect(round.pair.candidates.map((c) => c.candidateId)).toEqual(
        expect.arrayContaining([round.assignment.aCandidateId, round.assignment.bCandidateId]),
      );
    }
  });
  it('Random selects comparisons uniformly even with unequal pool sizes', () => {
    const unequal = [pools[0], { ...pools[1], pool: { ...judge, pairs: judge.pairs.slice(0, 1) } }];
    const random = rng(123),
      counts = { 'evaluation-01': 0, 'evaluation-02': 0 };
    for (let i = 0; i < 1000; i++) {
      const round = sampleRound(unequal, 'random', random, String(i));
      counts[round.poolId as keyof typeof counts]++;
    }
    expect(counts['evaluation-01']).toBeGreaterThan(440);
    expect(counts['evaluation-01']).toBeLessThan(560);
  });
  it('keeps Base/trained/tie/poor interpretable across orientations', () => {
    const assignment = { pairId: 'p', aCandidateId: 'x', bCandidateId: 'y' },
      labels = { x: 'Judge-trained', y: 'Base' };
    let counts = emptyPlayCounts();
    for (const choice of ['A', 'B', 'tie', 'both_poor'] as const)
      counts = countChoice(counts, choice, assignment, labels, 'Base');
    expect(counts).toEqual({ reference: 1, trained: 1, tie: 1, both_poor: 1 });
  });
  it('rejects unavailable selections', () => {
    expect(() => sampleRound(pools, 'combined', rng(1), 'round')).toThrow('unavailable');
  });
});
