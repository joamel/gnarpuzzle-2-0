import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
// PWA DISABLED for development to avoid WebSocket conflicts
// import { initPWA } from './utils/pwa';
// import './styles/pwa.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);