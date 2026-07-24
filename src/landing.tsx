import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import NameDropShowcase from './components/NameDropShowcase';
import './index.css';
import './nameDrop/nameDrop.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NameDropShowcase />
  </StrictMode>,
);
