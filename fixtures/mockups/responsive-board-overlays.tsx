import React from 'react';
import { createRoot } from 'react-dom/client';
import { statusPillClass } from '../../src/ui/shapeShowdownTheme';
import '../../src/index.css';

const root = document.querySelector('#root');
if (!(root instanceof HTMLElement)) throw new Error('Missing repro root');

const requestedWidth = Number(new URLSearchParams(window.location.search).get('width'));
const boardWidth = Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : 120;

root.style.width = '400px';
createRoot(root).render(
  <div className="game-field-shell" style={{ width: 400 }}>
    <div
      className="game-board-shell relative overflow-hidden border"
      style={{ width: boardWidth, height: 216 }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
        <span className={`landing-forecast-label ${statusPillClass('white')}`}>
          Landing forecast
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-24 border-t-2 border-dashed border-white/90" />
      <div className={`swap-line-label ${statusPillClass('white')} pointer-events-none absolute right-1 top-24 -translate-y-1/2`}>
        swap line
      </div>
    </div>
  </div>,
);
