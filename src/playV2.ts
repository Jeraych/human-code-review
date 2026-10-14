import { CONTRASTS } from './v2.ts';
import type { DatabaseV2, PairV2, Presentation } from './v2.ts';

// Only differences invisible in the code viewer: line endings, trailing space,
// and empty lines at the edges. Keep indentation, comments, names and structure.
export const visibleCode = (code: string) =>
  code
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
export const comparisonKey = (p: PairV2, db: DatabaseV2) =>
  JSON.stringify([
    p.taskId,
    ...[visibleCode(db.outputs[p.left].code), visibleCode(db.outputs[p.right].code)].sort(),
  ]);

export function curatePlay(db: DatabaseV2) {
  const seen = new Set<string>();
  return db.pairs.filter((p) => {
    if (!p.eligible) return false;
    const a = visibleCode(db.outputs[p.left].code),
      b = visibleCode(db.outputs[p.right].code);
    if (!a || !b || a === b) return false;
    // Retain each contrast's meaning; collapse repeated examples within it.
    const key = p.contrast + comparisonKey(p, db);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export interface PlayHistory {
  catalogHash: string;
  seen: string[];
  recent: string[];
  contrasts: Record<string, number>;
  round: number;
}
export const newPlayHistory = (db: DatabaseV2, recent: string[] = []): PlayHistory => ({
  catalogHash: db.catalogHash,
  seen: [],
  recent: recent.slice(-12),
  contrasts: {},
  round: 0,
});

// Pure selection: hard pair exclusion, then prefer unseen tasks AND code within
// 12 rounds, relaxing oldest rounds first only when the available pool requires it.
export function selectPlay(
  db: DatabaseV2,
  pool: PairV2[],
  history: PlayHistory,
  filter: string,
  random: number,
): PairV2 | undefined {
  let available = pool.filter(
    (p) =>
      !history.seen.includes(p.pairId) && (filter === 'All contrasts' || p.contrast === filter),
  );
  if (!available.length) return;
  for (let window = Math.min(12, history.recent.length); window >= 0; window--) {
    const recent = (window ? history.recent.slice(-window) : [])
      .map((id) => db.pairs.find((p) => p.pairId === id))
      .filter((p): p is PairV2 => !!p);
    const tasks = new Set(recent.map((p) => p.taskId));
    const codes = new Set(
      recent.flatMap((p) => [p.left, p.right].map((id) => visibleCode(db.outputs[id].code))),
    );
    const fresh = available.filter(
      (p) =>
        !tasks.has(p.taskId) &&
        ![p.left, p.right].some((id) => codes.has(visibleCode(db.outputs[id].code))),
    );
    if (fresh.length) {
      available = fresh;
      break;
    }
  }
  if (filter === 'All contrasts') {
    const counts = CONTRASTS.filter((c) => available.some((p) => p.contrast === c)).map(
      (c) => history.contrasts[c] || 0,
    );
    const min = Math.min(...counts);
    available = available.filter((p) => (history.contrasts[p.contrast] || 0) === min);
  }
  return available[Math.min(available.length - 1, Math.floor(random * available.length))];
}
export function rememberPlay(history: PlayHistory, pair: PairV2): PlayHistory {
  return {
    ...history,
    seen: [...history.seen, pair.pairId],
    recent: [...history.recent, pair.pairId].slice(-12),
    contrasts: {
      ...history.contrasts,
      [pair.contrast]: (history.contrasts[pair.contrast] || 0) + 1,
    },
    round: history.round + 1,
  };
}

export interface Distribution {
  total: number;
  preferences: Record<string, number>;
}
export interface CommunityStats {
  catalogHash: string;
  playPoolVersion: string;
  total: number;
  pair: Distribution;
  contrasts: Record<string, Distribution>;
}
export function aggregatePlay(rows: unknown[], db: DatabaseV2, pairId: string): CommunityStats {
  const distribution = (): Distribution => ({ total: 0, preferences: { Equal: 0 } });
  const result: CommunityStats = {
    catalogHash: db.catalogHash,
    playPoolVersion: db.playPoolVersion,
    total: 0,
    pair: distribution(),
    contrasts: Object.fromEntries(CONTRASTS.map((c) => [c, distribution()])),
  };
  const pairs = new Map(db.pairs.map((p) => [p.pairId, p]));
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>,
      p = pairs.get(String(r.pairId));
    // Legacy V2 rows predate catalogHash: accept only the frozen matching versions
    // and verified canonical mappings. Never reinterpret votes from another pool.
    if (
      !p ||
      r.phase !== 'Play' ||
      r.playPoolVersion !== db.playPoolVersion ||
      r.protocolVersion !== db.protocolVersion ||
      (r.catalogHash !== undefined && r.catalogHash !== db.catalogHash) ||
      typeof r.responseId !== 'string' ||
      ids.has(r.responseId) ||
      !['A', 'Equal', 'B'].includes(String(r.choice)) ||
      ![p.left, p.right].includes(String(r.a)) ||
      ![p.left, p.right].includes(String(r.b)) ||
      r.a === r.b ||
      !result.contrasts[p.contrast]
    )
      continue;
    const preferred =
      r.choice === 'Equal' ? 'Equal' : db.outputs[String(r.choice === 'A' ? r.a : r.b)].condition;
    if (r.canonicalPreference !== preferred) continue;
    ids.add(r.responseId);
    result.total++;
    for (const d of [result.contrasts[p.contrast], ...(p.pairId === pairId ? [result.pair] : [])]) {
      d.total++;
      d.preferences[preferred] = (d.preferences[preferred] || 0) + 1;
    }
  }
  return result;
}
