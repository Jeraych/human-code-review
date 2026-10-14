import { useEffect, useRef, useState } from 'react';
import Home from './components/Home';
import Comparison from './components/Comparison';
import ResearcherConfiguration from './components/ResearcherConfiguration';
import { download } from './export';
import { assetUrl } from './navigation';
import {
  PROTOCOL,
  REVIEWERS,
  FORMAL_REVIEWERS,
  formalStarted,
  activeAnswers,
  configuration,
  configureProtocol,
  DEFAULT_CONFIG,
  analyse,
  assert,
  canonical,
  generateFormal,
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
import type { DatabaseV2, Preference, Presentation, ProtocolState, FormalReviewer } from './v2';
import { api, importProgress, loadCache, reconcile, V2_KEY, writeCache } from './v2Storage';
import type { Cache } from './v2Storage';
import type { Choice } from './types';
import { REVIEWER_KEY, exportStudy, importStudy, exportResult, importResult } from './v2Transfer';
import type { ReviewerSession } from './v2Transfer';
import { keepReview, savedReviews } from './v2ReviewerStorage';

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
  const [savedReviewer, setSavedReviewer] = useState<ReviewerSession>();
  const [otherReviews, setOtherReviews] = useState<ReviewerSession[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [resetAfterLogin, setResetAfterLogin] = useState(false);
  const reviewerRaw = useRef<string | null>(null);
  const reviewerRef = useRef<ReviewerSession | undefined>(undefined);
  const [transferError, setTransferError] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mutex = useRef(false);
  const [code, setCode] = useState('');
  const [reviewer, setReviewer] = useState<FormalReviewer>('Jacky');
  const [choice, setChoice] = useState<Preference>();
  const [guideline, setGuideline] = useState('');
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
  function rememberReviewer(session: ReviewerSession, active = true) {
    session = { ...session, paused: !active };
    assert(
      localStorage.getItem(REVIEWER_KEY) === reviewerRaw.current,
      'Reviewer progress changed in another tab. Reload before continuing.',
    );
    const raw = JSON.stringify(session);
    localStorage.setItem(REVIEWER_KEY, raw);
    assert(localStorage.getItem(REVIEWER_KEY) === raw, 'Reviewer progress could not be saved.');
    reviewerRaw.current = raw;
    setSavedReviewer(session);
    reviewerRef.current = active ? session : undefined;
    setReviewerSession(active ? session : undefined);
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
      setOtherReviews(savedReviews());
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
        setSavedReviewer(session);
        if (!session.paused) {
          reviewerRef.current = session;
          setReviewerSession(session);
        }
        setReviewer(session.package.reviewer);
      }
      try {
        const health = await api('health');
        assert(
          health.catalogHash === database.catalogHash,
          'Hosted catalog differs from this browser build.',
        );
        if (health.appWorkflow !== 'joint-consensus-v2') {
          setHosting('local');
          setStatus(
            'Restart the Study service to use this update. Your browser progress is preserved.',
          );
          return;
        }
        setBackend(true);
        setHosting(health.transport === 'local' ? 'local' : 'hosted');
        // Reuse the existing server session after refresh; never store the access code.
        try {
          const remote = (await api('state')) as ProtocolState;
          validateState(remote, database);
          const current = cacheRef.current!;
          remember({
            state: current.dirty
              ? reconcile(current.base, current.state, remote, database)
              : remote,
            base: structuredClone(remote),
            dirty: current.dirty,
          });
          setAuthorized(true);
        } catch (e: any) {
          if (e.status !== 401) setStatus('Shared connection unavailable. Your progress is saved.');
        }
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
    setStatus('');
    if (next !== 'research') setSetupOpen(false);
    setView(next);
  }
  function study() {
    navigate(authorized || reviewerSession ? 'study' : 'gate');
  }
  function starter(reset = false) {
    if (busy || !db) return;
    if (
      reset &&
      !confirm(
        'Reset the main Study and return to the starter screen? Previous protocols and responses will be archived. Imported reviewer progress will remain saved.',
      )
    )
      return;
    if (reviewerRef.current) rememberReviewer(reviewerRef.current, false);
    setError('');
    setTransferError('');
    setStatus('');
    if (reset && authorized) {
      void change((next) =>
        formalStarted(next)
          ? replaceProtocol(next, db, 'Researcher reset from starter navigation', date())
          : resetCalibration(next, db, date()),
      ).then((ok) => {
        if (ok) navigate('study');
      });
    } else {
      setResetAfterLogin(reset);
      navigate(authorized ? 'study' : 'gate');
      if (reset)
        setStatus(
          'Enter the main Study access code to finish resetting. Imported reviewer progress is preserved.',
        );
    }
  }
  const routeContext = useRef({ authorized, reviewerSession });
  routeContext.current = { authorized, reviewerSession };
  useEffect(() => {
    const route = () => {
      const hash = location.hash;
      const { authorized, reviewerSession } = routeContext.current;
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
  }, []);
  useEffect(() => {
    if (view === 'gate' && (authorized || reviewerSession)) navigate('study');
  }, [authorized, reviewerSession, view]);
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
      if (resetAfterLogin) {
        assert(
          await change((next) =>
            formalStarted(next)
              ? replaceProtocol(next, db, 'Researcher reset from starter navigation', date())
              : resetCalibration(next, db, date()),
          ),
          'Study reset could not be saved.',
        );
        setResetAfterLogin(false);
      }
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
          setStatus('Saved on this device. It will sync when the connection returns.');
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
      const raw = await file.text();
      let session = await importStudy(raw, db);
      const current = reviewerRef.current ?? savedReviewer;
      const matches = (value: ReviewerSession) =>
        value.package.studyId === session.package.studyId &&
        value.package.reviewer === session.package.reviewer;
      const previous = current && matches(current) ? current : savedReviews().find(matches);
      if (previous) session = await importStudy(raw, db, previous);
      if (current && !matches(current)) {
        assert(
          localStorage.getItem(REVIEWER_KEY) === reviewerRaw.current,
          'Reviewer progress changed in another tab. Reload before continuing.',
        );
        keepReview(current);
        setOtherReviews(savedReviews());
      }
      rememberReviewer(session);
      setReviewer(session.package.reviewer);
      navigate('study');
      setStatus(
        current && !matches(current)
          ? 'Opened review. Your previous review is saved on this device.'
          : 'Review opened.',
      );
    } catch (e) {
      setTransferError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function sendStudy(r: FormalReviewer) {
    if (!s || !db) return;
    try {
      download(
        JSON.stringify(await exportStudy(s, r, db), null, 2),
        `code-choice-${r === 'Joint' ? 'joint-consensus' : r.toLowerCase()}.study.json`,
        'application/json',
      );
    } catch (e) {
      setTransferError(String(e));
    }
  }
  async function sendResult(session = reviewerRef.current ?? savedReviewer) {
    if (!session) return;
    download(
      JSON.stringify(await exportResult(session), null, 2),
      `code-choice-${session.package.reviewer === 'Joint' ? 'joint-consensus' : session.package.reviewer.toLowerCase()}-result.json`,
      'application/json',
    );
  }
  async function receiveResult(file: File, r: FormalReviewer) {
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
  const progress = (r: FormalReviewer) =>
    s?.formal ? `${activeAnswers(s, r).length} / ${configuredWorkload[r]}` : 'Not started';
  const displayReviewer = (r: FormalReviewer) => (r === 'Joint' ? 'Joint review' : r);
  const reviewTitle = (r: FormalReviewer) => (r === 'Joint' ? 'Review together' : `${r}’s review`);
  const reviewDone = (r: FormalReviewer) =>
    !!s?.formal && activeAnswers(s, r).length === configuredWorkload[r] && !s.pending[r];
  const allReviewsDone = FORMAL_REVIEWERS.every(reviewDone);
  const independentReady = !!s?.formal && (!configuredWorkload.joint || reviewDone('Joint'));
  function openReview(r: FormalReviewer) {
    setReviewer(r);
    navigate('formal');
  }
  async function beginCalibration() {
    if (!s || !db) return;
    if (s.calibration.lockedAt) {
      if (await change((next) => generateFormal(next, db, date()))) navigate('study');
    } else {
      setGuideline(s.calibration.guideline);
      navigate('calibration');
    }
  }
  async function finishCalibration() {
    if (!db) return;
    if (
      await change((next) => {
        next.calibration.guideline = guideline;
        lockCalibration(next, date());
        generateFormal(next, db, date());
      })
    )
      navigate('study');
  }
  async function viewResults() {
    if (!s || !db) return;
    if (
      s.unblindedAt ||
      (await change((next) => {
        validateState(next, db, true);
        next.unblindedAt = date();
      }))
    ) {
      navigate('research');
      if (backend)
        api('play')
          .then(setRemotePlay)
          .catch(() => {});
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
      <h2>Which code would you prefer to work with?</h2>
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
        {view !== 'formal' && view !== 'calibration' && (
          <nav aria-label="Application mode">
            <button onClick={study}>Study</button>
            <button
              onClick={() => {
                navigate('play');
                nextPlay();
              }}
              disabled={busy || !db}
            >
              Play
            </button>
          </nav>
        )}
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
        {status && !/^Saved/.test(status) && (
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
          <section className="setup-form v2-narrow study-entry">
            <div className="section-label">STUDY</div>
            <h1>Human review</h1>
            {savedReviewer && !reviewerSession && (
              <section className="study-step is-current">
                <h2>{reviewTitle(savedReviewer.package.reviewer)}</h2>
                <p>Your progress is saved on this device.</p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    rememberReviewer(savedReviewer);
                    setReviewer(savedReviewer.package.reviewer);
                    navigate('study');
                  }}
                >
                  Continue
                </button>
              </section>
            )}
            {hosting !== 'hosted' && (
              <section className="study-import">
                <p>Received a review file?</p>
                {fileControl('Open reviewer file', (file) => void receiveStudy(file))}
              </section>
            )}
            <form onSubmit={login}>
              <h2>{hosting === 'hosted' ? 'Open study' : 'Open main study'}</h2>
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
                Open study
              </button>
            </form>
            {hosting === 'hosted' && (
              <details>
                <summary>Use a review file</summary>
                {fileControl('Open reviewer file', (file) => void receiveStudy(file))}
              </details>
            )}
          </section>
        )}
        {s && view === 'study' && (
          <section className="v2-narrow guided-study">
            <div className="section-label">STUDY</div>
            <div className="study-heading">
              <h1>
                {reviewerSession ? reviewTitle(reviewerSession.package.reviewer) : 'Human review'}
              </h1>
              {!reviewerSession && (
                <button
                  className="text-action"
                  disabled={busy}
                  onClick={() => {
                    navigate('research');
                    setSetupOpen(true);
                  }}
                >
                  {formalStarted(s) ? 'Study setup' : 'Edit setup'}
                </button>
              )}
            </div>
            {reviewerSession ? (
              <>
                <p className="study-intro">
                  {reviewerSession.package.reviewer === 'Joint'
                    ? 'Review together and choose one shared answer.'
                    : 'Read both solutions and choose A, Equal or B.'}
                </p>
                <section
                  className="study-step is-current"
                  aria-label={`${reviewerSession.package.reviewer} review`}
                >
                  <h2>
                    {reviewDone(reviewerSession.package.reviewer)
                      ? 'You’re finished.'
                      : `${progress(reviewerSession.package.reviewer)} reviewed`}
                  </h2>
                  {reviewDone(reviewerSession.package.reviewer) ? (
                    <>
                      <p>Your answers are saved. Send the result back to the researcher.</p>
                      <button className="primary" onClick={() => void sendResult()}>
                        Save result for researcher
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => openReview(reviewerSession.package.reviewer)}
                    >
                      {activeAnswers(s, reviewerSession.package.reviewer).length ||
                      s.pending[reviewerSession.package.reviewer]
                        ? 'Continue'
                        : 'Start'}
                    </button>
                  )}
                </section>
                <div className="study-file-actions">
                  {fileControl('Open reviewer file', (file) => void receiveStudy(file))}
                  <button disabled={busy} onClick={() => starter()}>
                    Main study
                  </button>
                </div>
                <details>
                  <summary>Save current result</summary>
                  <button onClick={() => void sendResult()}>Save result for researcher</button>
                </details>
              </>
            ) : (
              <>
                <p className="study-intro">
                  Calibrate together. Review together. Then each do your own review.
                </p>
                <ol className="study-steps">
                  <li className={`study-step ${!s.formal ? 'is-current' : 'is-finished'}`}>
                    <div className="step-heading">
                      <span className="step-number">1</span>
                      <h2>Calibrate together</h2>
                      <span className="step-status">
                        {s.formal
                          ? 'Complete'
                          : `${s.calibration.answers.length} / ${configuredWorkload.calibration}`}
                      </span>
                    </div>
                    {!s.formal && (
                      <>
                        <p>Discuss examples and agree on what makes code easier to work with.</p>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void beginCalibration()}
                        >
                          {s.calibration.lockedAt ||
                          s.calibration.answers.length === configuredWorkload.calibration
                            ? 'Finish Calibration'
                            : s.calibration.answers.length
                              ? 'Continue Calibration'
                              : 'Start Calibration'}
                        </button>
                      </>
                    )}
                  </li>
                  {configuredWorkload.joint > 0 && (
                    <li
                      className={`study-step ${s.formal && !reviewDone('Joint') ? 'is-current' : reviewDone('Joint') ? 'is-finished' : ''}`}
                    >
                      <div className="step-heading">
                        <span className="step-number">2</span>
                        <h2>Review together</h2>
                        <span className="step-status">
                          {reviewDone('Joint')
                            ? 'Complete'
                            : s.formal
                              ? progress('Joint')
                              : `${configuredWorkload.joint} reviews`}
                        </span>
                      </div>
                      {s.formal && !reviewDone('Joint') && !s.unblindedAt && (
                        <>
                          <p>Choose one shared answer for each blinded comparison.</p>
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() => openReview('Joint')}
                          >
                            {activeAnswers(s, 'Joint').length
                              ? 'Continue together'
                              : 'Start together'}
                          </button>
                        </>
                      )}
                    </li>
                  )}
                  <li className={`study-step ${independentReady ? 'is-current' : ''}`}>
                    <div className="step-heading">
                      <span className="step-number">{configuredWorkload.joint > 0 ? 3 : 2}</span>
                      <h2>Review independently</h2>
                    </div>
                    {s.formal ? (
                      <div className="independent-reviewers">
                        {REVIEWERS.map((r) => (
                          <section key={r} className="reviewer-row" aria-label={`${r} review`}>
                            <div>
                              <h3>{r}</h3>
                              <p>
                                {progress(r)}
                                {reviewDone(r) ? ' · Complete' : ''}
                              </p>
                            </div>
                            {!reviewDone(r) && !s.unblindedAt && (
                              <div className="reviewer-actions">
                                <button
                                  className="primary"
                                  disabled={
                                    busy || (!independentReady && !activeAnswers(s, r).length)
                                  }
                                  onClick={() => openReview(r)}
                                >
                                  {activeAnswers(s, r).length || s.pending[r]
                                    ? 'Continue'
                                    : 'Review on this device'}
                                </button>
                                {hosting !== 'hosted' && (
                                  <>
                                    <button disabled={busy} onClick={() => void sendStudy(r)}>
                                      Send review to {r}
                                    </button>
                                    {fileControl(
                                      `Import ${r} result`,
                                      (file) => void receiveResult(file, r),
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </section>
                        ))}
                      </div>
                    ) : (
                      <p>{configuredWorkload.Jacky} reviews each · after reviewing together</p>
                    )}
                  </li>
                </ol>
                {s.formal && (
                  <section className={`study-results ${allReviewsDone ? 'is-ready' : ''}`}>
                    <h2>{allReviewsDone ? 'Review complete' : 'Results'}</h2>
                    <p>
                      {allReviewsDone
                        ? 'All answers are saved. Combine the reviews and see the results.'
                        : 'Available when the reviews are finished.'}
                    </p>
                    <button
                      className="primary"
                      disabled={busy || !allReviewsDone}
                      onClick={() => void viewResults()}
                    >
                      View results
                    </button>
                  </section>
                )}
                <div className="study-file-actions">
                  {hosting !== 'hosted' &&
                    fileControl('Open reviewer file', (file) => void receiveStudy(file))}
                  <details>
                    <summary>Study options</summary>
                    <button disabled={busy} onClick={() => starter(true)}>
                      Start over
                    </button>
                    <button onClick={() => navigate('research')}>Advanced</button>
                    {hosting === 'hosted' &&
                      fileControl('Open reviewer file', (file) => void receiveStudy(file))}
                  </details>
                </div>
              </>
            )}
          </section>
        )}
        {(view === 'study' || view === 'gate') && otherReviews.length > 0 && (
          <details className="v2-narrow saved-reviews">
            <summary>Other reviews saved on this device</summary>
            {otherReviews.map((session) => (
              <div
                className="reviewer-row"
                key={session.package.studyId + session.package.reviewer}
              >
                <span>
                  {displayReviewer(session.package.reviewer)} ·{' '}
                  {activeAnswers(session.state, session.package.reviewer).length} reviewed
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    void receiveStudy(
                      new File([JSON.stringify(session.package)], 'saved.study.json'),
                    )
                  }
                >
                  Open {displayReviewer(session.package.reviewer)} review
                </button>
                <button onClick={() => void sendResult(session)}>
                  Save {displayReviewer(session.package.reviewer)} result
                </button>
              </div>
            ))}
          </details>
        )}
        {s && view === 'formal' && (
          <>
            <div className="study-top">
              <div>
                <h1>
                  {reviewer === 'Joint' ? 'Review together' : reviewer} · {count} /{' '}
                  {configuredWorkload[reviewer]}
                </h1>
              </div>
              <button disabled={busy} onClick={() => navigate('study')}>
                Exit
              </button>
            </div>
            {presentation && (
              <details className="review-guideline">
                <summary>Review guideline</summary>
                <p>{s.calibration.guideline}</p>
              </details>
            )}
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
                <h2>You’re finished.</h2>
                <p>Your answers are saved.</p>
                {reviewerSession ? (
                  <button className="primary" onClick={() => void sendResult()}>
                    Save result for researcher
                  </button>
                ) : (
                  <button className="primary" onClick={() => navigate('study')}>
                    Back to study
                  </button>
                )}
                {reviewerSession &&
                  fileControl('Open reviewer file', (file) => void receiveStudy(file))}
              </section>
            )}
          </>
        )}
        {s && !reviewerSession && authorized && view === 'calibration' && (
          <>
            <div className="study-top">
              <div>
                <h1>
                  Calibration · {s.calibration.answers.length} / {configuredWorkload.calibration}
                </h1>
              </div>
              <button disabled={busy} onClick={() => navigate('study')}>
                Exit
              </button>
            </div>
            {presentation && (
              <details className="review-guideline">
                <summary>Review guideline</summary>
                <p>{s.calibration.guideline}</p>
              </details>
            )}
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
                    {s.calibration.answers.length === configuredWorkload.calibration
                      ? 'Agree guideline'
                      : 'Next'}
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
                          phase: 'joint_calibration',
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
            {!presentation && !calReveal && !s.calibration.lockedAt && (
              <section className="setup-form calibration-finish">
                <h2>Agree your guideline</h2>
                <p>Use this guideline for all the remaining reviews.</p>
                <label>
                  Review guideline
                  <textarea
                    aria-label="Review guideline"
                    rows={4}
                    value={guideline}
                    onChange={(e) => setGuideline(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  disabled={busy || !guideline.trim()}
                  onClick={() => void finishCalibration()}
                >
                  Finish Calibration
                </button>
              </section>
            )}
          </>
        )}
        {s && db && authorized && !reviewerSession && view === 'research' && (
          <section>
            <div className="page-title">
              <div>
                <div className="section-label">STUDY</div>
                <h1>
                  {s.unblindedAt && !setupOpen
                    ? 'Results'
                    : setupOpen
                      ? 'Study setup'
                      : 'Study options'}
                </h1>
              </div>
              <button onClick={() => navigate('study')}>Back to study</button>
            </div>
            {s.unblindedAt && !setupOpen && (
              <section className="research-summary">
                <h2>Review results</h2>
                <h3>All reviews</h3>
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
                <details className="results-by-reviewer">
                  <summary>Results by reviewer</summary>
                  {Object.entries({
                    'Joint review': analyse(s, db).jointConsensus,
                    Jacky: analyse(s, db).independent.Jacky,
                    Conrad: analyse(s, db).independent.Conrad,
                  }).map(([title, rows]) => (
                    <section key={title}>
                      <h3>{title}</h3>
                      <div className="summary-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Comparison</th>
                              <th>Ratings</th>
                              <th>Preferences</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr key={row.contrast}>
                                <th>{row.contrast}</th>
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
                    </section>
                  ))}
                </details>
                <h3>Independent overlap agreement</h3>
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
                  Agreement measures only the pairs Jacky and Conrad reviewed independently. Joint
                  answers are excluded. κ needs overlap and variation.
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
                  Export research data
                </button>
              </section>
            )}
            {setupOpen && (
              <ResearcherConfiguration
                state={s}
                db={db}
                busy={busy}
                onSave={async (config, criterion) => {
                  const ok = await change((next) =>
                    configureProtocol(next, db, config, criterion, date()),
                  );
                  if (ok) navigate('study');
                  return ok;
                }}
                onRegenerate={() => change((next) => regenerateFormal(next, db, date()))}
              />
            )}
            <details>
              <summary>Advanced</summary>
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
              {s.formal && !s.unblindedAt && (
                <div className="v2-actions">
                  {(configuredWorkload.joint > 0 ? FORMAL_REVIEWERS : REVIEWERS).map((r) => (
                    <div key={r}>
                      <button onClick={() => void sendStudy(r)}>
                        Export {r === 'Joint' ? 'Joint Consensus' : r} Study
                      </button>
                      {fileControl(
                        `Import ${r === 'Joint' ? 'Joint Consensus' : r} Result`,
                        (file) => void receiveResult(file, r),
                      )}
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
                                [
                                  ...Object.values(s.formal.assignments).flat(),
                                  ...(s.formal.joint ?? []),
                                ].flatMap((a) => [a.a, a.b]),
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
