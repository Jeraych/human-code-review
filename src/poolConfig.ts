// Add only verified real pools. Retain old assets for sessions pinned to older versions.
export interface PoolConfig {
  poolId: string;
  researcherLabel: string;
  poolUrl: string;
  playRevealUrl: string;
  referenceLabel: string;
}
export const poolConfigs: PoolConfig[] = [
  {
    poolId: 'evaluation-01',
    researcherLabel: 'Style',
    poolUrl: '/pools/evaluation-01-v1.json',
    playRevealUrl: '/play/evaluation-01-v1.json',
    referenceLabel: 'Base',
  },
  {
    poolId: 'evaluation-02',
    researcherLabel: 'Judge',
    poolUrl: '/pools/evaluation-02-v1.json',
    playRevealUrl: '/play/evaluation-02-v1.json',
    referenceLabel: 'Base',
  },
];
