import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@zapengine/design-tokens/css/variables.css';

// Load order is the cascade here: nothing is scoped, so a later file wins.
// `App` is imported first because it side-imports the component-level CSS the
// page-level files below are meant to be able to override. Keeping every
// page-level sheet in this one list is deliberate: the previous arrangement
// side-imported one of them from `App.tsx`, which silently placed it *before*
// `styles.css` instead of after it.
import { App } from './App.js';
import './styles.css';
import './progressive-disclosure.css';
import './theme.css';
import './cards.css';
import './pages.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing root element');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
