import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import DesktopApp from '@/desktop/DesktopApp';
import { queryClient } from '@/lib/queryClient';

import '@/styles/globals.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found.');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <DesktopApp />
    </QueryClientProvider>
  </React.StrictMode>,
);
