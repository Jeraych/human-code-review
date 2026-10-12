import type { Store } from './types';
export const STORAGE_KEY = 'human-code-evaluation.v1';
export const emptyStore = (): Store => ({ schemaVersion: 1, activeSessionId: null, sessions: [] });
export function decodeStore(raw: string | null): Store {
  if (raw === null) return emptyStore();
  const value = JSON.parse(raw);
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.sessions) ||
    !value.sessions.every(
      (s: any) =>
        s &&
        typeof s.sessionId === 'string' &&
        typeof s.evaluatorId === 'string' &&
        typeof s.createdAt === 'string' &&
        Array.isArray(s.assignments) &&
        s.assignments.every((a: any) => a && typeof a.pairId === 'string') &&
        s.responses &&
        typeof s.responses === 'object' &&
        !Array.isArray(s.responses),
    ) ||
    new Set(value.sessions.map((s: any) => s.sessionId)).size !== value.sessions.length ||
    (value.activeSessionId !== null &&
      !value.sessions.some((s: any) => s.sessionId === value.activeSessionId))
  )
    throw new Error(
      'Saved storage is incompatible. Download a recovery backup; nothing has been overwritten.',
    );
  return value;
}
export function persist(
  store: Store,
  expectedRaw: string | null,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): string {
  if (storage.getItem(STORAGE_KEY) !== expectedRaw)
    throw new Error('Progress changed in another tab. Reload this page before continuing.');
  const raw = JSON.stringify(store);
  storage.setItem(STORAGE_KEY, raw);
  if (storage.getItem(STORAGE_KEY) !== raw)
    throw new Error('Could not verify the saved response. Reload and check progress.');
  return raw;
}
