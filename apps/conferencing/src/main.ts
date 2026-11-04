import './app.css';

import {mount} from 'svelte';

import App from './App.svelte';

// Set the default branding.
const savedBranding = localStorage.getItem('branding') ?? 'consumer';
document.documentElement.dataset.branding = savedBranding;

mount(App, {
    target: document.getElementById('app') ?? document.body,
});
