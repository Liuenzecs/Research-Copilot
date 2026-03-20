import React from 'react';
import ReactDOM from 'react-dom/client';

import DesktopApp from '@/desktop/DesktopApp';
import { initializeRuntimeConfig } from '@/lib/runtime';

import '@/styles/globals.css';

async function bootstrap() {
  await initializeRuntimeConfig();

  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root element #root not found.');
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <DesktopApp />
    </React.StrictMode>,
  );
}

void bootstrap();
