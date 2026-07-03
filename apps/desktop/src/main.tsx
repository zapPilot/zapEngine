// Must stay the first import: injects env into app-core before any of its
// modules evaluate.
import './bootstrap/appCoreEnv';
import './app/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

import { App } from '@/app/App';
import { DesktopProviders } from '@/integration/DesktopProviders';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container #root was not found.');
}

createRoot(container).render(
  <StrictMode>
    <DesktopProviders>
      <HashRouter>
        <App />
      </HashRouter>
    </DesktopProviders>
  </StrictMode>,
);
