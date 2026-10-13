import { useEffect, useRef } from 'react';
import type { PlayRound } from '../play';
export default function PlayReveal({
  round,
  comparison,
  onNext,
}: {
  round: PlayRound;
  comparison: string;
  onNext: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [round.roundId]);
  if (!round.labels || !round.choice) return null;
  return (
    <section className="reveal play-reveal" aria-labelledby="reveal-title">
      <div className="reveal-outcome">
        <span className="section-label">THE REVEAL</span>
        <h2 id="reveal-title" ref={heading} tabIndex={-1}>
          {round.choice === 'tie'
            ? 'You found them about equal.'
            : round.choice === 'both_poor'
              ? 'Neither implementation suited you.'
              : `You chose ${round.choice}.`}
        </h2>
        <small>{comparison} comparison · Your preference</small>
      </div>
      <div className="reveal-identities">
        {(['A', 'B'] as const).map((side) => (
          <div key={side} className={round.choice === side ? 'picked' : ''}>
            <strong>{side}</strong>
            <span>
              {
                round.labels![
                  side === 'A' ? round.assignment.aCandidateId : round.assignment.bCandidateId
                ]
              }
              {round.choice === side && <small> Your choice ✓</small>}
            </span>
          </div>
        ))}
      </div>
      <button className="primary" onClick={onNext}>
        Next comparison <span aria-hidden="true">→</span>
        <kbd>N</kbd>
      </button>
    </section>
  );
}
