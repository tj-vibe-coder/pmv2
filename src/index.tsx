import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register the service worker so the app can open offline (site clock-in/out).
// Production only: dev bundles aren't content-hashed, so the SW's cache-first asset
// handler serves stale bundle.js after a rebuild and HMR falls into a reload loop.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/service-worker.js').catch(() => { /* offline support is best-effort */ });
    } else {
      // Heal browsers that registered the SW before this gate existed.
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    }
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
