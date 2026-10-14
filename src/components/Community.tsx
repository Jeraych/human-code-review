import type { CommunityStats, Distribution } from '../playV2';
import type { DatabaseV2, Preference, Presentation } from '../v2';

function Bars({
  data,
  options,
  chosen,
}: {
  data: Distribution;
  options: [string, string][];
  chosen?: string;
}) {
  return (
    <div className="community-bars">
      {options.map(([key, label], i) => {
        const count = data.preferences[key] || 0,
          percent = data.total ? Math.round((count / data.total) * 100) : 0;
        return (
          <div key={key} className={`community-row tone-${i}`}>
            <div>
              <span>
                {label}
                {chosen === key ? ' · Your choice' : ''}
              </span>
              <span>
                {percent}% <small>({count})</small>
              </span>
            </div>
            <div className="community-track" aria-hidden="true">
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
export default function Community({
  stats,
  state,
  play,
  choice,
  db,
  retry,
}: {
  stats?: CommunityStats;
  state: string;
  play: Presentation;
  choice: Preference;
  db: DatabaseV2;
  retry: () => void;
}) {
  const a = db.outputs[play.a].condition,
    b = db.outputs[play.b].condition;
  return (
    <section className="community" aria-label="Community preferences" aria-live="polite">
      <div className="community-heading">
        <h2>How the community voted</h2>
        <span>{stats ? `${stats.pair.total} recorded votes on this pair` : ''}</span>
      </div>
      {state === 'loading' ? (
        <p>Loading community votes…</p>
      ) : !stats ? (
        <p>
          Community votes are unavailable. Keep playing, or{' '}
          <button className="text-action" onClick={retry}>
            Try again
          </button>
          .
        </p>
      ) : (
        <>
          {stats.pair.total === 0 ? (
            <p>No recorded votes on this pair yet.</p>
          ) : (
            <Bars
              data={stats.pair}
              options={[
                [a, `A · ${a}`],
                ['Equal', 'Equal'],
                [b, `B · ${b}`],
              ]}
              chosen={choice === 'Equal' ? 'Equal' : choice === 'A' ? a : b}
            />
          )}
          <p className="hint">
            {stats.pair.total < 10
              ? 'A small sample; preferences can change as more people play. '
              : ''}
            Anonymous Play votes describe preferences, not a correct answer.
          </p>
          <details>
            <summary>Across Play · {stats.total.toLocaleString()} recorded votes</summary>
            <div className="community-overall">
              {Object.entries(stats.contrasts).map(([contrast, d]) => (
                <section key={contrast}>
                  <h3>
                    {contrast.replace('-', ' / ')} <small>· {d.total} votes</small>
                  </h3>
                  <Bars
                    data={d}
                    options={[
                      [contrast.split('-')[0], contrast.split('-')[0]],
                      ['Equal', 'Equal'],
                      [contrast.split('-')[1], contrast.split('-')[1]],
                    ]}
                  />
                </section>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
