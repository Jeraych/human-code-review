import { useEffect, useRef, useState } from 'react';
import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import python from 'shiki/langs/python.mjs';
import theme from 'shiki/themes/github-light.mjs';
import type { Assignment, Pair } from '../types';

const highlighter = createHighlighterCore({
  langs: [python],
  themes: [theme],
  engine: createOnigurumaEngine(import('shiki/wasm')),
});
function CodePanel({ label, code, language }: { label: string; code: string; language: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
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
    <section className="code-panel" aria-label={`Code ${label}`}>
      <div className="code-heading">
        <strong>
          <span className="candidate-letter">{label}</span> Implementation {label}
        </strong>
        <span>{language}</span>
      </div>
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
export default function Comparison({ pair, assignment }: { pair: Pair; assignment: Assignment }) {
  const a = pair.candidates.find((c) => c.candidateId === assignment.aCandidateId)!;
  const b = pair.candidates.find((c) => c.candidateId === assignment.bCandidateId)!;
  return (
    <>
      <section className="task">
        <div className="section-label">THE TASK</div>
        <pre>{pair.promptText}</pre>
      </section>
      <div className="comparison">
        <CodePanel label="A" code={a.code} language={pair.language} />
        <CodePanel label="B" code={b.code} language={pair.language} />
      </div>
    </>
  );
}
