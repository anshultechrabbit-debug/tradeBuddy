import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
});

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('tb-theme') as Theme | null;
    return saved === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

// Apply theme to <html> immediately (before first render) to avoid flash
function applyTheme(t: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.documentElement.classList.toggle('light', t === 'light');
    document.body.style.backgroundColor = t === 'dark' ? '#070d1e' : '#f8fafc';
    document.body.style.color = t === 'dark' ? '#f8fafc' : '#0f172a';
  }
}

// Run synchronously before React renders
const _initial = getInitialTheme();
applyTheme(_initial);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(_initial);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem('tb-theme', theme);
    } catch {}
  }, [theme]);

  const setTheme = (next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  };

  const toggleTheme = () => {
    setThemeState((t) => {
      const next = t === 'light' ? 'dark' : 'light';
      applyTheme(next);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

