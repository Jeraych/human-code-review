import type { Session } from './types';
export function exportResult(session: Session) {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    status:
      Object.keys(session.responses).length === session.assignments.length ? 'complete' : 'partial',
    session,
  };
}
export function toJSON(session: Session): string {
  return JSON.stringify(exportResult(session), null, 2);
}
export const CSV_FIELDS = [
  'schemaVersion',
  'sessionId',
  'evaluatorId',
  'poolId',
  'poolVersion',
  'poolHash',
  'protocolVersion',
  'pairId',
  'promptId',
  'aCandidateId',
  'bCandidateId',
  'choice',
  'reasons',
  'otherText',
  'submittedAt',
];
function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function toCSV(session: Session): string {
  const rows = session.assignments.flatMap((a) => {
    const r = session.responses[a.pairId];
    if (!r) return [];
    const row: Record<string, unknown> = {
      ...session,
      ...r,
      poolVersion: session.poolVersion,
      reasons: JSON.stringify(r.reasons),
    };
    return [CSV_FIELDS.map((field) => csvCell(row[field])).join(',')];
  });
  return [CSV_FIELDS.map(csvCell).join(','), ...rows].join('\r\n') + '\r\n';
}
export function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
