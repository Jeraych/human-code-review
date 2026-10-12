import { useEffect, useState } from 'react';
import Comparison from './components/Comparison';
import VoteForm from './components/VoteForm';
import {
  createSession,
  hashPool,
  nextAssignment,
  rng,
  submitVote,
  validatePool,
  validateSession,
} from './session';
import { decodeStore, persist, STORAGE_KEY } from './storage';
import { download, toCSV, toJSON } from './export';
import type { Assignment, Pair, Pool, Session, Store, Vote } from './types';
import { poolConfig } from './poolConfig';

const POOL_URL = poolConfig.poolUrl;
const PLAY_URL = poolConfig.playRevealUrl;
function initialStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { raw, store: decodeStore(raw), error: '' };
  } catch (error) {
    return {
      raw: null,
      store: null,
      error: `Local progress could not be loaded: ${String(error)}`,
    };
  }
}
export default function App() {
  const [loaded, setLoaded] = useState(initialStorage);
  const [pool, setPool] = useState<Pool | null>(null),
    [poolHash, setPoolHash] = useState('');
  const [view, setView] = useState<'setup' | 'study' | 'play'>(
    loaded.store?.activeSessionId ? 'study' : 'setup',
  );
  const [error, setError] = useState(loaded.error),
    [notice, setNotice] = useState('');
  const [evaluator, setEvaluator] = useState('');
  const [play, setPlay] = useState<{
    pair: Pair;
    assignment: Assignment;
    vote?: Vote;
    labels?: Record<string, string>;
  } | null>(null);
  const [playCounts, setPlayCounts] = useState({ A: 0, B: 0, tie: 0, both_poor: 0 });
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(POOL_URL)
      .then((r) => {
        if (!r.ok) throw new Error('Frozen pool could not be loaded.');
        return r.json();
      })
      .then(async (data) => {
        validatePool(data);
        const hash = await hashPool(data);
        if (alive) {
          setPool(data);
          setPoolHash(hash);
        }
      })
      .catch((e) => setError(String(e)));
    const changed = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null)
        setError(
          'Progress changed in another tab. Reload before continuing; this page will not overwrite it.',
        );
    };
    window.addEventListener('storage', changed);
    return () => {
      alive = false;
      window.removeEventListener('storage', changed);
    };
  }, []);
  const store = loaded.store;
  const session = store?.sessions.find((s) => s.sessionId === store.activeSessionId);
  let sessionError = '';
  if (session && pool) {
    try {
      validateSession(session, pool, poolHash);
    } catch (e) {
      sessionError = String(e);
    }
  }
  const assignment = session && !sessionError ? nextAssignment(session) : undefined;
  const completed = session ? Object.keys(session.responses).length : 0;
  const incomplete = !!session && (sessionError !== '' || !!assignment);
  function save(nextStore: Store) {
    const raw = persist(nextStore, loaded.raw);
    setLoaded({ raw, store: nextStore, error: '' });
    setError('');
  }
  function updateSession(next: Session) {
    if (!store) throw new Error('Storage is unavailable.');
    save({
      ...store,
      sessions: store.sessions.map((s) => (s.sessionId === next.sessionId ? next : s)),
    });
  }
  function startStudy() {
    if (!pool || !store) return;
    if (
      incomplete &&
      !confirm(
        'Start a new session? The previous session and all its responses will remain available in researcher setup.',
      )
    )
      return;
    try {
      if (
        localStorage.getItem('human-code-evaluation.play-exposure') &&
        !confirm(
          'This browser has used Play mode with overlapping examples. For a formal evaluator, use a fresh participant who has not seen these examples. Start anyway and record prior Play exposure?',
        )
      )
        return;
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      const next = createSession(pool, poolHash, evaluator, seed);
      next.priorPlayExposure =
        localStorage.getItem('human-code-evaluation.play-exposure') === 'yes';
      save({ ...store, activeSessionId: next.sessionId, sessions: [...store.sessions, next] });
      setView('study');
      setNotice('');
    } catch (e) {
      setError(String(e));
    }
  }
  function exportSession(s: Session, format: 'json' | 'csv') {
    download(
      format === 'json' ? toJSON(s) : toCSV(s),
      `evaluation-${s.sessionId}.${format}`,
      format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
    );
    setNotice('Download requested. Please check the file and give it to the researcher.');
  }
  function recovery() {
    try {
      download(
        localStorage.getItem(STORAGE_KEY) ?? '{}',
        'evaluation-storage-recovery.json',
        'application/json',
      );
    } catch (e) {
      setError(String(e));
    }
  }
  async function importBackup(file: File) {
    if (!pool || !store) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = data.session;
      validateSession(incoming, pool, poolHash);
      const existing = store.sessions.find((s) => s.sessionId === incoming.sessionId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(incoming))
        throw new Error(
          'This session already exists with different progress. Import refused; keep both files for researcher review.',
        );
      if (!existing)
        save({
          ...store,
          activeSessionId: incoming.sessionId,
          sessions: [...store.sessions, incoming],
        });
      else save({ ...store, activeSessionId: incoming.sessionId });
      setView('study');
      setNotice('Backup restored.');
    } catch (e) {
      setError(String(e));
    }
  }
  function nextPlay() {
    if (!pool) return;
    try {
      localStorage.setItem('human-code-evaluation.play-exposure', 'yes');
    } catch (e) {
      setError(String(e));
      return;
    }
    const random = rng(crypto.getRandomValues(new Uint32Array(1))[0]);
    const pair = pool.pairs[Math.floor(random() * pool.pairs.length)],
      flip = random() < 0.5;
    setPlay({
      pair,
      assignment: {
        pairId: pair.pairId,
        aCandidateId: pair.candidates[flip ? 1 : 0].candidateId,
        bCandidateId: pair.candidates[flip ? 0 : 1].candidateId,
      },
    });
    setNotice('');
  }
  async function revealVote(vote: Vote) {
    if (!play || revealing) return;
    setRevealing(true);
    setError('');
    try {
      const response = await fetch(PLAY_URL);
      if (!response.ok) throw new Error('Demo identities are unavailable.');
      const data = await response.json();
      const labels = [
        data.labels?.[play.assignment.aCandidateId],
        data.labels?.[play.assignment.bCandidateId],
      ];
      if (
        data.poolHash !== poolHash ||
        labels.some((label) => typeof label !== 'string' || !label.trim() || label.length > 80)
      )
        throw new Error('Demo identity file does not match the frozen pool.');
      setPlay({ ...play, vote, labels: data.labels });
      setPlayCounts((counts) => ({ ...counts, [vote.choice]: counts[vote.choice] + 1 }));
    } catch (e) {
      setError(String(e));
    } finally {
      setRevealing(false);
    }
  }
  return (
    <div className="app">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView('setup');
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            [ / ]
          </span>
          <span>
            Human Code Evaluation<small>A pairwise preference study</small>
          </span>
        </a>
        <nav aria-label="Application mode">
          <button
            className={view !== 'play' ? 'active' : ''}
            onClick={() => setView(session ? 'study' : 'setup')}
          >
            Study
          </button>
          <button
            disabled={incomplete}
            title={incomplete ? 'Finish the active study before using Play mode.' : undefined}
            className={view === 'play' ? 'active' : ''}
            onClick={() => {
              setView('play');
              nextPlay();
            }}
          >
            Play
          </button>
        </nav>
      </header>
      <main>
        {(error || sessionError) && (
          <div className="alert" role="alert">
            <strong>Progress needs attention</strong>
            <p>{error || sessionError}</p>
            <div className="actions">
              <button onClick={() => location.reload()}>Reload page</button>
              <button onClick={recovery}>Download recovery backup</button>
              {session && <button onClick={() => setView('setup')}>Researcher setup</button>}
            </div>
          </div>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {!pool && !error && <p>Loading the frozen evaluation pool…</p>}
        {pool && view === 'setup' && (
          <>
            <div className="page-title">
              <div>
                <div className="section-label">RESEARCHER SETUP</div>
                <h1>Set up an evaluation</h1>
                <p>A fixed set of tasks. Two anonymous implementations. Your preference.</p>
              </div>
              <span className="pool-count">
                {pool.pairs.length}
                <small>paired tasks</small>
              </span>
            </div>
            <div className="setup-grid">
              <section className="setup-form">
                <h2>Start a study</h2>
                <p>Assign an evaluator ID, then pass the screen to the evaluator.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    startStudy();
                  }}
                >
                  <label>
                    Evaluator ID
                    <input
                      value={evaluator}
                      onChange={(e) => setEvaluator(e.target.value)}
                      placeholder="e.g. participant-01"
                      maxLength={80}
                      required
                      autoComplete="off"
                    />
                  </label>
                  <button className="primary" disabled={!store || !evaluator.trim()} type="submit">
                    {session ? 'Start a new study' : 'Start study'}{' '}
                    <span aria-hidden="true">→</span>
                  </button>
                </form>
                <p className="hint">
                  Sessions stay in this browser. Starting a new one preserves previous responses.
                </p>
                <label className="import-button">
                  Restore a JSON backup
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void importBackup(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </section>
              <section className="instructions">
                <div className="section-label">BEFORE YOU BEGIN</div>
                <h2>Read. Compare. Choose.</h2>
                <ol>
                  <li>
                    <strong>Read the task and both implementations.</strong>
                    <span>
                      Consider code you might use, maintain, or receive from another developer.
                    </span>
                  </li>
                  <li>
                    <strong>Choose the code you would rather work with.</strong>
                    <span>
                      Choose About equal if there is no clear preference. Choose Both poor if
                      neither is suitable.
                    </span>
                  </li>
                  <li>
                    <strong>Export your responses when finished.</strong>
                    <span>
                      Progress saves locally after each submission. Give the downloaded result to
                      the researcher.
                    </span>
                  </li>
                </ol>
                <p className="hint">
                  You are judging preference from inspection. Automated correctness is measured
                  separately. Use a normal browser window and keep one tab open. Avoid Play mode
                  before participating in a formal study.
                </p>
              </section>
            </div>
            {!!store?.sessions.length && (
              <section className="session-list">
                <h2>Saved studies</h2>
                {[...store.sessions].reverse().map((s) => (
                  <div className="session-row" key={s.sessionId}>
                    <div>
                      <strong>{s.evaluatorId}</strong>
                      <small>
                        {new Date(s.createdAt).toLocaleString()} · {Object.keys(s.responses).length}{' '}
                        / {s.assignments.length} responses
                      </small>
                    </div>
                    <div className="actions">
                      <button
                        onClick={() => {
                          try {
                            validateSession(s, pool, poolHash);
                            save({ ...store, activeSessionId: s.sessionId });
                            setView('study');
                          } catch (e) {
                            setError(String(e));
                          }
                        }}
                      >
                        Continue
                      </button>
                      <button onClick={() => exportSession(s, 'json')}>JSON</button>
                      <button onClick={() => exportSession(s, 'csv')}>CSV</button>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
        {pool && view === 'study' && session && !sessionError && (
          <>
            <div className="study-top">
              <div>
                <div className="section-label">STUDY SESSION</div>
                <h1>
                  {assignment ? 'Read the code. Make your choice.' : 'Your evaluation is complete.'}
                </h1>
                <p>
                  {assignment
                    ? 'Both implementations respond to the same task. Their identities stay hidden.'
                    : 'Every assigned pair has one saved response. Please export your results.'}
                </p>
              </div>
              <div className="progress">
                <span>
                  <strong>{completed}</strong> / {session.assignments.length} completed
                </span>
                <progress max={session.assignments.length} value={completed} />
              </div>
            </div>
            <div className="session-toolbar">
              <span>
                Evaluator <strong>{session.evaluatorId}</strong>
              </span>
              <div className="actions">
                <button onClick={() => exportSession(session, 'json')}>
                  Export JSON{assignment ? ' backup' : ''}
                </button>
                <button onClick={() => exportSession(session, 'csv')}>Export CSV</button>
                <button onClick={() => setView('setup')}>Researcher setup</button>
              </div>
            </div>
            {assignment ? (
              <>
                <Comparison
                  key={assignment.pairId}
                  pair={pool.pairs.find((p) => p.pairId === assignment.pairId)!}
                  assignment={assignment}
                />
                <VoteForm
                  key={`vote-${assignment.pairId}`}
                  initial={session.draft}
                  onDraft={(vote) => {
                    try {
                      updateSession({
                        ...session,
                        revision: session.revision + 1,
                        updatedAt: new Date().toISOString(),
                        draft: { ...vote, pairId: assignment.pairId },
                      });
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                  onSubmit={(vote) => {
                    try {
                      updateSession(submitVote(session, pool, assignment, vote));
                      setNotice('');
                      window.scrollTo({ top: 0, behavior: 'instant' });
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                />
              </>
            ) : (
              <section className="completion">
                <span className="completion-symbol" aria-hidden="true">
                  ✓
                </span>
                <h2>One final step: export your results.</h2>
                <p>
                  Responses are saved in this browser. Download JSON as the authoritative record,
                  then give the file to the researcher. CSV is available for analysis.
                </p>
                <div className="actions">
                  <button className="primary" onClick={() => exportSession(session, 'json')}>
                    Download JSON result
                  </button>
                  <button onClick={() => exportSession(session, 'csv')}>Download CSV</button>
                </div>
                <p className="hint">Candidate identities remain hidden in Study mode.</p>
              </section>
            )}
          </>
        )}
        {pool && view === 'play' && play && (
          <>
            <div className="study-top">
              <div>
                <div className="section-label">PLAY MODE</div>
                <h1>Make a choice. See the reveal.</h1>
                <p>Random examples, with identities revealed after voting. Repeats are possible.</p>
              </div>
              <div className="play-stat">
                <strong>{Object.values(playCounts).reduce((a, b) => a + b, 0)}</strong>
                <span>votes this visit</span>
              </div>
            </div>
            <Comparison
              key={play.assignment.aCandidateId + play.assignment.bCandidateId}
              pair={play.pair}
              assignment={play.assignment}
            />
            {play.vote && play.labels ? (
              <section className="reveal">
                <div className="section-label">THE REVEAL</div>
                <h2>
                  A: {play.labels[play.assignment.aCandidateId]} <span> / </span> B:{' '}
                  {play.labels[play.assignment.bCandidateId]}
                </h2>
                <p>
                  You chose{' '}
                  {play.vote.choice === 'tie'
                    ? 'About equal'
                    : play.vote.choice === 'both_poor'
                      ? 'Both poor'
                      : `Implementation ${play.vote.choice}`}
                  .
                </p>
                <p className="hint">
                  Your votes this visit: A {playCounts.A} · B {playCounts.B} · About equal{' '}
                  {playCounts.tie} · Both poor {playCounts.both_poor}
                </p>
                <button className="primary" onClick={nextPlay}>
                  Next random pair →
                </button>
              </section>
            ) : revealing ? (
              <p role="status">Loading the reveal…</p>
            ) : (
              <VoteForm
                key={`play-${play.assignment.aCandidateId + play.assignment.bCandidateId}`}
                play
                onSubmit={(vote) => void revealVote(vote)}
              />
            )}
          </>
        )}
      </main>
      <footer>
        <span>Human judgement, one comparison at a time.</span>
        <span>
          {view === 'play'
            ? 'Demo responses are separate from study data.'
            : 'Local progress · No community results'}
        </span>
      </footer>
    </div>
  );
}
