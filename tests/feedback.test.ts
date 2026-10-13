import { describe, expect, it } from 'vitest';
import { explainProblem } from '../src/feedback';
describe('recovery guidance', () => {
  it('explains stale writes without suggesting an overwrite', () =>
    expect(explainProblem('Progress changed in another tab').message).toContain(
      'will not overwrite',
    ));
  it('pins incompatible studies to the original examples', () =>
    expect(explainProblem('Saved study requires a different frozen pool').title).toBe(
      'This study needs its original examples',
    ));
  it('keeps conflicting imports separate', () =>
    expect(explainProblem('Could not restore backup: different progress').message).toContain(
      'nothing was replaced',
    ));
  it('does not promise an unsaved choice is in a backup', () =>
    expect(explainProblem('QuotaExceededError').message).toContain('unsaved choice'));
  it('explains reveal retry without double-counting', () =>
    expect(explainProblem('Reveal unavailable: failed fetch').message).toContain('only once'));
});
