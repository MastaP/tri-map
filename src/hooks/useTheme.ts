import { useCallback, useLayoutEffect, useState } from 'react';
import { readStorage, writeStorage } from '../lib/storage.ts';
import { useMediaQuery } from './useMediaQuery.ts';

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'trimap.theme';

/** Browser chrome colour: the header surface of each theme. */
export const THEME_COLOR: Record<Theme, string> = { light: '#ffffff', dark: '#0f141d' };

function readPref(): ThemePref {
  const v = readStorage(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme: Theme = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    writeStorage(KEY, p === 'system' ? null : p);
  }, []);

  return { pref, theme, setPref };
}
