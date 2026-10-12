import { useEffect, useRef, useState } from 'react';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import python from 'shiki/langs/python.mjs';
import theme from 'shiki/themes/github-light.mjs';
import type { Assignment, Choice, Pair } from '../types';

const highlighter = createHighlighterCore({
  langs: [python],
  themes: [theme],
  engine: createOnigurumaEngine(import('shiki/wasm')),
});
function CodePanel({
  label,
  code,
  language,
  onVote,
  locked,
  selected,
  revealLabel,
}: {
  label: 'A' | 'B';
  code: string;
  language: string;
  onVote?: (choice: Choice) => void;
  locked?: boolean;
  selected?: boolean;
  revealLabel?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    started: number;
    moved: boolean;
    scrolled: boolean;
    selectionBefore: boolean;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    setHtml(null);
    scroll.current?.scrollTo(0, 0);
    highlighter
      .then((h) => {
        if (alive)
          setHtml(
            h.codeToHtml(code, {
              lang: language === 'python' ? 'python' : 'text',
              theme: 'github-light',
            }),
          );
      })
      .catch(() => {
        /* Both panels retain the same readable plain-code fallback. */
      });
    return () => {
      alive = false;
    };
  }, [code, language]);
  return (
    <section
      className={`code-panel ${onVote ? 'play-selectable' : ''} ${selected ? 'chosen' : ''} ${locked ? 'locked' : ''}`}
      role={onVote ? 'button' : undefined}
      tabIndex={onVote ? 0 : undefined}
      aria-label={onVote ? `Choose implementation ${label}` : `Code ${label}`}
      aria-disabled={onVote ? !!locked : undefined}
      aria-pressed={onVote ? !!selected : undefined}
      onPointerDownCapture={(e) => {
        gesture.current = {
          x: e.clientX,
          y: e.clientY,
          started: Date.now(),
          moved: false,
          scrolled: false,
          selectionBefore: !!window.getSelection()?.toString(),
        };
      }}
      onPointerMoveCapture={(e) => {
        if (
          gesture.current &&
          Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) > 8
        )
          gesture.current.moved = true;
      }}
      onScrollCapture={() => {
        if (gesture.current) gesture.current.scrolled = true;
      }}
      onPointerCancel={() => {
        gesture.current = null;
      }}
      onClick={(e) => {
        if (!onVote || locked) return;
        const g = gesture.current;
        gesture.current = null;
        if (
          e.detail === 0 ||
          (g &&
            !g.moved &&
            !g.scrolled &&
            !g.selectionBefore &&
            !window.getSelection()?.toString() &&
            Date.now() - g.started < 650)
        )
          onVote(label);
      }}
      onKeyDown={(e) => {
        if (
          onVote &&
          !locked &&
          e.target === e.currentTarget &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          e.preventDefault();
          onVote(label);
        }
      }}
    >
      <div className="code-heading">
        <strong>
          <span className="candidate-letter">{label}</span> Implementation {label}
        </strong>
        <span>{revealLabel ?? language}</span>
      </div>
      {onVote && (
        <div className="card-vote-hint">
          {selected ? 'Your choice' : locked ? 'Compare the reveal' : `Choose ${label}`}{' '}
          <span aria-hidden="true">{selected ? '✓' : '→'}</span>
        </div>
      )}
      <div className="code-scroll" tabIndex={0} ref={scroll} aria-label={`Scroll code ${label}`}>
        {code === '' ? (
          <pre className="empty-code">No code was extracted from this response.</pre>
        ) : html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre>
            <code>{code}</code>
          </pre>
        )}
      </div>
    </section>
  );
}
export default function Comparison({
  pair,
  assignment,
  onVote,
  locked,
  choice,
  labels,
}: {
  pair: Pair;
  assignment: Assignment;
  onVote?: (choice: Choice) => void;
  locked?: boolean;
  choice?: Choice;
  labels?: Record<string, string>;
}) {
  const a = pair.candidates.find((c) => c.candidateId === assignment.aCandidateId)!;
  const b = pair.candidates.find((c) => c.candidateId === assignment.bCandidateId)!;
  return (
    <>
      <section className="task">
        <div className="section-label">THE TASK</div>
        <pre>{pair.promptText}</pre>
      </section>
      <div className="comparison">
        <CodePanel
          label="A"
          code={a.code}
          language={pair.language}
          onVote={onVote}
          locked={locked}
          selected={choice === 'A'}
          revealLabel={labels?.[a.candidateId]}
        />
        <CodePanel
          label="B"
          code={b.code}
          language={pair.language}
          onVote={onVote}
          locked={locked}
          selected={choice === 'B'}
          revealLabel={labels?.[b.candidateId]}
        />
      </div>
    </>
  );
}
