import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
});

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('tb-theme') as Theme | null;
    return saved === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

// Apply theme to <html> immediately (before first render) to avoid flash
function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  // Also sync body background instantly for no-flash
  document.body.style.background = t === 'dark' ? '#0a0f1e' : '#f7f8f9';
}

// Run synchronously before React renders
const _initial = getInitialTheme();
applyTheme(_initial);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(_initial);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem('tb-theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light';
      applyTheme(next); // immediate — don't wait for useEffect
      return next;
    });

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
