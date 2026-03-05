import './app.css';

import {mount} from 'svelte';

import App from './App.svelte';

// Set the default theme. Can be overridden at runtime via the theme switcher.
const savedTheme = localStorage.getItem('theme') ?? 'consumer';
document.documentElement.dataset.theme = savedTheme;

mount(App, {
    target: document.getElementById('app') ?? document.body,
});
