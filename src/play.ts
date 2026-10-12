import type { Assignment, Choice, Pair, Pool } from './types';
import type { PoolConfig } from './poolConfig';
export interface LoadedPool {
  config: PoolConfig;
  pool: Pool;
  hash: string;
}
export interface PlayRound {
  roundId: string;
  poolId: string;
  pair: Pair;
  assignment: Assignment;
  choice?: Choice;
  labels?: Record<string, string>;
}
export interface PlayCounts {
  reference: number;
  trained: number;
  tie: number;
  both_poor: number;
}
export const emptyPlayCounts = (): PlayCounts => ({
  reference: 0,
  trained: 0,
  tie: 0,
  both_poor: 0,
});
export function sampleRound(
  pools: LoadedPool[],
  filter: string,
  random: () => number,
  roundId: string,
): PlayRound {
  const available = filter === 'random' ? pools : pools.filter((p) => p.pool.poolId === filter);
  if (!available.length) throw new Error('The selected Play pool is unavailable.');
  // Choose the comparison uniformly first, independent of its number of pairs.
  const selected = available[Math.floor(random() * available.length)];
  const pair = selected.pool.pairs[Math.floor(random() * selected.pool.pairs.length)];
  const flip = random() < 0.5;
  return {
    roundId,
    poolId: selected.pool.poolId,
    pair,
    assignment: {
      pairId: pair.pairId,
      aCandidateId: pair.candidates[flip ? 1 : 0].candidateId,
      bCandidateId: pair.candidates[flip ? 0 : 1].candidateId,
    },
  };
}
export function countChoice(
  counts: PlayCounts,
  choice: Choice,
  assignment: Assignment,
  labels: Record<string, string>,
  referenceLabel: string,
): PlayCounts {
  const outcome =
    choice === 'tie' || choice === 'both_poor'
      ? choice
      : labels[choice === 'A' ? assignment.aCandidateId : assignment.bCandidateId] ===
          referenceLabel
        ? 'reference'
        : 'trained';
  return { ...counts, [outcome]: counts[outcome] + 1 };
}
