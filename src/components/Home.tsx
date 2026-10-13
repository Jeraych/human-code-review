export default function Home({
  onPlay,
  onStudy,
  onResume,
  activeStudy,
  ready,
}: {
  onPlay: () => void;
  onStudy: () => void;
  onResume: () => void;
  activeStudy: boolean;
  ready: boolean;
}) {
  return (
    <section className="home">
      <div className="home-copy">
        <p className="eyebrow">CODE / CHOICE</p>
        <h1>
          Two implementations.
          <br />
          <span>Your call.</span>
        </h1>
        <p className="home-intro">
          Two AI-generated implementations. Which one would you rather work with?
        </p>
        {activeStudy ? (
          <div className="home-resume">
            <h2>Your study is waiting.</h2>
            <p>
              Continue your saved evaluation before playing. Play reveals conditions from
              overlapping examples.
            </p>
            <button className="primary" onClick={onResume}>
              Resume study <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : (
          <>
            <button className="primary home-play" onClick={onPlay} disabled={!ready}>
              Play <span aria-hidden="true">→</span>
            </button>
            <p className="home-detail">No account. No right answer. Just your preference.</p>
          </>
        )}
        <div className="home-research">
          <span>Research participant?</span>
          <button onClick={onStudy}>
            Enter Study <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      <div className="home-illustration" aria-hidden="true">
        <div className="mock-editor">
          <div className="mock-editor-title">
            <span>Choose the code you would keep</span>
            <span>01 / ?</span>
          </div>
          <div className="mock-comparison">
            {['A', 'B'].map((letter) => (
              <div className="mock-code" key={letter}>
                <span className="mock-letter">{letter}</span>
                <div className="mock-lines">
                  {[76, 48, 89, 60, 34, 70, 50].map((width, i) => (
                    <i key={i} style={{ width: `${width}%` }} />
                  ))}
                </div>
                <span className="mock-choice">Your choice →</span>
              </div>
            ))}
          </div>
          <div className="mock-caption">Read → choose → reveal → repeat</div>
        </div>
      </div>
      <div className="home-how">
        <div>
          <span>01</span>
          <h2>Read both</h2>
          <p>One task. Two anonymous implementations.</p>
        </div>
        <div>
          <span>02</span>
          <h2>Make your choice</h2>
          <p>Pick a card, or call it equal or both poor.</p>
        </div>
        <div>
          <span>03</span>
          <h2>See the reveal</h2>
          <p>Discover the conditions. Compare again.</p>
        </div>
      </div>
    </section>
  );
}
