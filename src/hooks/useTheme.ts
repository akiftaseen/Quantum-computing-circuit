import { useEffect, useMemo, useState } from 'react';
import { UI_CONFIG } from '../logic/constants';

export type ThemeMode = 'light' | 'dark' | 'system';

const getInitialMode = (): ThemeMode => {
  const saved = localStorage.getItem(UI_CONFIG.THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
};

const resolveTheme = (mode: ThemeMode): 'light' | 'dark' => {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const useTheme = () => {
  const [mode, setMode] = useState<ThemeMode>(() => getInitialMode());

  const theme = useMemo(() => resolveTheme(mode), [mode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(UI_CONFIG.THEME_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      document.documentElement.setAttribute('data-theme', resolveTheme('system'));
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode]);

  const cycleThemeMode = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light'));
  };

  return { mode, theme, setMode, cycleThemeMode };
};
