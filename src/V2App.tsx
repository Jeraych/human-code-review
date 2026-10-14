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
  analyse,
  assert,
  canonical,
  generateFormal,
  GUIDELINE,
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
  validateTransition,
  workload,
} from './v2';
import type { DatabaseV2, Preference, Presentation, ProtocolState, Reviewer } from './v2';
import { api, importProgress, loadCache, reconcile, V2_KEY, writeCache } from './v2Storage';
import type { Cache } from './v2Storage';
import type { Choice } from './types';
import {
  REVIEWER_KEY,
  exportStudy,
  importStudy,
  exportResult,
  importResult,
  overlapAvailable,
} from './v2Transfer';
import type { ReviewerSession } from './v2Transfer';

type View = 'home' | 'play' | 'gate' | 'study' | 'formal' | 'calibration' | 'research';
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
  const [backend, setBackend] = useState(false);
  const [reviewerSession, setReviewerSession] = useState<ReviewerSession>();
  const reviewerRaw = useRef<string | null>(null);
  const reviewerRef = useRef<ReviewerSession | undefined>(undefined);
  const [transferError, setTransferError] = useState('');
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
  const s = reviewerSession?.state ?? cache?.state;
  const configuredWorkload = workload(s ? configuration(s) : DEFAULT_CONFIG);
  const lastEdition = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!s) return;
    const edition = protocolEdition(s),
      replaced = lastEdition.current !== undefined && lastEdition.current !== edition;
    lastEdition.current = edition;
    if (view === 'formal' && (!s.formal || replaced)) {
      navigate('study');
      setStatus('Researcher updated the Study. Return when new assignments are ready.');
    }
  }, [s?.edition, s?.formal, view]);
  function remember(next: Cache) {
    rawRef.current = writeCache(next, rawRef.current);
    cacheRef.current = next;
    setCache(next);
  }
  function rememberReviewer(session: ReviewerSession) {
    assert(
      localStorage.getItem(REVIEWER_KEY) === reviewerRaw.current,
      'Reviewer progress changed in another tab. Reload before continuing.',
    );
    const raw = JSON.stringify(session);
    localStorage.setItem(REVIEWER_KEY, raw);
    assert(localStorage.getItem(REVIEWER_KEY) === raw, 'Reviewer progress could not be saved.');
    reviewerRaw.current = raw;
    reviewerRef.current = session;
    setReviewerSession(session);
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
      const reviewerSaved = localStorage.getItem(REVIEWER_KEY);
      if (reviewerSaved) {
        const session = JSON.parse(reviewerSaved) as ReviewerSession;
        await importStudy(JSON.stringify(session.package), database);
        validateState(session.state, database);
        validateTransition(session.package.state, session.state, database);
        assert(
          session.state.answers.every((a) => a.reviewer === session.package.reviewer),
          'Reviewer cache contains another reviewer.',
        );
        reviewerRaw.current = reviewerSaved;
        reviewerRef.current = session;
        setReviewerSession(session);
        setReviewer(session.package.reviewer);
      }
      try {
        const health = await api('health');
        assert(
          health.catalogHash === database.catalogHash,
          'Hosted catalog differs from this browser build.',
        );
        if (health.appWorkflow !== 'study-transfer-v2') {
          setHosting('local');
          setStatus(
            'Restart the Study service to use this update. Your browser progress is preserved.',
          );
          return;
        }
        setBackend(true);
        setHosting(health.transport === 'local' ? 'local' : 'hosted');
      } catch {
        setHosting('local');
      }
    })().catch((e) => {
      if (alive) setError(String(e));
    });
    const changed = (e: StorageEvent) => {
      if (e.key === V2_KEY || e.key === REVIEWER_KEY || e.key === null)
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
    navigate(authorized || reviewerSession ? 'study' : 'gate');
  }
  useEffect(() => {
    const route = () => {
      const hash = location.hash;
      if (hash === '#play') {
        setView('play');
      } else if (hash === '#study') {
        setView(authorized || reviewerSession ? 'study' : 'gate');
      } else if (hash === '#research') {
        setView(authorized && !reviewerSession ? 'research' : 'gate');
      } else if (hash === '#home' || !hash) setView('home');
    };
    route();
    window.addEventListener('hashchange', route);
    window.addEventListener('popstate', route);
    return () => {
      window.removeEventListener('hashchange', route);
      window.removeEventListener('popstate', route);
    };
  }, [authorized, reviewerSession?.package.studyId]);
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
    setStatus('Saved.');
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!db || busy) return;
    setBusy(true);
    setError('');
    try {
      if (backend) {
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
      if (reviewerRef.current) {
        const session = reviewerRef.current;
        const state = structuredClone(session.state);
        edit(state);
        validateState(state, db);
        validateTransition(session.state, state, db);
        assert(
          state.answers.every((a) => a.reviewer === session.package.reviewer),
          'Wrong reviewer.',
        );
        rememberReviewer({ ...session, state });
        setStatus('Saved in this browser.');
        return true;
      }
      edit(next);
      validateState(next, db);
      remember({ state: next, base: before.base, dirty: true });
      if (backend) {
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
          setStatus('Saved.');
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
    if (!authorized || !backend || reviewerSession) return;
    const sync = () => {
      if (!mutex.current) {
        mutex.current = true;
        refreshShared()
          .catch((e) => {
            if (e.status === 401) {
              setAuthorized(false);
              navigate('gate');
              setStatus('Enter the Study access code to reconnect. Your progress is saved.');
            } else setStatus('Shared connection unavailable. Progress is saved in this browser.');
          })
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
  }, [authorized, backend, db, reviewerSession]);
  function backup() {
    if (reviewerRef.current) {
      void sendResult();
      return;
    }
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
  async function receiveStudy(file: File) {
    if (!db || busy) return;
    setBusy(true);
    setTransferError('');
    try {
      assert(file.size <= 2_000_000, 'Study file is too large.');
      const session = await importStudy(await file.text(), db, reviewerRef.current);
      rememberReviewer(session);
      setReviewer(session.package.reviewer);
      navigate('study');
      setStatus('Study imported. Ready to start.');
    } catch (e) {
      setTransferError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function sendStudy(r: Reviewer) {
    if (!s || !db) return;
    try {
      download(
        JSON.stringify(await exportStudy(s, r, db), null, 2),
        `code-choice-${r.toLowerCase()}.study.json`,
        'application/json',
      );
    } catch (e) {
      setTransferError(String(e));
    }
  }
  async function sendResult() {
    if (!reviewerRef.current) return;
    download(
      JSON.stringify(await exportResult(reviewerRef.current), null, 2),
      `code-choice-${reviewerRef.current.package.reviewer.toLowerCase()}-result.json`,
      'application/json',
    );
  }
  async function receiveResult(file: File, r: Reviewer) {
    if (!db || !cacheRef.current || busy) return;
    setTransferError('');
    try {
      assert(file.size <= 2_000_000, 'Result file is too large.');
      // Capture the file, then merge against the latest state inside the mutation lock.
      const raw = await file.text();
      const before = cacheRef.current.state;
      const merged = await importResult(before, raw, file.name, r, db);
      await change((next) => {
        assert(
          JSON.stringify(next) === JSON.stringify(before),
          'Progress changed during import. Import the Result again.',
        );
        Object.assign(next, merged);
      });
      setStatus(`${r} Result imported.`);
    } catch (e) {
      setTransferError(e instanceof Error ? e.message : String(e));
    }
  }
  const fileControl = (label: string, receive: (file: File) => void) => (
    <label
      className="import-button"
      role="button"
      tabIndex={busy || !db ? -1 : 0}
      aria-disabled={busy || !db}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !busy && db) {
          e.preventDefault();
          e.currentTarget.querySelector('input')?.click();
        }
      }}
    >
      {label}
      <input
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept=".json"
        aria-label={label}
        disabled={busy || !db}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) receive(file);
          e.target.value = '';
        }}
      />
    </label>
  );
  const progress = (r: Reviewer) =>
    s?.formal ? `${activeAnswers(s, r).length} / ${configuredWorkload[r]}` : 'Not started';
  const reviewerCard = (r: Reviewer) => (
    <article className="study-card" key={r} aria-label={`${r} Study`}>
      <h2>{r}</h2>
      <p>
        {progress(r)}
        {s?.formal && activeAnswers(s, r).length === configuredWorkload[r] ? ' · ✓ Complete' : ''}
      </p>
      <button
        className="primary"
        disabled={!s?.formal || busy || !!s.unblindedAt}
        onClick={() => {
          setReviewer(r);
          navigate('formal');
        }}
      >
        {s && activeAnswers(s, r).length ? 'Continue' : 'Start'}
      </button>
    </article>
  );
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
        ? s.calibration.lockedAt
          ? undefined
          : calReveal ||
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
  const transferNotice = transferError.includes('different Study')
    ? 'This result belongs to a different Study.'
    : /Conflicting responses|Choose a reviewer|This is |different reviewer Study|already been analysed|too large/.test(
          transferError,
        )
      ? transferError
      : /integrity|frozen pool/.test(transferError)
        ? 'This file could not be verified. Request the original file again.'
        : 'This file could not be imported. Check that it is the correct Study or Result file.';
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
        Submit
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
                : 'Human Validation'}
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
                if (reviewerSession) {
                  navigate('study');
                  return;
                }
                setAuthorized(false);
                navigate('gate');
              }}
            >
              {reviewerSession ? 'Return to Study' : 'Re-enter Study'}
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
        {transferError && (
          <div className="recovery-notice" role="alert">
            <p>{transferNotice}</p>
            <details>
              <summary>Technical details</summary>
              <pre>{transferError}</pre>
            </details>
            <button onClick={() => setTransferError('')}>Dismiss</button>
          </div>
        )}
        {view === 'gate' && (
          <section className="setup-form v2-narrow">
            <div className="section-label">STUDY</div>
            <h1>Human Validation</h1>
            {hosting !== 'hosted' && (
              <section className="study-import">
                <h2>Received a Study file?</h2>
                {fileControl('Import Study', (file) => void receiveStudy(file))}
              </section>
            )}
            <form onSubmit={login}>
              <h2>{hosting === 'hosted' ? 'Open shared Study' : 'Open main Study'}</h2>
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
            {hosting === 'hosted' && (
              <details>
                <summary>Advanced · Offline recovery</summary>
                {fileControl('Import Study', (file) => void receiveStudy(file))}
              </details>
            )}
          </section>
        )}
        {s && view === 'study' && (
          <section className="v2-narrow">
            <div className="section-label">STUDY</div>
            <h1>Human Validation</h1>
            {reviewerSession ? (
              <>
                <p>Reviewer: {reviewerSession.package.reviewer}</p>
                {reviewerCard(reviewerSession.package.reviewer)}
                {count === configuredWorkload[reviewer] && (
                  <button onClick={() => void sendResult()}>Export Result</button>
                )}
                <details>
                  <summary>Backup</summary>
                  <button onClick={() => void sendResult()}>Export Result</button>
                  {fileControl('Import Study', (file) => void receiveStudy(file))}
                </details>
              </>
            ) : (
              <>
                <p className="study-intro">
                  Calibrate together, review independently, then combine and analyse.
                </p>
                <div className="study-cards">
                  <article className="study-card">
                    <h2>Joint Calibration</h2>
                    <p>
                      {s.calibration.lockedAt
                        ? '✓ Complete · Locked'
                        : `${s.calibration.answers.length} / ${configuredWorkload.calibration}`}
                    </p>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setGuideline(s.calibration.guideline);
                        navigate('calibration');
                      }}
                    >
                      {s.calibration.lockedAt
                        ? 'Open'
                        : s.calibration.answers.length
                          ? 'Continue'
                          : 'Start'}
                    </button>
                  </article>
                  {REVIEWERS.map(reviewerCard)}
                  <article className="study-card">
                    <h2>Researcher</h2>
                    <p>Setup, progress and results</p>
                    <button
                      onClick={() => {
                        navigate('research');
                        if (backend)
                          api('play')
                            .then(setRemotePlay)
                            .catch((e) => setError(String(e)));
                      }}
                    >
                      Open
                    </button>
                  </article>
                </div>
              </>
            )}
          </section>
        )}
        {s && view === 'formal' && (
          <>
            <div className="study-top">
              <div>
                <strong>Reviewer: {reviewer}</strong>
                <p>
                  {count} / {configuredWorkload[reviewer]}
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
                <p role="status">Saved</p>
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
                <h1>Study complete</h1>
                <p>
                  Thank you, {reviewer}. Your responses are saved. Results stay hidden until both
                  reviews are complete and Researcher unblinds.
                </p>
                <button onClick={() => navigate('study')}>Exit Study</button>
                {reviewerSession && (
                  <button className="primary" onClick={() => void sendResult()}>
                    Export Result
                  </button>
                )}
              </section>
            )}
          </>
        )}
        {s && !reviewerSession && authorized && view === 'calibration' && (
          <>
            <div className="study-top">
              <div>
                <h1>Joint Calibration</h1>
                <p>
                  Jacky + Conrad · {s.calibration.answers.length} /{' '}
                  {configuredWorkload.calibration}{' '}
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
            {!s.calibration.lockedAt &&
              (calReveal ? (
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
              ))}
            {s.calibration.lockedAt ? (
              <section className="completion">
                <h2>Calibration complete</h2>
                <p>✓ Locked</p>
                <button
                  className="primary"
                  disabled={busy || !!s.formal}
                  onClick={async () => {
                    if (await change((next) => generateFormal(next, db!, date())))
                      navigate('research');
                  }}
                >
                  Generate Study
                </button>
                {s.formal && <button onClick={() => navigate('research')}>Open Researcher</button>}
              </section>
            ) : (
              <section className="setup-form">
                <label>
                  Reviewer guideline
                  <textarea
                    aria-label="Reviewer guideline"
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
            )}
          </>
        )}
        {s && db && authorized && !reviewerSession && view === 'research' && (
          <section>
            <div className="page-title">
              <div>
                <div className="section-label">RESEARCHER</div>
                <h1>Human Validation</h1>
              </div>
              <button onClick={() => navigate('study')}>Study Home</button>
            </div>
            {s.formal && (
              <section className="study-transfer" aria-labelledby="transfer-title">
                <h2 id="transfer-title">
                  {hosting === 'hosted' ? 'Remote Study' : 'Offline Transfer'}
                </h2>
                <div className="study-cards">
                  {REVIEWERS.map((r) => (
                    <article className="study-card" key={r}>
                      <h3>{r}</h3>
                      <p>
                        {progress(r)}
                        {activeAnswers(s, r).length === configuredWorkload[r]
                          ? ' · ✓ Complete'
                          : ''}
                      </p>
                      {hosting !== 'hosted' && (
                        <div className="v2-actions">
                          <button
                            disabled={busy || !!s.unblindedAt}
                            onClick={() => void sendStudy(r)}
                          >
                            Export {r} Study
                          </button>
                          {!s.unblindedAt &&
                            fileControl(
                              `Import ${r} Result`,
                              (file) => void receiveResult(file, r),
                            )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
                <p>
                  Overlap: {overlapAvailable(s)} / {configuredWorkload.overlap} available for
                  agreement analysis
                </p>
                {!s.unblindedAt && (
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      configDirty ||
                      REVIEWERS.some((r) => activeAnswers(s, r).length !== configuredWorkload[r])
                    }
                    onClick={() =>
                      change((next) => {
                        validateState(next, db, true);
                        next.unblindedAt = date();
                      })
                    }
                  >
                    {hosting === 'hosted' ? 'Unblind & Analyse' : 'Merge & Analyse'}
                  </button>
                )}
              </section>
            )}
            {s.unblindedAt && (
              <section className="research-summary">
                <h2>Summary</h2>
                <div className="summary-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Comparison</th>
                        <th>Unique pairs</th>
                        <th>Ratings</th>
                        <th>Preferences</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyse(s, db).results.map((row) => (
                        <tr key={row.contrast}>
                          <th>{row.contrast.replace('-', '–')}</th>
                          <td>{row.distinctPairs}</td>
                          <td>{row.ratings}</td>
                          <td>
                            {Object.entries(row.counts)
                              .map(([label, n]) => `${label}: ${n}`)
                              .join(' · ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3>Reviewer agreement</h3>
                <div className="summary-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Comparison</th>
                        <th>Overlap pairs</th>
                        <th>Agreement</th>
                        <th>Cohen’s κ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyse(s, db).results.map((row) => (
                        <tr key={row.contrast}>
                          <th>{row.contrast.replace('-', '–')}</th>
                          <td>{row.overlapPairs}</td>
                          <td>
                            {row.rawAgreement === null
                              ? '—'
                              : `${Math.round(row.rawAgreement * 100)}%`}
                          </td>
                          <td>{row.kappa === null ? '—' : row.kappa.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="hint">
                  Agreement compares the same pairs using revealed conditions. κ is unavailable
                  without overlap or variation. Ratings on shared tasks are correlated.
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    download(
                      JSON.stringify(researchExport(s, db, remotePlay), null, 2),
                      'code-choice-final-research.json',
                      'application/json',
                    )
                  }
                >
                  Export Final Research Data
                </button>
              </section>
            )}
            <ResearcherConfiguration
              state={s}
              db={db}
              busy={busy}
              onDraftChange={setConfigDirty}
              onSave={(config, criterion) =>
                change((next) => configureProtocol(next, db, config, criterion, date()))
              }
              onGenerate={(config, criterion) =>
                change((next) => {
                  configureProtocol(next, db, config, criterion, date());
                  generateFormal(next, db, date());
                })
              }
              onCalibration={() => {
                setGuideline(s.calibration.guideline);
                navigate('calibration');
              }}
              onReset={() => change((next) => resetCalibration(next, db, date()))}
              onRegenerate={() => change((next) => regenerateFormal(next, db, date()))}
              onReplace={(reason) => change((next) => replaceProtocol(next, db, reason, date()))}
            />
            <details>
              <summary>Advanced · Backup, provenance and recovery</summary>
              <h2>Backup</h2>
              <div className="v2-actions">
                <button onClick={backup}>Export Progress</button>
                {fileControl('Import Progress', (file) => void restore(file))}
                {backend && (
                  <button
                    disabled={busy}
                    onClick={() => refreshShared().catch((e) => setError(String(e)))}
                  >
                    Refresh shared progress
                  </button>
                )}
              </div>
              {hosting === 'hosted' && s.formal && !s.unblindedAt && (
                <div className="v2-actions">
                  {REVIEWERS.map((r) => (
                    <div key={r}>
                      <button onClick={() => void sendStudy(r)}>Export {r} Study</button>
                      {fileControl(`Import ${r} Result`, (file) => void receiveResult(file, r))}
                    </div>
                  ))}
                </div>
              )}
              <a href="?v1=1#research" target="_blank" rel="noopener">
                Open historical V1 recovery
              </a>
              <h2>Response recovery</h2>
              <p>Invalidation preserves the original response. Analysed evidence is frozen.</p>
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
                      protocol: s,
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
                      duplicateStats: db.stats,
                      limitations: db.limitations,
                      analysis: s.unblindedAt ? analyse(s, db) : undefined,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              <h2>Play · exploratory</h2>
              <p>
                {new Set(remotePlay.map((p) => p.sessionId)).size} sessions · {remotePlay.length}{' '}
                responses
              </p>
              <button
                disabled={!backend}
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
