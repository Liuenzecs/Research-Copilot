import React from 'react';
import ReactDOM from 'react-dom/client';

import DesktopApp from '@/desktop/DesktopApp';

import '@/styles/globals.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found.');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <DesktopApp />
  </React.StrictMode>,
);
