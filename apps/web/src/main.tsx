import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import './lib/i18n';
import App from './App';

// Initial theme detection: stored preference > system preference > light.
const stored = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const isDark = stored === 'dark' || (!stored && prefersDark);
if (isDark) document.documentElement.classList.add('dark');

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
