import React from 'react';

const Arrow: React.FC<{ dir: 'left' | 'right' | 'up' | 'down' }> = ({ dir }) => (
  <span className="desktop-keyboard-legend-arrow" aria-hidden>
    {dir === 'left' ? '←' : dir === 'right' ? '→' : dir === 'up' ? '↑' : '↓'}
  </span>
);

const KEY_GROUPS = [
  {
    label: 'Move',
    keys: (
      <>
        <Arrow dir="left" />
        <Arrow dir="right" />
      </>
    ),
  },
  { label: 'Soft drop', keys: <Arrow dir="down" /> },
  {
    label: 'Hard drop',
    keys: (
      <>
        <Arrow dir="up" />
        <span>/</span>
        <span>Space</span>
      </>
    ),
  },
  { label: 'Rotate', keys: 'Z / X' },
  { label: 'Storage', keys: 'Shift' },
  { label: 'Shop', keys: 'C' },
] as const;

const DesktopKeyboardLegend: React.FC = () => (
  <div className="desktop-keyboard-legend shrink-0 border border-[var(--ss-chrome-rule)] bg-[color-mix(in_srgb,var(--ss-panel-fill-muted)_95%,transparent)] p-2">
    {KEY_GROUPS.map(({ keys, label }) => (
      <React.Fragment key={label}>
        <kbd className="desktop-keyboard-legend-key">{keys}</kbd>
        <span className="desktop-keyboard-legend-label">{label}</span>
      </React.Fragment>
    ))}
  </div>
);

export default React.memo(DesktopKeyboardLegend);
