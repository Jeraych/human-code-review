import { useEffect, useState } from 'react';
import {
  configuration,
  configureProtocol,
  CONTRASTS,
  formalStarted,
  protocolEdition,
  workload,
} from '../v2';
import type { Catalog, ProtocolConfig, ProtocolState } from '../v2';

export default function ResearcherConfiguration({
  state,
  db,
  busy,
  onSave,
  onReset,
  onRegenerate,
  onReplace,
  onDraftChange,
}: {
  state: ProtocolState;
  db: Catalog;
  busy: boolean;
  onSave: (config: ProtocolConfig, guideline: string) => Promise<boolean>;
  onReset: () => Promise<boolean>;
  onRegenerate: () => Promise<boolean>;
  onReplace: (reason: string) => Promise<boolean>;
  onDraftChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(configuration(state)));
  const [criterion, setCriterion] = useState(state.calibration.guideline);
  const [reason, setReason] = useState('');
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
  useEffect(
    () => onDraftChange(!frozen && (dirty || !!problem)),
    [dirty, problem, frozen, onDraftChange],
  );
  const amount = (value: number) => (Number.isFinite(value) && value >= 0 ? value : '—');
  const numberControl = (
    label: string,
    key: 'calibrationPerContrast' | 'formalPerContrast' | 'overlapPerContrast' | 'seed',
    min: number,
  ) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        step={1}
        max={key === 'seed' ? 4294967295 : undefined}
        value={Number.isFinite(shown[key]) ? shown[key] : ''}
        onChange={(e) =>
          setDraft({ ...draft, [key]: e.target.value === '' ? NaN : Number(e.target.value) })
        }
      />
    </label>
  );
  return (
    <section className="setup-form protocol-configuration" aria-labelledby="protocol-config-title">
      <h2 id="protocol-config-title">Protocol configuration</h2>
      <p>
        {frozen
          ? `Active frozen configuration · Edition ${protocolEdition(state)}. Formal has started; edits require explicit invalidation and replacement.`
          : `Edition ${protocolEdition(state)} · Editable until the first Formal response.`}
      </p>
      <fieldset disabled={frozen || busy}>
        <legend>Contrasts</legend>
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
              <small>{db.stats[c].eligible} eligible in frozen pool</small>
            </label>
          ))}
        </div>
        <div className="protocol-numbers">
          {numberControl('Calibration pairs per enabled contrast', 'calibrationPerContrast', 0)}
          {numberControl('Formal distinct pairs per enabled contrast', 'formalPerContrast', 1)}
          {numberControl('Overlap pairs per enabled contrast', 'overlapPerContrast', 0)}
          {numberControl('Randomisation seed', 'seed', 0)}
        </div>
        <label htmlFor="researcher-criterion">Reviewer criterion / guideline</label>
        <textarea
          id="researcher-criterion"
          rows={4}
          value={frozen ? state.calibration.guideline : criterion}
          onChange={(e) => setCriterion(e.target.value)}
        />
      </fieldset>
      <div className="protocol-preview" aria-live="polite">
        <h3>Workload preview</h3>
        {dirty && !frozen && (
          <p className="hint">
            Preview uses unsaved changes. Progress below uses the active saved configuration.
          </p>
        )}
        <p>Enabled contrasts: {shown.contrasts.length}</p>
        <dl>
          <dt>Calibration</dt>
          <dd>
            {amount(shown.calibrationPerContrast)} / contrast · {amount(preview.calibration)} total
          </dd>
          <dt>Formal</dt>
          <dd>
            {amount(shown.formalPerContrast)} / contrast · {amount(preview.distinct)} distinct pairs
          </dd>
          <dt>Overlap</dt>
          <dd>
            {amount(shown.overlapPerContrast)} / contrast · {amount(preview.overlap)} double-rated
            pairs
          </dd>
          <dt>Jacky</dt>
          <dd>{amount(preview.Jacky)} ratings</dd>
          <dt>Conrad</dt>
          <dd>{amount(preview.Conrad)} ratings</dd>
        </dl>
        <p className="hint">
          Holdout only; both solutions passed correctness tests; exact-identical code excluded from
          the displayed sample and retained in research counts. Task/seed coverage and A/B balance
          are automatic.
        </p>
      </div>
      {problem && <p role="alert">{problem}</p>}
      {!frozen && (
        <>
          <p className="hint">
            Changing contrasts or Calibration count restarts Calibration. Other edits keep
            Calibration and clear any unstarted Formal assignment. Previous protocols and responses
            stay archived.
          </p>
          <button
            className="primary"
            disabled={busy || !dirty || !!problem}
            onClick={() => {
              if (
                (state.calibration.answers.length || state.calibration.lockedAt || state.formal) &&
                !confirm(
                  'Save this configuration as a new protocol edition? Previous records are preserved. Changes to contrasts or Calibration count reset Calibration; unstarted Formal assignments are cleared.',
                )
              )
                return;
              void onSave(draft, criterion);
            }}
          >
            Save configuration
          </button>
          <div className="v2-actions">
            <button
              disabled={busy || dirty || !!problem}
              onClick={() => {
                if (
                  confirm(
                    'Reset/regenerate Calibration and clear unstarted Formal assignments? Previous records are preserved, and previous Calibration pairs remain excluded from Formal.',
                  )
                )
                  void onReset();
              }}
            >
              Reset / regenerate Calibration
            </button>
            <button
              disabled={busy || dirty || !!problem || !state.formal}
              onClick={() => {
                if (
                  confirm(
                    'Regenerate unstarted Formal assignments? The previous assignment is archived. No Formal response has started.',
                  )
                )
                  void onRegenerate();
              }}
            >
              Regenerate unstarted Formal
            </button>
          </div>
        </>
      )}
      {frozen && (
        <details>
          <summary>Advanced / Recovery — protocol replacement</summary>
          <p>
            Invalidate this active protocol and start a new edition. Its configuration, assignments,
            responses and audit records are retained. The replacement starts at Calibration.
          </p>
          <label>
            Protocol replacement reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button
            disabled={busy || reason.trim().length < 3}
            onClick={() => {
              if (
                confirm(
                  'Invalidate the active protocol and create a replacement edition? All previous protocol data is preserved; the new edition requires Calibration and Formal generation.',
                )
              )
                void onReplace(reason);
            }}
          >
            Invalidate active protocol &amp; create replacement
          </button>
        </details>
      )}
      {!!state.archives?.length && (
        <details>
          <summary>Protocol history · {state.archives.length} archived editions</summary>
          {state.archives.map((a) => (
            <article key={protocolEdition(a.state)}>
              <p>
                Edition {protocolEdition(a.state)} · {a.disposition} · {a.at}
              </p>
              <p>{a.reason}</p>
              <details>
                <summary>Archived configuration, assignments and responses</summary>
                <pre className="v2-json">{JSON.stringify(a.state, null, 2)}</pre>
              </details>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
