import { useState } from 'react';

// Collapsed state for a named, top-level section, persisted to localStorage.
// Sections default to expanded; pass defaultCollapsed=true to start closed.
export function useCollapsed(key: string, defaultCollapsed = false): { collapsed: boolean; toggle: () => void } {
  const storageKey = `bf.collapsed.${key}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v == null ? defaultCollapsed : v === '1';
    } catch { return defaultCollapsed; }
  });
  const toggle = () => setCollapsed((prev) => {
    const next = !prev;
    try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });
  return { collapsed, toggle };
}
