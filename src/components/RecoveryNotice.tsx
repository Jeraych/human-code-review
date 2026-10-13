import { explainProblem } from '../feedback';
export default function RecoveryNotice({
  error,
  onBackup,
  onSetup,
}: {
  error: string;
  onBackup: () => void;
  onSetup?: () => void;
}) {
  const problem = explainProblem(error);
  return (
    <section className="alert recovery-notice" role="alert">
      <strong>{problem.title}</strong>
      <p>{problem.message}</p>
      <div className="actions">
        <button onClick={onBackup}>Download recovery backup</button>
        <button onClick={() => location.reload()}>Reload page</button>
        {onSetup && <button onClick={onSetup}>Researcher setup</button>}
      </div>
      <details>
        <summary>Details for the researcher</summary>
        <pre>{error.replace(/^Error:\s*/, '')}</pre>
      </details>
    </section>
  );
}
