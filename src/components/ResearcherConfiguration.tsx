import { useEffect, useState } from 'react';
import {
  configuration,
  configureProtocol,
  CONTRASTS,
  formalStarted,
  protocolEdition,
  workload,
  calibrationExclusions,
} from '../v2';
import type { Catalog, ProtocolConfig, ProtocolState } from '../v2';
export default function ResearcherConfiguration({
  state,
  db,
  busy,
  onSave,
  onRegenerate,
}: {
  state: ProtocolState;
  db: Catalog;
  busy: boolean;
  onSave: (config: ProtocolConfig, guideline: string) => Promise<boolean>;
  onRegenerate: () => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => structuredClone(configuration(state)));
  const [criterion, setCriterion] = useState(state.calibration.guideline);
  const savedConfig = JSON.stringify(configuration(state));
  useEffect(() => {
    setDraft(structuredClone(configuration(state)));
    setCriterion(state.calibration.guideline);
  }, [savedConfig, state.calibration.guideline, state.edition]);
  const frozen = formalStarted(state),
    shown = frozen ? configuration(state) : draft;
  const preview = workload(shown);
  const dirty = savedConfig !== JSON.stringify(draft) || criterion !== state.calibration.guideline;
  let problem = '';
  try {
    const candidate = structuredClone(state);
    if (!frozen) configureProtocol(candidate, db, draft, criterion, new Date().toISOString());
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }
  const amount = (n: number) => (Number.isFinite(n) && n >= 0 ? n : '—');
  const totals = shown.totals ?? {
    calibration: preview.calibration,
    joint: 0,
    independent: Math.max(preview.Jacky, preview.Conrad),
    overlap: preview.overlap,
  };
  const totalControl = (label: string, key: keyof typeof totals) => (
    <label>
      {label}
      <input
        type="number"
        min={0}
        step={1}
        disabled={frozen || busy}
        value={Number.isFinite(totals[key]) ? totals[key] : ''}
        onChange={(e) =>
          setDraft({
            ...draft,
            totals: { ...totals, [key]: e.target.value === '' ? NaN : Number(e.target.value) },
          })
        }
      />
    </label>
  );
  const excluded = calibrationExclusions(state);
  async function save() {
    if (
      (state.calibration.answers.length || state.calibration.lockedAt || state.formal) &&
      !confirm(
        'Save this setup? Changed comparisons or Calibration count restart Calibration. Unstarted assignments are cleared. Previous records are preserved.',
      )
    )
      return;
    await onSave(draft, criterion);
  }
  return (
    <section className="setup-form protocol-configuration" aria-label="Study setup">
      {frozen && <p className="hint">Study started · setup is frozen.</p>}
      <fieldset disabled={frozen || busy}>
        <legend>Comparisons</legend>
        <div className="protocol-contrasts">
          {CONTRASTS.map((c) => (
            <label key={c}>
              <input
                type="checkbox"
                checked={shown.contrasts.includes(c)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    contrasts: CONTRASTS.filter((x) =>
                      x === c ? e.target.checked : draft.contrasts.includes(x),
                    ),
                  })
                }
              />
              {c.replace('-', ' vs ')}
            </label>
          ))}
        </div>
        <div className="protocol-numbers">
          {totalControl('Calibration', 'calibration')}
          {totalControl('Joint review', 'joint')}
          {totalControl('Independent · each', 'independent')}
          {totalControl('Overlap', 'overlap')}
        </div>
      </fieldset>
      <div className="protocol-preview" aria-live="polite">
        <h3>Workload preview</h3>
        <p>Calibration: {amount(preview.calibration)} pairs</p>
        <p>Joint formal ratings: {amount(preview.joint)}</p>
        <p>Formal ratings total: {amount(preview.ratings)}</p>
        <p>Formal distinct pairs: {amount(preview.distinct)}</p>
        <div className="workload-line">
          <span>Jacky independent: {amount(preview.Jacky)}</span>
          <span>Conrad independent: {amount(preview.Conrad)}</span>
          <span>Overlap: {amount(preview.overlap)}</span>
        </div>
      </div>
      {problem && <p role="alert">{problem}</p>}
      <div className="v2-actions">
        {!frozen && (
          <button className="primary" disabled={busy || !!problem} onClick={save}>
            Save setup
          </button>
        )}
      </div>
      <details>
        <summary>Advanced</summary>
        <label>
          Randomisation seed
          <input
            type="number"
            min={0}
            max={4294967295}
            step={1}
            disabled={frozen || busy}
            value={shown.seed}
            onChange={(e) =>
              setDraft({ ...draft, seed: e.target.value === '' ? NaN : Number(e.target.value) })
            }
          />
        </label>
        {!shown.totals && (
          <p>
            Historical per-comparison setup retained. Editing totals explicitly replaces this setup;
            existing responses stay archived.
          </p>
        )}
        <div className="summary-scroll">
          <table>
            <thead>
              <tr>
                <th>Comparison</th>
                <th>Eligible pool</th>
                <th>After Calibration/history</th>
                <th>Available for Independent</th>
              </tr>
            </thead>
            <tbody>
              {CONTRASTS.map((c) => {
                const pool = db.pairs.filter((p) => p.eligible && p.contrast === c),
                  unused = pool.filter((p) => !excluded.has(p.pairId)),
                  jointIds = new Set(state.formal?.joint?.map((p) => p.pairId));
                return (
                  <tr key={c}>
                    <td>{c}</td>
                    <td>{pool.length}</td>
                    <td>{unused.length}</td>
                    <td>{unused.filter((p) => !jointIds.has(p.pairId)).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label htmlFor="researcher-criterion">Reviewer criterion / guideline</label>
        <textarea
          id="researcher-criterion"
          rows={4}
          disabled={frozen || busy}
          value={frozen ? state.calibration.guideline : criterion}
          onChange={(e) => setCriterion(e.target.value)}
        />
        <p className="hint">
          Holdout only; both solutions correctness-pass; exact-identical pairs excluded from ratings
          and retained in research counts. Task breadth, seed balance and A/B balance are automatic.
        </p>
        <div className="v2-actions">
          {!frozen && state.formal && (
            <button
              disabled={busy || dirty || !!problem}
              onClick={() => {
                if (
                  confirm(
                    'Regenerate these unstarted assignments? The previous assignment will remain in history.',
                  )
                )
                  void onRegenerate();
              }}
            >
              Regenerate unstarted Study
            </button>
          )}
        </div>
        <p>
          Protocol edition: {protocolEdition(state)} · {state.archives?.length ?? 0} archived
        </p>
        <details>
          <summary>Protocol history</summary>
          <pre className="v2-json">{JSON.stringify(state.archives ?? [], null, 2)}</pre>
        </details>
      </details>
    </section>
  );
}
