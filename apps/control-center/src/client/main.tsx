import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@zapengine/design-tokens/css/variables.css';

import { App } from './App.js';
import './styles.css';
import './progressive-disclosure.css';
import './components/PodcastPipelineView.css';
import './components/domain-visualizations.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing root element');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
