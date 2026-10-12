export const REASONS = [
  'Readability',
  'Naming',
  'Structure',
  'Simplicity',
  'Maintainability',
  'Comments',
  'Robustness',
  'Other',
] as const;
export type Reason = (typeof REASONS)[number];
export type Choice = 'A' | 'B' | 'tie' | 'both_poor';
export interface Candidate {
  candidateId: string;
  code: string;
}
export interface Pair {
  pairId: string;
  promptId: string;
  promptText: string;
  language: string;
  candidates: [Candidate, Candidate];
}
export interface Pool {
  schemaVersion: 1;
  poolId: string;
  version: string;
  protocolVersion: string;
  pairs: Pair[];
}
export interface Assignment {
  pairId: string;
  aCandidateId: string;
  bCandidateId: string;
}
export interface Vote {
  choice: Choice;
  reasons: Reason[];
  otherText: string;
}
export interface Response extends Assignment, Vote {
  responseId: string;
  sessionId: string;
  evaluatorId: string;
  promptId: string;
  submittedAt: string;
}
export interface Session {
  schemaVersion: 1;
  appVersion: '1.0.0';
  mode: 'study';
  sessionId: string;
  evaluatorId: string;
  poolId: string;
  poolVersion: string;
  poolHash: string;
  protocolVersion: string;
  seed: number;
  randomizationVersion: 'mulberry32-fisher-yates-v1';
  createdAt: string;
  updatedAt: string;
  revision: number;
  assignments: Assignment[];
  responses: Record<string, Response>;
  priorPlayExposure?: boolean;
  draft?: Vote & { pairId: string };
}
export interface Store {
  schemaVersion: 1;
  activeSessionId: string | null;
  sessions: Session[];
}
