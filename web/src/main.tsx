import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fontes empacotadas localmente: o app continua bonito sem internet.
import '@fontsource-variable/fraunces/full.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import 'katex/dist/katex.min.css';
import './styles.css';
import { StoreProvider } from './store';
import { App } from './App';
import { applyTheme, storedTheme } from './components/SettingsDialog';

applyTheme(storedTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
