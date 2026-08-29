import React from 'react';
import { useKeyBindings } from '../input/KeyBindingsProvider';
import { formatKeyCode } from '../input/keyBindings';

const DesktopKeyboardLegend: React.FC = () => {
  const bindings = useKeyBindings();

  const keyGroups = [
    {
      label: 'Move',
      keys: `${formatKeyCode(bindings.moveLeft)} ${formatKeyCode(bindings.moveRight)}`,
    },
    { label: 'Soft drop', keys: formatKeyCode(bindings.softDrop) },
    { label: 'Hard drop', keys: formatKeyCode(bindings.hardDrop) },
    { label: 'Rotate CCW', keys: formatKeyCode(bindings.rotateCCW) },
    { label: 'Rotate CW', keys: formatKeyCode(bindings.rotateCW) },
    { label: 'Hold piece', keys: formatKeyCode(bindings.hold) },
    { label: 'Shop', keys: formatKeyCode(bindings.shop) },
  ];

  return (
    <div className="desktop-keyboard-legend shrink-0 border border-[var(--ss-chrome-rule)] bg-[color-mix(in_srgb,var(--ss-panel-fill-muted)_95%,transparent)] p-2">
      {keyGroups.map(({ keys, label }) => (
        <React.Fragment key={label}>
          <kbd className="desktop-keyboard-legend-key">{keys}</kbd>
          <span className="desktop-keyboard-legend-label">{label}</span>
        </React.Fragment>
      ))}
    </div>
  );
};

export default React.memo(DesktopKeyboardLegend);
