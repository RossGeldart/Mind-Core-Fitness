import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

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

  useEffect(() => {
    // Apply theme class to document
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    // Apply accent colour
    if (accent === 'red') {
      document.documentElement.removeAttribute('data-accent');
    } else {
      document.documentElement.setAttribute('data-accent', accent);
    }
    localStorage.setItem('accent', accent);
  }, [accent]);

  const toggleTheme = () => setIsDark(!isDark);
  const setAccent = (color) => setAccentState(color);

  const value = {
    isDark,
    toggleTheme,
    accent,
    setAccent
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
