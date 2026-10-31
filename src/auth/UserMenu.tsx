import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '../ui';

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts.length > 1 ? parts[1][0].toUpperCase() : '');
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.email}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-2 text-[11px] font-bold text-text transition-colors hover:border-border-strong"
      >
        {initials(user.name, user.email)}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-60 rounded-card border border-border bg-surface p-2 shadow-pop"
        >
          <div className="border-b border-border px-2.5 pb-2.5 pt-1.5">
            {user.name && <p className="truncate text-[13px] font-semibold">{user.name}</p>}
            <p className="truncate text-[12px] text-muted">{user.email}</p>
          </div>
          <div className="pt-2">
            <Button variant="ghost" size="sm" block className="justify-start" onClick={() => logout()}>
              Sign out
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
