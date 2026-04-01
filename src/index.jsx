import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AppProvider } from './state/AppContext.jsx';

let el = document.getElementById('root');
if (!el) {
  el = document.createElement('div');
  el.id = 'root';
  document.body.appendChild(el);
}
const root = createRoot(el);
root.render(
  <AppProvider>
    <App />
  </AppProvider>,
);
