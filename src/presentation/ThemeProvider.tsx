import React, { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';
import {
  DEFAULT_THEME_ID,
  parseThemeId,
  readThemeIdFromLocation,
  resolveThemePackage,
  type ThemeId,
  type ThemePackage,
} from './themePackage';

const STORAGE_KEY = 'ss-theme';

interface ThemeContextValue {
  theme: ThemePackage;
  setThemeId: (id: ThemeId) => void;
}

const ThemePackageContext = createContext<ThemeContextValue>({
  theme: resolveThemePackage(DEFAULT_THEME_ID),
  setThemeId: () => {},
});

function readStoredThemeId(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  const fromQuery = readThemeIdFromLocation(window.location.search);
  if (fromQuery) return fromQuery;
  try {
    return parseThemeId(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(readStoredThemeId);
  const theme = useMemo(() => resolveThemePackage(themeId), [themeId]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme.id;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
      /* ignore quota / private-mode */
    }
  }, [theme.id]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setThemeId }),
    [theme]
  );

  return (
    <ThemePackageContext.Provider value={value}>
      {children}
    </ThemePackageContext.Provider>
  );
}

export function useThemePackage(): ThemePackage {
  return useContext(ThemePackageContext).theme;
}

export function useSetThemeId(): (id: ThemeId) => void {
  return useContext(ThemePackageContext).setThemeId;
}
