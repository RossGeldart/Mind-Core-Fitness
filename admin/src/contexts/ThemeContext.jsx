import { createContext, useContext, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

const ThemeContext = createContext();

// Sync native status bar appearance with current theme
async function syncStatusBar(isDark) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: '#00000000' });
  } catch (_) {
    // StatusBar plugin not available
  }
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    // Check localStorage for saved preference
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    // Check system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [accent, setAccentState] = useState(() => {
    return localStorage.getItem('accent') || 'red';
  });

  const [isMono, setIsMono] = useState(() => {
    return localStorage.getItem('mono') === 'true';
  });

  useEffect(() => {
    // Apply theme class to document
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    // Update native status bar to match theme
    syncStatusBar(isDark);
    // Update PWA theme-color meta tag to match
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#111114' : '#333331');
  }, [isDark]);

  useEffect(() => {
    // Apply accent globally and persist
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('accent', accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute('data-mono', isMono ? 'true' : 'false');
    localStorage.setItem('mono', isMono ? 'true' : 'false');
  }, [isMono]);

  const toggleTheme = () => {
    document.documentElement.setAttribute('data-theme-transitioning', '');
    setIsDark(!isDark);
    setTimeout(() => {
      document.documentElement.removeAttribute('data-theme-transitioning');
    }, 350);
  };
  const setAccent = (color) => setAccentState(color);
  const toggleMono = () => {
    document.documentElement.setAttribute('data-theme-transitioning', '');
    setIsMono(!isMono);
    setTimeout(() => {
      document.documentElement.removeAttribute('data-theme-transitioning');
    }, 350);
  };

  const value = {
    isDark,
    toggleTheme,
    accent,
    setAccent,
    isMono,
    toggleMono
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
