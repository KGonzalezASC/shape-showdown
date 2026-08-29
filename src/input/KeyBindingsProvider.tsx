import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  type BindableAction,
  type KeyBindings,
  readStoredKeyBindings,
  rebindKey as applyRebind,
  resetKeyBindings as freshDefaults,
  writeStoredKeyBindings,
} from './keyBindings';

interface KeyBindingsContextValue {
  bindings: KeyBindings;
  rebind: (action: BindableAction, code: string) => void;
  reset: () => void;
}

const KeyBindingsContext = createContext<KeyBindingsContextValue>({
  bindings: freshDefaults(),
  rebind: () => {},
  reset: () => {},
});

export function KeyBindingsProvider({ children }: { children: React.ReactNode }) {
  const [bindings, setBindings] = useState<KeyBindings>(readStoredKeyBindings);

  const rebind = useCallback((action: BindableAction, code: string) => {
    setBindings((prev) => {
      const next = applyRebind(prev, action, code);
      writeStoredKeyBindings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = freshDefaults();
    writeStoredKeyBindings(next);
    setBindings(next);
  }, []);

  const value = useMemo<KeyBindingsContextValue>(
    () => ({ bindings, rebind, reset }),
    [bindings, rebind, reset],
  );

  return (
    <KeyBindingsContext.Provider value={value}>
      {children}
    </KeyBindingsContext.Provider>
  );
}

export function useKeyBindings(): KeyBindings {
  return useContext(KeyBindingsContext).bindings;
}

export function useRebindKey(): (action: BindableAction, code: string) => void {
  return useContext(KeyBindingsContext).rebind;
}

export function useResetKeyBindings(): () => void {
  return useContext(KeyBindingsContext).reset;
}
