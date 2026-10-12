import { useState } from 'react';
import { REASONS, type Choice, type Vote } from '../types';
const choices: [Choice, string, string][] = [
  ['A', 'Prefer A', 'Implementation A'],
  ['B', 'Prefer B', 'Implementation B'],
  ['tie', 'About equal', 'No clear preference'],
  ['both_poor', 'Both poor', 'Neither is suitable'],
];
export default function VoteForm({
  initial,
  onDraft,
  onSubmit,
  play = false,
}: {
  initial?: Vote;
  onDraft?: (vote: Vote) => void;
  onSubmit: (vote: Vote) => void;
  play?: boolean;
}) {
  const [choice, setChoice] = useState<Choice | null>(initial?.choice ?? null);
  const [reasons, setReasons] = useState(initial?.reasons ?? []);
  const [otherText, setOtherText] = useState(initial?.otherText ?? '');
  function update(c: Choice | null, r = reasons, other = otherText) {
    setChoice(c);
    setReasons(r);
    setOtherText(other);
    if (c) onDraft?.({ choice: c, reasons: r, otherText: r.includes('Other') ? other : '' });
  }
  return (
    <form
      className="vote-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (choice)
          onSubmit({ choice, reasons, otherText: reasons.includes('Other') ? otherText : '' });
      }}
    >
      <fieldset>
        <legend>Which implementation would you rather work with?</legend>
        <p className="hint">
          Consider code you might use, maintain, or receive from another developer.
        </p>
        <div className="choice-grid">
          {choices.map(([value, title, detail]) => (
            <label className={`choice ${choice === value ? 'selected' : ''}`} key={value}>
              <input
                type="radio"
                name="preference"
                value={value}
                checked={choice === value}
                onChange={() => update(value)}
              />
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="taxonomy">
        <legend>
          What influenced your decision? <span>Optional</span>
        </legend>
        <div className="reason-list">
          {REASONS.map((reason) => (
            <label key={reason}>
              <input
                type="checkbox"
                checked={reasons.includes(reason)}
                onChange={() =>
                  update(
                    choice,
                    reasons.includes(reason)
                      ? reasons.filter((r) => r !== reason)
                      : [...reasons, reason],
                    reason === 'Other' && reasons.includes(reason) ? '' : otherText,
                  )
                }
              />
              {reason}
            </label>
          ))}
        </div>
        {reasons.includes('Other') && (
          <label className="other-label">
            Other reason
            <textarea
              maxLength={500}
              value={otherText}
              onChange={(e) => update(choice, reasons, e.target.value)}
              placeholder="A brief note, if useful"
            />
          </label>
        )}
      </fieldset>
      <div className="submit-row">
        <span className="hint">
          {play
            ? 'Identities appear after your vote.'
            : 'Your response is saved before the next item.'}
        </span>
        <button className="primary" type="submit" disabled={!choice}>
          {play ? 'Vote & reveal' : 'Submit & next'} <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
