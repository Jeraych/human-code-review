import { useEffect, useRef, useState } from 'react';
import Home from './components/Home';
import Comparison from './components/Comparison';
import ResearcherConfiguration from './components/ResearcherConfiguration';
import { download } from './export';
import { assetUrl } from './navigation';
import {
  PROTOCOL,
  REVIEWERS,
  activeAnswers,
  configuration,
  configureProtocol,
  DEFAULT_CONFIG,
  formalStarted,
  analyse,
  assert,
  canonical,
  generateFormal,
  GUIDELINE,
  initialProtocol,
  invalidate,
  lockCalibration,
  protocolEdition,
  regenerateFormal,
  replaceProtocol,
  resetCalibration,
  nextUnanswered,
  researchExport,
  ruffTied,
  submitFormal,
  undoFormal,
  validateCatalog,
  validateState,
  workload,
} from './v2';
import type { Answer, DatabaseV2, Preference, Presentation, ProtocolState, Reviewer } from './v2';
import { api, importProgress, loadCache, reconcile, V2_KEY, writeCache } from './v2Storage';
import type { Cache } from './v2Storage';
import type { Choice } from './types';

type View = 'home' | 'play' | 'gate' | 'study' | 'confirm' | 'formal' | 'calibration' | 'research';
const labels = {
  B: 'Pretrained Base',
  C: 'Correctness-focused',
  S: 'Style-trained',
  J: 'Judge-trained',
  SJ: 'Style + Judge',
};
const date = () => new Date().toISOString();
async function accessVerifier(code: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const value = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256,
  );
  return Array.from(new Uint8Array(value), (v) => v.toString(16).padStart(2, '0')).join('');
}
export default function V2App() {
  const [db, setDb] = useState<DatabaseV2>();
  const [cache, setCache] = useState<Cache>();
  const cacheRef = useRef<Cache | undefined>(undefined);
  const rawRef = useRef<string | null>(null);
  const [view, setView] = useState<View>('home');
  const [authorized, setAuthorized] = useState(false);
  const [hosting, setHosting] = useState<'checking' | 'hosted' | 'local'>('checking');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mutex = useRef(false);
  const [code, setCode] = useState('');
  const [reviewer, setReviewer] = useState<Reviewer>('Jacky');
  const [choice, setChoice] = useState<Preference>();
  const [guideline, setGuideline] = useState('');
  const [configDirty, setConfigDirty] = useState(false);
  const [calReveal, setCalReveal] = useState<Presentation>();
  const [recoveryId, setRecoveryId] = useState(''),
    [reason, setReason] = useState('wrong reviewer');
  const [play, setPlay] = useState<Presentation>();
  const [playChoice, setPlayChoice] = useState<Preference>();
  const playLock = useRef(false);
  const [playSession] = useState(() => crypto.randomUUID());
  const [playResponses, setPlayResponses] = useState<any[]>([]);
  const [optOut, setOptOut] = useState(false);
  const [playlist, setPlaylist] = useState('All contrasts');
  const [playQueue, setPlayQueue] = useState<any[]>([]);
  const playSyncing = useRef(false);
  const [remotePlay, setRemotePlay] = useState<any[]>([]);
  const s = cache?.state;
  const configuredWorkload = workload(s ? configuration(s) : DEFAULT_CONFIG);
  const lastEdition = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!s) return;
    const edition = protocolEdition(s),
      replaced = lastEdition.current !== undefined && lastEdition.current !== edition;
    lastEdition.current = edition;
    if ((view === 'formal' || view === 'confirm') && (!s.formal || replaced)) {
      navigate('study');
      setStatus(
        'Researcher updated the active protocol. Select and confirm your reviewer after Formal assignments are available.',
      );
    }
  }, [s?.edition, s?.formal, view]);
  function remember(next: Cache) {
    rawRef.current = writeCache(next, rawRef.current);
    cacheRef.current = next;
    setCache(next);
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      const response = await fetch(assetUrl('v2/catalog.json'));
      assert(response.ok, 'V2 catalog is unavailable.');
      const catalog = await response.json();
      const lists = await Promise.all(
        ['B', 'C', 'S', 'J', 'SJ'].map(async (c) => {
          const r = await fetch(assetUrl(`v2/outputs-${c}.json`));
          assert(r.ok, `Missing ${c} outputs.`);
          return r.json();
        }),
      );
      const database: DatabaseV2 = {
        ...catalog,
        outputs: Object.fromEntries(lists.flat().map((o) => [o.outputId, o])),
      };
      validateCatalog(database);
      if (!alive) return;
      setDb(database);
      rawRef.current = localStorage.getItem(V2_KEY);
      const loaded = loadCache(database);
      cacheRef.current = loaded;
      setCache(loaded);
      setGuideline(loaded.state.calibration.guideline);
      try {
        const health = await api('health');
        assert(
          health.catalogHash === database.catalogHash,
          'Hosted catalog differs from this browser build.',
        );
        setHosting('hosted');
      } catch {
        setHosting('local');
      }
    })().catch((e) => {
      if (alive) setError(String(e));
    });
    const changed = (e: StorageEvent) => {
      if (e.key === V2_KEY || e.key === null)
        setError('Progress changed in another tab. Export a backup and reload before continuing.');
    };
    const stale = (e: Event) => {
      e.preventDefault();
      setError('The app updated. Export a backup before reloading.');
    };
    window.addEventListener('storage', changed);
    window.addEventListener('vite:preloadError', stale);
    return () => {
      alive = false;
      window.removeEventListener('storage', changed);
      window.removeEventListener('vite:preloadError', stale);
    };
  }, []);
  function navigate(next: View) {
    setChoice(undefined);
    setCalReveal(undefined);
    setView(next);
  }
  function study() {
    navigate(authorized ? 'study' : 'gate');
  }
  useEffect(() => {
    const route = () => {
      const hash = location.hash;
      if (hash === '#play') {
        setView('play');
      } else if (hash === '#study') {
        setView(authorized ? 'study' : 'gate');
      } else if (hash === '#research') {
        setView(authorized ? 'research' : 'gate');
      } else if (hash === '#home' || !hash) setView('home');
    };
    route();
    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, [authorized]);
  useEffect(() => {
    const hash = view === 'home' || view === 'play' ? `#${view}` : '#study';
    if (location.hash !== hash && location.hash !== '#main-content')
      history.replaceState(null, '', hash);
    document.title =
      view === 'play'
        ? 'Play · Code / Choice'
        : view === 'home'
          ? 'Code / Choice'
          : 'Human Validation V2 · Code / Choice';
  }, [view]);
  async function refreshShared() {
    assert(db && cacheRef.current, 'Progress is not ready.');
    const remote = (await api('state')) as ProtocolState;
    validateState(remote, db);
    const current = cacheRef.current;
    if (current.dirty) {
      const merged = reconcile(current.base, current.state, remote, db);
      const saved = await api('state', 'PUT', { expectedRevision: remote.revision, state: merged });
      remember({ state: saved, base: structuredClone(saved), dirty: false });
    } else remember({ state: remote, base: structuredClone(remote), dirty: false });
    setStatus('Shared progress is up to date.');
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!db || busy) return;
    setBusy(true);
    setError('');
    try {
      if (hosting === 'hosted') {
        await api('login', 'POST', { code });
        await refreshShared();
        const salt = crypto.randomUUID();
        localStorage.setItem(
          'code-choice.v2-access-verifier',
          JSON.stringify({ salt, hash: await accessVerifier(code, salt) }),
        );
      } else {
        const configured = import.meta.env.VITE_STUDY_ACCESS_CODE;
        const verifier = JSON.parse(
          localStorage.getItem('code-choice.v2-access-verifier') || 'null',
        );
        assert(
          configured || verifier,
          'Local Study access code is not configured. See README for local fallback setup.',
        );
        assert(
          configured
            ? code === configured
            : (await accessVerifier(code, verifier.salt)) === verifier.hash,
          'Access code was not accepted.',
        );
      }
      setCode('');
      setAuthorized(true);
      navigate('study');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function change(edit: (state: ProtocolState) => void) {
    if (mutex.current || !db || !cacheRef.current) return false;
    mutex.current = true;
    setBusy(true);
    setError('');
    try {
      const before = cacheRef.current,
        next = structuredClone(before.state);
      edit(next);
      validateState(next, db);
      remember({ state: next, base: before.base, dirty: true });
      if (hosting === 'hosted') {
        try {
          let saved;
          try {
            saved = await api('state', 'PUT', {
              expectedRevision: before.base.revision,
              state: next,
            });
          } catch (e: any) {
            if (e.status !== 409) throw e;
            const remote = e.data.state as ProtocolState;
            const merged = reconcile(before.base, next, remote, db);
            saved = await api('state', 'PUT', { expectedRevision: remote.revision, state: merged });
          }
          remember({ state: saved, base: structuredClone(saved), dirty: false });
          setStatus('Saved to shared Study and this browser.');
        } catch (e: any) {
          setStatus(
            'Saved in this browser; shared sync is pending. Use Backup / Recovery if connectivity stays unavailable.',
          );
          if (e.status === 401)
            setError(
              'The hosted session expired. Exit Study and re-enter the access code to sync; your local progress is preserved.',
            );
          else if (e.status || /Conflicting|mismatch|changed/.test(String(e))) {
            setError(String(e));
            return false;
          }
        }
      } else setStatus('Saved in this browser.');
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      mutex.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!authorized || hosting !== 'hosted') return;
    const sync = () => {
      if (!mutex.current) {
        mutex.current = true;
        refreshShared()
          .catch((e) => setStatus(`Local cache retained; sync unavailable: ${String(e)}`))
          .finally(() => {
            mutex.current = false;
          });
      }
    };
    window.addEventListener('online', sync);
    const timer = window.setInterval(sync, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', sync);
    };
  }, [authorized, hosting, db]);
  function backup() {
    const current = cacheRef.current?.state;
    if (current)
      download(
        JSON.stringify({ format: 'code-choice-v2-backup', state: current }, null, 2),
        'human-validation-v2-backup.json',
        'application/json',
      );
    else {
      const raw = localStorage.getItem(V2_KEY);
      if (raw) download(raw, 'v2-unreadable-cache.json', 'application/json');
    }
  }
  async function restore(file: File) {
    try {
      assert(file.size <= 2_000_000 && s && db, 'Backup missing/too large.');
      const restored = importProgress(s, await file.text(), db);
      await change((next) => Object.assign(next, restored));
    } catch (e) {
      setError(String(e));
    }
  }
  function nextPlay(filter = playlist) {
    if (!db) return;
    const contrast =
      filter === 'All contrasts'
        ? ['B-C', 'C-S', 'C-J', 'S-SJ'][crypto.getRandomValues(new Uint32Array(1))[0] % 4]
        : filter;
    const candidates = db.pairs.filter((p) => p.eligible && p.contrast === contrast);
    assert(candidates.length, 'Playlist is unavailable.');
    const seed = crypto.getRandomValues(new Uint32Array(2));
    const pair = candidates[Math.floor((seed[0] / 4294967296) * candidates.length)];
    setPlay({
      pairId: pair.pairId,
      a: seed[1] % 2 ? pair.left : pair.right,
      b: seed[1] % 2 ? pair.right : pair.left,
    });
    setPlayChoice(undefined);
    playLock.current = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  useEffect(() => {
    if (view === 'play' && db && !play) nextPlay();
  }, [view, db]);
  async function playVote(selected: Choice) {
    if (!play || !db || playLock.current || selected === 'both_poor') return;
    playLock.current = true;
    const chosen: Preference = selected === 'tie' ? 'Equal' : selected;
    setPlayChoice(chosen);
    const response = {
      ...play,
      responseId: crypto.randomUUID(),
      sessionId: playSession,
      choice: chosen,
      at: date(),
      canonicalPreference: canonical({ ...play, choice: chosen }, db),
      playPoolVersion: db.playPoolVersion,
      protocolVersion: PROTOCOL,
      appVersion: '2.0.0',
      phase: 'Play',
      exploratory: true,
    };
    setPlayResponses((prev) => [...prev, response]);
    if (!optOut) {
      const queue = [...playQueue, response];
      // Retain only opted-in responses for retry, under a namespace separate from Study.
      try {
        localStorage.setItem('code-choice.play-v2-pending', JSON.stringify(queue));
        setPlayQueue(queue);
      } catch {
        setStatus('Play continues; browser response backup is unavailable.');
      }
    }
  }
  useEffect(() => {
    try {
      const q = JSON.parse(localStorage.getItem('code-choice.play-v2-pending') || '[]');
      if (Array.isArray(q)) setPlayQueue(q);
    } catch {
      setStatus('Play response cache is unreadable; Study is unaffected.');
    }
  }, []);
  useEffect(() => {
    if (hosting !== 'hosted' || !playQueue.length) return;
    const flush = async () => {
      if (playSyncing.current) return;
      playSyncing.current = true;
      const sent = new Set<string>();
      try {
        for (const item of playQueue) {
          await api('play', 'POST', item);
          sent.add(item.responseId);
        }
      } catch {
        setStatus('Your opted-in anonymous responses are cached for a later retry.');
      } finally {
        if (sent.size)
          setPlayQueue((current) => {
            const remaining = current.filter((item) => !sent.has(item.responseId));
            try {
              if (remaining.length)
                localStorage.setItem('code-choice.play-v2-pending', JSON.stringify(remaining));
              else localStorage.removeItem('code-choice.play-v2-pending');
            } catch {
              /* Server IDs make a retained cache idempotent. */
            }
            return remaining;
          });
        playSyncing.current = false;
      }
    };
    void flush();
    const timer = window.setInterval(flush, 15000);
    window.addEventListener('online', flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', flush);
    };
  }, [hosting, playQueue]);
  useEffect(() => {
    if (view === 'play' && playChoice) document.getElementById('reveal-title')?.focus();
  }, [view, playChoice, play?.pairId]);
  useEffect(() => {
    if (view !== 'play' || !playChoice) return;
    const advance = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'n' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(e.target as HTMLElement).closest('input,textarea,select,button,[contenteditable]') &&
        !window.getSelection()?.toString()
      ) {
        e.preventDefault();
        nextPlay();
      }
    };
    window.addEventListener('keydown', advance);
    return () => window.removeEventListener('keydown', advance);
  }, [view, playChoice, playlist]);
  const presentation =
    view === 'formal' && s
      ? s.pending[reviewer]
        ? s.answers.find((a) => a.responseId === s.pending[reviewer])
        : nextUnanswered(s, reviewer)
      : view === 'calibration' && s
        ? calReveal ||
          s.calibration.assignments.find(
            (a) => !s.calibration.answers.some((r) => r.pairId === a.pairId),
          )
        : view === 'play'
          ? play
          : undefined;
  const rendered =
    presentation && db ? db.pairs.find((p) => p.pairId === presentation.pairId) : undefined;
  const comparisonPair =
    rendered && db
      ? {
          pairId: rendered.pairId,
          promptId: rendered.taskId,
          promptText: db.prompts[rendered.taskId],
          language: 'python',
          candidates: [
            { candidateId: rendered.left, code: db.outputs[rendered.left].code },
            { candidateId: rendered.right, code: db.outputs[rendered.right].code },
          ] as [{ candidateId: string; code: string }, { candidateId: string; code: string }],
        }
      : undefined;
  const count = s ? activeAnswers(s, reviewer).length : 0;
  const choices = (submit: () => void) => (
    <div className="v2-vote">
      <h2>
        {s?.calibration.guideline === GUIDELINE
          ? 'Which solution would you prefer to work with based on readability and maintainability?'
          : 'Which solution would you prefer to work with based on the reviewer guideline?'}
      </h2>
      <div className="v2-actions">
        {(['A', 'Equal', 'B'] as const).map((c) => (
          <button key={c} aria-pressed={choice === c} onClick={() => setChoice(c)} disabled={busy}>
            {c}
          </button>
        ))}
      </div>
      <p aria-live="polite">Selected: {choice || '—'}</p>
      <button className="primary" disabled={!choice || busy || !!error} onClick={submit}>
        Submit choice
      </button>
    </div>
  );
  return (
    <div
      className={`app v2-app mode-${view === 'formal' || view === 'calibration' ? 'study' : view} ${view === 'play' && playChoice ? 'has-reveal' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-header">
        <a
          className="brand"
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            navigate('home');
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            [ / ]
          </span>
          <span>
            Code / Choice
            <small>
              {view === 'home' || view === 'play'
                ? 'AI code. Human preference.'
                : 'Human Validation V2'}
            </small>
          </span>
        </a>
        <nav aria-label="Application mode">
          <button onClick={study}>Study</button>
          <button
            onClick={() => {
              navigate('play');
              nextPlay();
            }}
            disabled={view === 'formal' || busy || !db}
          >
            Play
          </button>
        </nav>
      </header>
      <main id="main-content">
        {error && (
          <div className="recovery-notice" role="alert">
            <p>{error}</p>
            <button onClick={backup}>Export cached backup</button>
            <button
              onClick={() => {
                setError('');
                setAuthorized(false);
                navigate('gate');
              }}
            >
              Re-enter Study
            </button>
          </div>
        )}
        {status && (
          <p className="notice" role="status">
            {status}
          </p>
        )}
        {!db && !error && <p role="status">Preparing the comparisons…</p>}
        {view === 'home' && (
          <Home
            ready={!!db}
            activeStudy={false}
            onPlay={() => {
              navigate('play');
              nextPlay();
            }}
            onStudy={study}
            onResume={study}
            allowBothPoor={false}
          />
        )}
        {view === 'gate' && (
          <section className="setup-form v2-narrow">
            <div className="section-label">STUDY</div>
            <h1>Human Validation V2</h1>
            <form onSubmit={login}>
              <label>
                Study access code
                <input
                  type="password"
                  autoComplete="current-password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </label>
              <button className="primary" disabled={busy || hosting === 'checking'}>
                Enter Study
              </button>
            </form>
            <p className="hint">
              {hosting === 'hosted'
                ? 'Shared progress with a browser backup.'
                : 'Local fallback. Progress stays in this browser; backups can move between devices.'}
            </p>
          </section>
        )}
        {s && view === 'study' && (
          <section className="v2-narrow">
            <div className="page-title">
              <div>
                <div className="section-label">STUDY HOME</div>
                <h1>Human Validation V2</h1>
              </div>
            </div>
            <div className="v2-menu">
              <button
                disabled={!!s.calibration.lockedAt}
                onClick={() => {
                  setGuideline(s.calibration.guideline);
                  navigate('calibration');
                }}
              >
                Joint Calibration
              </button>
              {REVIEWERS.map((r) => (
                <button
                  key={r}
                  disabled={!s.formal}
                  onClick={() => {
                    setReviewer(r);
                    navigate('confirm');
                  }}
                >
                  {r}
                </button>
              ))}
              <button
                onClick={() => {
                  navigate('research');
                  if (hosting === 'hosted')
                    api('play')
                      .then(setRemotePlay)
                      .catch((e) => setError(String(e)));
                }}
              >
                Researcher
              </button>
            </div>
            <p>
              {s.formal
                ? 'Formal assignments are locked. Review independently without discussing comparisons.'
                : s.calibration.lockedAt
                  ? 'Calibration is locked. Researcher can generate Formal V2.'
                  : `Begin with ${configuredWorkload.calibration} joint calibration comparisons.`}
            </p>
            <details>
              <summary>Backup / Recovery</summary>
              <p>Use only when shared persistence is unavailable or for reproducible backups.</p>
              <button onClick={backup}>Export Progress</button>
              <label className="import-button">
                Import Progress
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void restore(file);
                    e.target.value = '';
                  }}
                />
              </label>
              {hosting === 'hosted' && (
                <button
                  disabled={busy}
                  onClick={() => refreshShared().catch((e) => setError(String(e)))}
                >
                  Refresh shared progress
                </button>
              )}
              <a href="?v1=1#research">Historical V1 recovery</a>
            </details>
          </section>
        )}
        {s && view === 'confirm' && (
          <section className="setup-form v2-narrow">
            <h1>You selected: {reviewer.toUpperCase()}</h1>
            <p>
              Formal progress: {count} / {configuredWorkload[reviewer]}
            </p>
            <p>This session contains {reviewer}'s assigned comparisons.</p>
            <button className="primary" onClick={() => navigate('formal')}>
              Continue as {reviewer}
            </button>
            <button onClick={() => navigate('study')}>← Choose another reviewer</button>
          </section>
        )}
        {s && view === 'formal' && (
          <>
            <div className="study-top">
              <div>
                <strong>Reviewer: {reviewer}</strong>
                <p>
                  Formal V2 · {count} / {configuredWorkload[reviewer]}
                </p>
              </div>
              <button
                disabled={busy}
                onClick={() => {
                  navigate('study');
                }}
              >
                Exit Study
              </button>
            </div>
            <p className="v2-guideline">{s.calibration.guideline}</p>
            {comparisonPair && presentation && (
              <Comparison
                pair={comparisonPair}
                assignment={{
                  pairId: presentation.pairId,
                  aCandidateId: presentation.a,
                  bCandidateId: presentation.b,
                }}
              />
            )}
            {s.pending[reviewer] ? (
              <section className="v2-vote">
                <p role="status">Answer saved.</p>
                <div className="v2-actions">
                  <button
                    disabled={busy}
                    onClick={() => change((next) => undoFormal(next, reviewer, date()))}
                  >
                    Undo
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await change((next) => {
                          delete next.pending[reviewer];
                        })
                      ) {
                        setChoice(undefined);
                        window.scrollTo({ top: 0, behavior: 'instant' });
                      }
                    }}
                  >
                    Next
                  </button>
                </div>
              </section>
            ) : presentation ? (
              choices(() => {
                if (choice)
                  void change((next) =>
                    submitFormal(next, reviewer, choice, date(), crypto.randomUUID()),
                  );
              })
            ) : (
              <section className="completion">
                <h1>Your Formal review is complete.</h1>
                <p>
                  Thank you, {reviewer}. Your responses are saved. Results stay hidden until both
                  reviews are complete and Researcher unblinds.
                </p>
                <button onClick={() => navigate('study')}>Exit Study</button>
              </section>
            )}
          </>
        )}
        {s && view === 'calibration' && (
          <>
            <div className="study-top">
              <div>
                <h1>Joint Calibration</h1>
                <p>
                  Jacky + Conrad · {s.calibration.answers.length} / {configuredWorkload.calibration}{' '}
                  · Separate from Formal
                </p>
              </div>
              <button onClick={() => navigate('study')}>Exit Study</button>
            </div>
            <p>
              Discuss meaningful readability and maintainability differences. Naming,
              difficult-to-read code, duplication, repeated comments, unnecessary else and
              unnecessary conditions can guide discussion.
            </p>
            {comparisonPair && presentation && (
              <Comparison
                pair={comparisonPair}
                assignment={{
                  pairId: presentation.pairId,
                  aCandidateId: presentation.a,
                  bCandidateId: presentation.b,
                }}
                labels={
                  calReveal && db
                    ? Object.fromEntries(
                        [presentation.a, presentation.b].map((id) => [
                          id,
                          labels[db.outputs[id].condition],
                        ]),
                      )
                    : undefined
                }
              />
            )}
            {calReveal ? (
              <div className="v2-vote">
                <p>Choice saved. Discuss the revealed conditions and refine your guideline.</p>
                <button
                  className="primary"
                  onClick={() => {
                    setCalReveal(undefined);
                    setChoice(undefined);
                  }}
                >
                  Next calibration comparison
                </button>
              </div>
            ) : presentation ? (
              choices(async () => {
                if (choice && presentation) {
                  const item = presentation;
                  if (
                    await change((next) => {
                      assert(!next.calibration.lockedAt, 'Calibration is locked.');
                      next.calibration.answers.push({
                        ...item,
                        responseId: crypto.randomUUID(),
                        reviewer: 'Joint',
                        phase: 'Calibration',
                        choice,
                        at: date(),
                      });
                    })
                  )
                    setCalReveal(item);
                }
              })
            ) : (
              <p>All {configuredWorkload.calibration} calibration comparisons are complete.</p>
            )}
            <section className="setup-form">
              <label>
                Reviewer guideline
                <textarea
                  rows={4}
                  value={guideline}
                  disabled={!!s.calibration.lockedAt}
                  onChange={(e) => setGuideline(e.target.value)}
                />
              </label>
              <button
                disabled={busy || !!s.calibration.lockedAt}
                onClick={() =>
                  change((next) => {
                    next.calibration.guideline = guideline;
                  })
                }
              >
                Save guideline
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  s.calibration.answers.length !== configuredWorkload.calibration ||
                  !!s.calibration.lockedAt
                }
                onClick={() =>
                  change((next) => {
                    next.calibration.guideline = guideline;
                    lockCalibration(next, date());
                  })
                }
              >
                Lock Calibration
              </button>
            </section>
          </>
        )}
        {s && db && view === 'research' && (
          <section>
            <div className="page-title">
              <div>
                <div className="section-label">RESEARCHER</div>
                <h1>Human Validation V2</h1>
              </div>
              <button onClick={() => navigate('study')}>Study Home</button>
            </div>
            <ResearcherConfiguration
              state={s}
              db={db}
              busy={busy}
              onDraftChange={setConfigDirty}
              onSave={(config, criterion) =>
                change((next) => configureProtocol(next, db, config, criterion, date()))
              }
              onReset={() => change((next) => resetCalibration(next, db, date()))}
              onRegenerate={() => change((next) => regenerateFormal(next, db, date()))}
              onReplace={(reason) => change((next) => replaceProtocol(next, db, reason, date()))}
            />
            <div className="setup-grid">
              <section className="setup-form">
                <h2>Calibration</h2>
                <p>
                  {s.calibration.answers.length} / {configuredWorkload.calibration} ·{' '}
                  {s.calibration.lockedAt ? 'Locked' : 'Open'}
                </p>
                <h2>Formal</h2>
                {REVIEWERS.map((r) => (
                  <p key={r}>
                    {r}: {activeAnswers(s, r).length} / {configuredWorkload[r]}
                  </p>
                ))}
                <p>
                  Protocol:{' '}
                  {formalStarted(s)
                    ? `Frozen · Edition ${protocolEdition(s)}`
                    : s.formal
                      ? 'Assignments generated · not started'
                      : 'Not generated'}
                </p>
                <button
                  disabled={busy || configDirty || !s.calibration.lockedAt || !!s.formal}
                  onClick={() => change((next) => generateFormal(next, db, date()))}
                >
                  Generate / Lock Formal V2
                </button>
                <button
                  disabled={
                    busy ||
                    !!s.unblindedAt ||
                    !s.formal ||
                    REVIEWERS.some((r) => activeAnswers(s, r).length !== configuredWorkload[r])
                  }
                  onClick={() =>
                    change((next) => {
                      validateState(next, db, true);
                      next.unblindedAt = date();
                    })
                  }
                >
                  Unblind & Analyse
                </button>
                <button
                  disabled={!s.unblindedAt}
                  onClick={() =>
                    download(
                      JSON.stringify(researchExport(s, db, remotePlay), null, 2),
                      'human-validation-v2-research.json',
                      'application/json',
                    )
                  }
                >
                  Export research data
                </button>
                <button onClick={backup}>Export progress backup</button>
                <h2>Play · exploratory</h2>
                <p>
                  {new Set(remotePlay.map((p) => p.sessionId)).size} sessions · {remotePlay.length}{' '}
                  hosted responses
                </p>
                <button
                  disabled={hosting !== 'hosted'}
                  onClick={() =>
                    api('play')
                      .then(setRemotePlay)
                      .catch((e) => setError(String(e)))
                  }
                >
                  Refresh Play summary
                </button>
                <button
                  onClick={() =>
                    download(
                      JSON.stringify(
                        { phase: 'Play', exploratory: true, responses: remotePlay },
                        null,
                        2,
                      ),
                      'play-v2-exploratory.json',
                      'application/json',
                    )
                  }
                >
                  Export Play data
                </button>
              </section>
              <section className="instructions">
                <h2>Frozen pool eligibility</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Contrast</th>
                      <th>Both correct</th>
                      <th>Identical</th>
                      <th>Eligible differing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(db.stats).map(([c, v]) => (
                      <tr key={c}>
                        <td>{c}</td>
                        <td>{v.bothCorrect}</td>
                        <td>{v.bothCorrectIdentical}</td>
                        <td>{v.eligible}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  Duplicates remain recorded. Formal sampling uses only differing both-correct
                  holdout outputs.
                </p>
                {db.limitations.map((l) => (
                  <p className="hint" key={l}>
                    {l}
                  </p>
                ))}
              </section>
            </div>
            {s.unblindedAt && (
              <section className="instructions">
                <h2>Canonical overlap agreement</h2>
                <pre className="v2-json">{JSON.stringify(analyse(s, db), null, 2)}</pre>
              </section>
            )}
            <details>
              <summary>Advanced / Recovery</summary>
              <p>
                Invalidation retains the original response and timestamp. Unblinded evidence cannot
                be changed.
              </p>
              <label>
                Response ID
                <input value={recoveryId} onChange={(e) => setRecoveryId(e.target.value)} />
              </label>
              <label>
                Reason
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button
                disabled={busy || !!s.unblindedAt || !recoveryId}
                onClick={() => change((next) => invalidate(next, recoveryId, reason, date()))}
              >
                Invalidate response
              </button>
              <details>
                <summary>Assignments, mappings and provenance</summary>
                <pre className="v2-json">
                  {JSON.stringify(
                    {
                      formal: s.formal,
                      responses: s.answers,
                      calibration: s.calibration,
                      outputs: s.formal
                        ? Object.fromEntries(
                            [
                              ...new Set(
                                Object.values(s.formal.assignments)
                                  .flat()
                                  .flatMap((a) => [a.a, a.b]),
                              ),
                            ].map((id) => [id, db.outputs[id]]),
                          )
                        : {},
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </details>
          </section>
        )}
        {view === 'play' && db && (
          <>
            <div className="page-title">
              <div>
                <div className="section-label">PLAY</div>
                <h1>Which code would you rather work with?</h1>
              </div>
            </div>
            <div className="pool-switch" aria-label="Playlist">
              {['All contrasts', 'B-C', 'C-S', 'C-J', 'S-SJ'].map((c) => (
                <button
                  className={playlist === c ? 'active' : ''}
                  key={c}
                  onClick={() => {
                    setPlaylist(c);
                    nextPlay(c);
                  }}
                >
                  {c === 'All contrasts'
                    ? c
                    : c
                        .split('-')
                        .map((x) => labels[x as keyof typeof labels])
                        .join(' / ')}
                </button>
              ))}
            </div>
            <p className="hint">
              {import.meta.env.VITE_PLAY_NOTICE ||
                'Anonymous responses may be analysed in aggregate for this student research project.'}{' '}
              Exploratory only.
            </p>
            <label className="v2-optout">
              <input
                type="checkbox"
                checked={optOut}
                onChange={(e) => {
                  setOptOut(e.target.checked);
                }}
              />
              Play without storing new responses
            </label>
            {comparisonPair && presentation && (
              <Comparison
                pair={comparisonPair}
                assignment={{
                  pairId: presentation.pairId,
                  aCandidateId: presentation.a,
                  bCandidateId: presentation.b,
                }}
                onVote={playVote}
                locked={!!playChoice}
                choice={playChoice === 'Equal' ? 'tie' : playChoice}
                labels={
                  playChoice
                    ? Object.fromEntries(
                        [presentation.a, presentation.b].map((id) => [
                          id,
                          labels[db.outputs[id].condition],
                        ]),
                      )
                    : undefined
                }
              />
            )}
            {!playChoice ? (
              <div className="v2-vote">
                <button onClick={() => playVote('tie')}>Equal</button>
              </div>
            ) : (
              <section className="play-reveal">
                <div>
                  <h2 id="reveal-title" tabIndex={-1}>
                    The reveal
                  </h2>
                  <p>
                    {playChoice === 'Equal'
                      ? 'You rated these implementations equally. For you, this training difference did not create a meaningful preference on this example.'
                      : presentation &&
                          ruffTied(db.outputs[presentation.a], db.outputs[presentation.b])
                        ? 'Both passed correctness tests and received the same Ruff results. Your preference was not captured by those checks.'
                        : rendered?.contrast === 'S-SJ'
                          ? 'These conditions achieved very similar aggregate automated style results. This example explores qualitative differences those results may not capture.'
                          : 'Your preference describes this example. Automated results are another view of the code.'}
                  </p>
                  {presentation &&
                    [presentation.a, presentation.b].map((id, i) => {
                      const o = db.outputs[id];
                      return (
                        <p key={id}>
                          <strong>
                            {i === 0 ? 'A' : 'B'} · {labels[o.condition]}
                          </strong>{' '}
                          · correctness passed · Ruff{' '}
                          {o.ruffViolations === 0 && o.ruffStatus === 'ok'
                            ? 'clean'
                            : `${o.ruffViolations} violations`}{' '}
                          · Judge{' '}
                          {o.judgeStatus !== 'ok' || o.judgeScore === null
                            ? 'unavailable'
                            : o.judgeScore}
                        </p>
                      );
                    })}
                </div>
                <button className="primary" onClick={() => nextPlay()}>
                  Next round →
                </button>
              </section>
            )}
            <details className="v2-recap">
              <summary>Your recap · {playResponses.length} comparisons</summary>
              {Object.entries(labels).map(([condition, label]) => (
                <p key={condition}>
                  {label}: {playResponses.filter((r) => r.canonicalPreference === condition).length}
                </p>
              ))}
              <p>Equal: {playResponses.filter((r) => r.choice === 'Equal').length}</p>
              <p className="hint">A personal game recap; no research conclusion.</p>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
