import { useState } from 'react';

// Per-group collapsed state, persisted to localStorage. Groups default to collapsed;
// an entry of '1' means the user has opened it. Group ids are unique across kinds
// (single line_item_groups table), so they make safe keys.
const keyFor = (id: number) => `bf.group.${id}.open`;

export function useCollapsedGroup(id: number): { collapsed: boolean; toggle: () => void } {
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(keyFor(id)) === '1'; } catch { return false; }
  });
  const toggle = () => setOpen((prev) => {
    const next = !prev;
    try { localStorage.setItem(keyFor(id), next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });
  return { collapsed: !open, toggle };
}
