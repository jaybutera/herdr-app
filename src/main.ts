import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { app } from './lib/store.svelte';
import { isTauri } from './lib/settings';

// Settings must be read before the first fetch, so the app mounts after them.
await app.init();

// The iPhone installs this bundle from the bridge's HTTPS origin rather than a
// package, and the worker is what makes that an app: it opens with the laptop
// asleep, and it is the only way iOS will post a notification (see public/sw.js).
// The APK skips it — Tauri serves the bundle from its own asset protocol, where
// there is no origin for a worker to own — and so does a dist/ opened over
// file://, where registration is not allowed and would only throw.
if (!isTauri() && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    /* an http origin or a browser without one: the app works, it just does not cache */
  });
}

export default mount(App, { target: document.getElementById('app')! });
