import React from 'react';

const KEY_GROUPS = [
  { keys: '← →', label: 'Move' },
  { keys: '↓', label: 'Soft drop' },
  { keys: '↑ / Space', label: 'Hard drop' },
  { keys: 'Z / X', label: 'Rotate' },
  { keys: 'Shift', label: 'Storage' },
  { keys: 'C', label: 'Shop' },
] as const;

const DesktopKeyboardLegend: React.FC = () => (
  <div className="desktop-keyboard-legend shrink-0 grid-cols-1 gap-1 border border-[#303535] bg-[#171919]/95 p-2">
    {KEY_GROUPS.map(({ keys, label }) => (
      <div key={label} className="flex items-center gap-1.5 text-zinc-500">
        <kbd className="min-w-8 border border-[#373b3b] bg-[#2a2d2d] px-2 py-1 font-mono text-[9px] text-zinc-300">
          {keys}
        </kbd>
        <span className="text-[8px] font-bold uppercase tracking-wider">{label}</span>
      </div>
    ))}
  </div>
);

export default React.memo(DesktopKeyboardLegend);
