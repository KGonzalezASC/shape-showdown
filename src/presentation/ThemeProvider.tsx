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

const ThemePackageContext = createContext<ThemePackage>(resolveThemePackage(DEFAULT_THEME_ID));

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
  const [themeId] = useState<ThemeId>(readStoredThemeId);
  const theme = useMemo(() => resolveThemePackage(themeId), [themeId]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme.id;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
      /* ignore quota / private-mode */
    }
  }, [theme.id]);

  return (
    <ThemePackageContext.Provider value={theme}>
      {children}
    </ThemePackageContext.Provider>
  );
}

export function useThemePackage(): ThemePackage {
  return useContext(ThemePackageContext);
}
