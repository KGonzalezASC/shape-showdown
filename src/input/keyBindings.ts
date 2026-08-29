export const BINDABLE_ACTIONS = [
  'moveLeft',
  'moveRight',
  'softDrop',
  'hardDrop',
  'rotateCW',
  'rotateCCW',
  'hold',
  'shop',
] as const;

export type BindableAction = (typeof BINDABLE_ACTIONS)[number];
export type KeyBindings = Record<BindableAction, string>;

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
  softDrop: 'ArrowDown',
  hardDrop: 'ArrowUp',
  rotateCW: 'KeyX',
  rotateCCW: 'KeyZ',
  hold: 'ShiftLeft',
  shop: 'KeyC',
};

export const ACTION_LABELS: Record<BindableAction, string> = {
  moveLeft: 'Move left',
  moveRight: 'Move right',
  softDrop: 'Soft drop',
  hardDrop: 'Hard drop',
  rotateCW: 'Rotate CW',
  rotateCCW: 'Rotate CCW',
  hold: 'Hold piece',
  shop: 'Shop',
};

const STORAGE_KEY = 'shape-showdown.keyBindings.v1';

export function formatKeyCode(code: string): string {
  switch (code) {
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'Space':
      return 'Space';
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'Shift';
    case 'ControlLeft':
    case 'ControlRight':
      return 'Ctrl';
    case 'AltLeft':
    case 'AltRight':
      return 'Alt';
    case 'MetaLeft':
    case 'MetaRight':
      return 'Meta';
    case 'Enter':
      return 'Enter';
    case 'Tab':
      return 'Tab';
    case 'Backspace':
      return 'Backspace';
    case 'Escape':
      return 'Esc';
    default:
      break;
  }
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3);
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad')) {
    return `Num${code.slice(6)}`;
  }
  return code;
}

const MODIFIER_SIBLING: Record<string, string> = {
  ShiftLeft: 'ShiftRight',
  ShiftRight: 'ShiftLeft',
  ControlLeft: 'ControlRight',
  ControlRight: 'ControlLeft',
  AltLeft: 'AltRight',
  AltRight: 'AltLeft',
};

export function actionForCode(
  bindings: KeyBindings,
  code: string,
): BindableAction | null {
  for (const action of BINDABLE_ACTIONS) {
    if (bindings[action] === code) return action;
  }
  const sibling = MODIFIER_SIBLING[code];
  if (!sibling) return null;
  // Prefer an exact binding on this code when both siblings are assigned.
  for (const action of BINDABLE_ACTIONS) {
    if (bindings[action] === sibling) return action;
  }
  return null;
}

export function parseKeyBindings(raw: unknown): KeyBindings {
  const result: KeyBindings = { ...DEFAULT_KEY_BINDINGS };
  if (raw === null || typeof raw !== 'object') return result;
  const record = raw as Record<string, unknown>;
  for (const action of BINDABLE_ACTIONS) {
    const value = record[action];
    if (typeof value === 'string' && value.length > 0) {
      result[action] = value;
    }
  }
  return result;
}

export function readStoredKeyBindings(): KeyBindings {
  if (typeof window === 'undefined') return { ...DEFAULT_KEY_BINDINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_KEY_BINDINGS };
    return parseKeyBindings(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_KEY_BINDINGS };
  }
}

export function writeStoredKeyBindings(bindings: KeyBindings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // Storage may be unavailable (private mode); bindings stay session-only.
  }
}

export function rebindKey(
  bindings: KeyBindings,
  action: BindableAction,
  code: string,
): KeyBindings {
  if (bindings[action] === code) return bindings;

  const next: KeyBindings = { ...bindings };
  for (const other of BINDABLE_ACTIONS) {
    if (other !== action && next[other] === code) {
      next[other] = bindings[action];
      break;
    }
  }
  next[action] = code;
  return next;
}

export function resetKeyBindings(): KeyBindings {
  return { ...DEFAULT_KEY_BINDINGS };
}

export function formatMovePair(bindings: KeyBindings): string {
  return `${formatKeyCode(bindings.moveLeft)} / ${formatKeyCode(bindings.moveRight)}`;
}
