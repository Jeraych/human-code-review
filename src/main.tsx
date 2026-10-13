import { createRoot } from 'react-dom/client';
import App from './App';
import V2App from './V2App';
import './styles.css';
import './product.css';
import './v2.css';
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('v1') ? <App /> : <V2App />);
