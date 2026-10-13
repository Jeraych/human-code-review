import { useEffect, useRef, useState } from 'react';
import Comparison from './components/Comparison';
import VoteForm from './components/VoteForm';
import Home from './components/Home';
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
import type { Choice, Session, Store } from './types';
import { poolConfigs } from './poolConfig';
import {
  countChoice,
  emptyPlayCounts,
  sampleRound,
  type LoadedPool,
  type PlayCounts,
  type PlayRound,
} from './play';
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
  const [pools, setPools] = useState<Record<string, LoadedPool>>({});
  const [selectedStudy, setSelectedStudy] = useState(poolConfigs[0].poolId);
  const [view, setView] = useState<'home' | 'setup' | 'study' | 'play'>(() => {
    const active = loaded.store?.sessions.find(
      (s) => s.sessionId === loaded.store?.activeSessionId,
    );
    return active && Object.keys(active.responses).length < active.assignments.length
      ? 'study'
      : 'home';
  });
  const [error, setError] = useState(loaded.error),
    [notice, setNotice] = useState('');
  const [evaluator, setEvaluator] = useState('');
  const [play, setPlay] = useState<PlayRound | null>(null);
  const [playFilter, setPlayFilter] = useState('random');
  const [playCounts, setPlayCounts] = useState<Record<string, PlayCounts>>({});
  const playLock = useRef<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all(
      poolConfigs.map(async (config) => {
        const response = await fetch(config.poolUrl);
        if (!response.ok) throw new Error('A frozen pool could not be loaded.');
        const data = await response.json();
        validatePool(data);
        if (data.poolId !== config.poolId)
          throw new Error('Pool configuration does not match its asset.');
        return { config, pool: data, hash: await hashPool(data) };
      }),
    )
      .then((data) => {
        if (alive) setPools(Object.fromEntries(data.map((p) => [p.pool.poolId, p])));
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
  const studyPool = session ? pools[session.poolId] : undefined;
  const selected = pools[selectedStudy];
  const displayed =
    view === 'setup'
      ? selected
      : view === 'play' && play
        ? pools[play.poolId]
        : (studyPool ?? selected);
  const pool = displayed?.pool;
  const poolHash = displayed?.hash ?? '';
  let sessionError = '';
  if (session && Object.keys(pools).length) {
    try {
      if (!studyPool)
        throw new Error('Saved study requires a missing frozen pool. Progress is preserved.');
      validateSession(session, studyPool.pool, studyPool.hash);
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
    if (!selected || !store) return;
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
      const next = createSession(selected.pool, selected.hash, evaluator, seed);
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
    if (!store) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = data.session;
      const assigned = pools[incoming?.poolId];
      if (!assigned) throw new Error('Backup requires a missing frozen pool.');
      validateSession(incoming, assigned.pool, assigned.hash);
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
  function nextPlay(filter = playFilter) {
    if (!Object.keys(pools).length || revealing) return;
    try {
      localStorage.setItem('human-code-evaluation.play-exposure', 'yes');
    } catch (e) {
      setError(String(e));
      return;
    }
    const random = rng(crypto.getRandomValues(new Uint32Array(1))[0]);
    setPlay(sampleRound(Object.values(pools), filter, random, crypto.randomUUID()));
    playLock.current = null;
    setNotice('');
  }
  async function revealVote(choice: Choice) {
    if (!play || playLock.current === play.roundId || (play.choice && play.choice !== choice))
      return;
    playLock.current = play.roundId;
    setPlay({ ...play, choice });
    setRevealing(true);
    setError('');
    try {
      const assigned = pools[play.poolId];
      const response = await fetch(assigned.config.playRevealUrl);
      if (!response.ok) throw new Error('Demo identities are unavailable.');
      const data = await response.json();
      const labels = [
        data.labels?.[play.assignment.aCandidateId],
        data.labels?.[play.assignment.bCandidateId],
      ];
      if (
        data.poolHash !== assigned.hash ||
        labels.some((label) => typeof label !== 'string' || !label.trim() || label.length > 80)
      )
        throw new Error('Demo identity file does not match the frozen pool.');
      setPlay({ ...play, choice, labels: data.labels });
      setPlayCounts((counts) => ({
        ...counts,
        [play.poolId]: countChoice(
          counts[play.poolId] ?? emptyPlayCounts(),
          choice,
          play.assignment,
          data.labels,
          assigned.config.referenceLabel,
        ),
      }));
    } catch (e) {
      setError(String(e));
      playLock.current = null;
    } finally {
      setRevealing(false);
    }
  }
  return (
    <div className={`app mode-${view}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (!revealing) setView('home');
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            [ / ]
          </span>
          <span>
            {view === 'study' || view === 'setup' ? 'Human Code Evaluation' : 'Code / Choice'}
            <small>
              {view === 'study' || view === 'setup'
                ? 'Research evaluation'
                : 'AI code. Human preference.'}
            </small>
          </span>
        </a>
        <nav aria-label="Application mode">
          <button
            className={view === 'study' || view === 'setup' ? 'active' : ''}
            disabled={revealing}
            onClick={() => setView(session ? 'study' : 'setup')}
          >
            {incomplete ? 'Resume Study' : 'Study'}
          </button>
          <button
            disabled={incomplete || revealing || !Object.keys(pools).length}
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
      <main id="main-content">
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
        {view === 'home' && (
          <Home
            ready={!!pool && !error}
            activeStudy={incomplete}
            onPlay={() => {
              setView('play');
              nextPlay();
            }}
            onStudy={() => setView('setup')}
            onResume={() => setView('study')}
          />
        )}
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
                    Study condition
                    <select
                      aria-label="Study condition"
                      value={selectedStudy}
                      onChange={(e) => setSelectedStudy(e.target.value)}
                    >
                      {poolConfigs.map((config) => (
                        <option key={config.poolId} value={config.poolId}>
                          {config.researcherLabel} Study
                        </option>
                      ))}
                    </select>
                  </label>
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
                        / {s.assignments.length} responses ·{' '}
                        {poolConfigs.find((config) => config.poolId === s.poolId)
                          ?.researcherLabel ?? 'Unavailable pool'}{' '}
                        Study
                      </small>
                    </div>
                    <div className="actions">
                      <button
                        onClick={() => {
                          try {
                            const assigned = pools[s.poolId];
                            if (!assigned)
                              throw new Error('Saved study requires a missing frozen pool.');
                            validateSession(s, assigned.pool, assigned.hash);
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
                <h1>Which implementation would you rather work with?</h1>
                <p>Click a code card to choose. Then compare the reveal at your own pace.</p>
              </div>
              <div className="play-stat">
                <strong>
                  {Object.values(playCounts).reduce(
                    (sum, counts) => sum + Object.values(counts).reduce((a, b) => a + b, 0),
                    0,
                  )}
                </strong>
                <span>votes this visit</span>
              </div>
            </div>
            <div className="play-pool-bar">
              <div className="pool-switch" role="group" aria-label="Play pool">
                {[{ poolId: 'random', researcherLabel: 'Random' }, ...poolConfigs].map((config) => (
                  <button
                    key={config.poolId}
                    className={playFilter === config.poolId ? 'active' : ''}
                    disabled={revealing}
                    onClick={() => {
                      setPlayFilter(config.poolId);
                      nextPlay(config.poolId);
                    }}
                  >
                    {config.researcherLabel}
                  </button>
                ))}
              </div>
              <span className="hint">Random gives each available comparison an equal chance.</span>
            </div>
            <Comparison
              key={play.roundId}
              pair={play.pair}
              assignment={play.assignment}
              onVote={(choice) => void revealVote(choice)}
              locked={!!play.choice}
              choice={play.choice}
              labels={play.labels}
            />
            {play.choice && play.labels ? (
              <section className="reveal">
                <div className="section-label">THE REVEAL</div>
                <h2>
                  {play.choice === 'tie'
                    ? 'You found them about equal.'
                    : play.choice === 'both_poor'
                      ? 'Neither implementation suited you.'
                      : `You preferred ${play.labels[play.choice === 'A' ? play.assignment.aCandidateId : play.assignment.bCandidateId]} this round.`}
                </h2>
                <p>
                  A — {play.labels[play.assignment.aCandidateId]}{' '}
                  <span className="reveal-divider">/</span> B —{' '}
                  {play.labels[play.assignment.bCandidateId]}
                </p>
                <button className="primary" onClick={() => nextPlay()}>
                  Next round →
                </button>
              </section>
            ) : revealing ? (
              <p role="status">Loading the reveal…</p>
            ) : play.choice ? (
              <button onClick={() => void revealVote(play.choice!)}>Retry reveal</button>
            ) : (
              <div className="play-alternatives">
                <span>No clear favourite?</span>
                <button onClick={() => void revealVote('tie')}>About equal</button>
                <button onClick={() => void revealVote('both_poor')}>Both poor</button>
                <small>
                  Scroll or select code without voting. A short click, Enter or Space on a card
                  selects it.
                </small>
              </div>
            )}
            {!!Object.keys(playCounts).length && (
              <section className="play-preferences">
                <h2>Your preferences this visit</h2>
                <div className="stats-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Comparison</th>
                        <th>Base preferred</th>
                        <th>Trained preferred</th>
                        <th>Equal</th>
                        <th>Both poor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poolConfigs
                        .filter((config) => playCounts[config.poolId])
                        .map((config) => {
                          const counts = playCounts[config.poolId];
                          return (
                            <tr key={config.poolId}>
                              <th>{config.researcherLabel}</th>
                              <td>{counts.reference}</td>
                              <td>{counts.trained}</td>
                              <td>{counts.tie}</td>
                              <td>{counts.both_poor}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>
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
