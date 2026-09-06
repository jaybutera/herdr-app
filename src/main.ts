import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { app } from './lib/store.svelte';

// Settings must be read before the first fetch, so the app mounts after them.
await app.init();

export default mount(App, { target: document.getElementById('app')! });
