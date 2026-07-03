// Must stay the first import: injects env into app-core before any of its
// modules evaluate.
import './bootstrap/appCoreEnv';
import './app/globals.css';

import { isDesktopRuntime } from '@zapengine/app-core/lib/env/runtimeEnv';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';

import { App } from '@/app/App';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container #root was not found.');
}

const Router = isDesktopRuntime() ? HashRouter : BrowserRouter;

createRoot(container).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
