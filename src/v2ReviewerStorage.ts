import { assert } from './v2';
import { REVIEWER_KEY } from './v2Transfer';
import type { ReviewerSession } from './v2Transfer';

// Keep each previous reviewer file and its cumulative history when opening different work.
const PREFIX = REVIEWER_KEY + '.saved.';
export function savedReviews(): ReviewerSession[] {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(PREFIX))
    .map((key) => JSON.parse(localStorage.getItem(key)!) as ReviewerSession);
}
export function keepReview(session: ReviewerSession) {
  const raw = JSON.stringify({ ...session, paused: true });
  const key = PREFIX + session.package.studyId + '.' + session.package.reviewer;
  localStorage.setItem(key, raw);
  assert(localStorage.getItem(key) === raw, 'Previous review could not be saved.');
}
