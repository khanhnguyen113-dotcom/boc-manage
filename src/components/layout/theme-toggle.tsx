'use client';

import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';
const THEME_CHANGE_EVENT = 'boc-theme-change';

function getThemeSnapshot(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function subscribeTheme(onStoreChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => 'light');

  function toggleTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('boc-theme', next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  const nextLabel = theme === 'light' ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-[var(--radius)] p-2 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
      aria-label={nextLabel}
      title={nextLabel}
    >
      {theme === 'light' ? <Moon aria-hidden className="size-4" /> : <Sun aria-hidden className="size-4" />}
    </button>
  );
}
