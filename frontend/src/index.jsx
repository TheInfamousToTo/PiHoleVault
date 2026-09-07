import React from 'react';
import ReactDOM from 'react-dom/client';

// Fonts are bundled rather than fetched from a CDN: the Content-Security-Policy
// in nginx.conf allows fonts from this origin only, and a Pi-hole is often on a
// network with no route to the internet.
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
