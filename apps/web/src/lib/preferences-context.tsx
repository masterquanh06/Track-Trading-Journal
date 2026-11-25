'use client';

import * as React from 'react';
import { DICTIONARY, type Dictionary, type Locale } from './i18n';

export type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'tdt_theme';
const LOCALE_STORAGE_KEY = 'tdt_locale';
const SIDEBAR_STORAGE_KEY = 'tdt_sidebar_collapsed';

interface PreferencesContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: Dictionary;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

const PreferencesContext = React.createContext<PreferencesContextValue | null>(null);

function applyDomTheme(nextTheme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(nextTheme);
  root.style.colorScheme = nextTheme;
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemeMode>('dark');
  const [locale, setLocaleState] = React.useState<Locale>('vi');
  const [sidebarCollapsed, setSidebarCollapsedState] = React.useState<boolean>(false);

  // Hydrate saved preferences from localStorage once on mount
  React.useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setThemeState(savedTheme);
        applyDomTheme(savedTheme);
      } else {
        applyDomTheme('dark');
      }

      const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (savedLocale === 'vi' || savedLocale === 'en') {
        setLocaleState(savedLocale);
        document.documentElement.lang = savedLocale;
      }

      const savedSidebar = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (savedSidebar === 'true' || savedSidebar === 'false') {
        setSidebarCollapsedState(savedSidebar === 'true');
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const setTheme = React.useCallback((next: ThemeMode) => {
    setThemeState(next);
    applyDomTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = React.useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      applyDomTheme(next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const toggleLocale = React.useCallback(() => {
    setLocaleState((prev) => {
      const next: Locale = prev === 'vi' ? 'en' : 'vi';
      if (typeof document !== 'undefined') {
        document.documentElement.lang = next;
      }
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setSidebarCollapsed = React.useCallback((next: boolean) => {
    setSidebarCollapsedState(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setSidebarCollapsedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Optional keyboard shortcut: Ctrl+B / Cmd+B toggles sidebar cleanly
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSidebar]);

  const value = React.useMemo<PreferencesContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      locale,
      setLocale,
      toggleLocale,
      t: DICTIONARY[locale],
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebar,
    }),
    [theme, setTheme, toggleTheme, locale, setLocale, toggleLocale, sidebarCollapsed, setSidebarCollapsed, toggleSidebar],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = React.useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used inside PreferencesProvider');
  }
  return ctx;
}
