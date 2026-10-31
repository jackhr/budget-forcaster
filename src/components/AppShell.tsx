import { useEffect, useState } from 'react';
import { cx } from '../ui';
import UserMenu from '../auth/UserMenu';
import { useMediaQuery } from '../lib/useMediaQuery';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export interface NavGroup {
  /** Omitted for the top-level items that need no heading. */
  heading?: string;
  items: NavItem[];
}

interface Props {
  groups: NavGroup[];
  current: string;
  onSelect: (id: string) => void;
  /** Page title and optional subtitle for the content header. */
  title: string;
  subtitle?: string;
  /** Controls that belong to the current page, rendered on the right of its header. */
  actions?: React.ReactNode;
  /** Full-width warnings shown above the page content. */
  banners?: React.ReactNode;
  children: React.ReactNode;
}

export default function AppShell({
  groups, current, onSelect, title, subtitle, actions, banners, children,
}: Props) {
  const compact = useMediaQuery('(max-width: 900px)');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Picking a destination on a phone should close the drawer behind you.
  useEffect(() => { setDrawerOpen(false); }, [current]);
  useEffect(() => { if (!compact) setDrawerOpen(false); }, [compact]);

  const nav = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <div className="flex items-center gap-2.5 px-2">
        <Logo />
        <span className="text-[14px] font-semibold tracking-tight">Budget Forecaster</span>
      </div>

      <div className="flex flex-1 flex-col gap-5">
        {groups.map((group, i) => (
          <div key={group.heading ?? `group-${i}`} className="flex flex-col gap-0.5">
            {group.heading && (
              <p className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">
                {group.heading}
              </p>
            )}
            {group.items.map((item) => {
              const active = item.id === current;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[13.5px] transition-colors',
                    active
                      ? 'bg-primary/14 font-semibold text-text'
                      : 'text-muted hover:bg-surface-2 hover:text-text',
                  )}
                >
                  <span className={cx('grid w-4 shrink-0 place-items-center', active ? 'text-primary' : 'text-faint')}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-full bg-bg">
      {!compact && (
        <aside className="sticky top-0 h-screen w-[228px] shrink-0 border-r border-border bg-surface">
          {nav}
        </aside>
      )}

      {compact && drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[248px] border-r border-border bg-surface shadow-pop">
            {nav}
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-bg/85 px-5 py-3.5 backdrop-blur-md sm:px-7">
          {compact && (
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-control border border-border text-muted hover:text-text"
            >
              ☰
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="truncate text-[12.5px] text-muted">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2.5">
            {actions}
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-5 pb-20 pt-5 sm:px-7">
          {banners}
          {children}
        </main>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 26 26" aria-hidden="true">
      <rect width="26" height="26" rx="7" fill="var(--color-primary)" />
      <path d="M6 17.5 L10.5 12 L14 15 L20 7.5" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
