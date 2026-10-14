import { createRoot } from 'react-dom/client';
import App from './App';
import V2App from './V2App';
import { useEffect, useState } from 'react';
import { isLegacyRequest } from './navigation';
import './styles.css';
import './product.css';
import './v2.css';
function Root() {
  const [legacy, setLegacy] = useState(() => isLegacyRequest(location.search));
  useEffect(() => {
    const route = () => setLegacy(isLegacyRequest(location.search));
    window.addEventListener('popstate', route);
    return () => window.removeEventListener('popstate', route);
  }, []);
  return legacy ? (
    <>
      <div className="legacy-banner">
        Historical V1 · <a href={import.meta.env.BASE_URL + '#home'}>Return to Code / Choice V2</a>
      </div>
      <App />
    </>
  ) : (
    <V2App />
  );
}
createRoot(document.getElementById('root')!).render(<Root />);
