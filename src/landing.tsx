import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import LandingShowcase from './components/LandingShowcase';
import { ThemeProvider } from './presentation/ThemeProvider';
import './index.css';

document.documentElement.dataset.page = 'landing';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LandingShowcase />
    </ThemeProvider>
  </StrictMode>,
);
