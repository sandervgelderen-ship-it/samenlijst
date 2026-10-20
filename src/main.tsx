import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installDiagnostics } from './lib/diagnostics';
import { watchForUpdates } from './lib/updates';

installDiagnostics();
watchForUpdates();

// Installable web app: the service worker opens the app instantly, also offline.
// Not in the Android app (Capacitor serves the files itself) and not during development.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e) => console.warn('Service worker', e));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
