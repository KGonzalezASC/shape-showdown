import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import NameDropShowcase from './components/NameDropShowcase';
import './index.css';
import './nameDrop/nameDrop.css';

// Keep this feature gate obvious so the public URL input can be disabled in one edit.
const NAME_DROP_URL_PARAM_ENABLED = true;
const LANDING_NAME = 'Keith Gonzalez';

function landingNameFromUrl(): string | undefined {
  if (!NAME_DROP_URL_PARAM_ENABLED || typeof window === 'undefined') return undefined;
  return new URLSearchParams(window.location.search).get('name') ?? undefined;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NameDropShowcase name={landingNameFromUrl() ?? LANDING_NAME} />
  </StrictMode>,
);
