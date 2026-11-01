import { useEffect, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cx } from '../ui';
import UserMenu from '../auth/UserMenu';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useCollapsed } from '../lib/useCollapsed';
import type { NavGroup } from '../lib/nav';

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
  // Which screen you're on, not who you are — so this stays on the device
  // rather than following the account like the home layout does.
  const { collapsed: railMode, toggle: toggleRail } = useCollapsed('sidebar');

  // Picking a destination on a phone should close the drawer behind you.
  useEffect(() => { setDrawerOpen(false); }, [current]);
  useEffect(() => { if (!compact) setDrawerOpen(false); }, [compact]);

  // The drawer is always full width: on a phone there's room, and the labels
  // are the only thing making a tap target identifiable.
  function renderNav(rail: boolean) {
    return (
      <nav className={cx('flex h-full flex-col gap-6 overflow-y-auto py-5', rail ? 'px-2' : 'px-3')}>
        <div className={cx('flex items-center gap-2.5', rail ? 'justify-center' : 'px-2')}>
          <Logo />
          {!rail && <span className="text-[14px] font-semibold tracking-tight">Budget Forecaster</span>}
        </div>

        <div className="flex flex-1 flex-col gap-5">
          {groups.map((group, i) => (
            <div key={group.heading ?? `group-${i}`} className="flex flex-col gap-0.5">
              {group.heading && (rail
                // No room for the word, but the break it marks still matters.
                ? <div className="mx-auto mb-1.5 h-px w-6 bg-border" aria-hidden="true" />
                : (
                  <p className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-faint">
                    {group.heading}
                  </p>
                )
              )}
              {group.items.map((item) => {
                const active = item.id === current;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? 'page' : undefined}
                    // The icon alone can't be read out, so the label moves onto the button.
                    aria-label={rail ? item.label : undefined}
                    title={rail ? item.label : undefined}
                    className={cx(
                      'flex items-center rounded-control text-[13.5px] transition-colors',
                      rail ? 'h-10 w-10 justify-center self-center' : 'gap-2.5 px-2.5 py-2',
                      active
                        ? 'bg-primary/14 font-semibold text-text'
                        : 'text-muted hover:bg-surface-2 hover:text-text',
                    )}
                  >
                    <item.icon
                      size={rail ? 18 : 16}
                      strokeWidth={1.9}
                      className={cx('shrink-0', active ? 'text-primary' : 'text-faint')}
                      aria-hidden="true"
                    />
                    {!rail && item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {!compact && (
          <button
            onClick={toggleRail}
            aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar to icons'}
            aria-pressed={rail}
            title={rail ? 'Expand sidebar' : 'Collapse sidebar to icons'}
            className={cx(
              'flex shrink-0 items-center rounded-control text-[12.5px] text-faint transition-colors hover:bg-surface-2 hover:text-text',
              rail ? 'h-9 w-10 justify-center self-center' : 'gap-2.5 px-2.5 py-2',
            )}
          >
            {rail
              ? <PanelLeftOpen size={16} strokeWidth={1.9} aria-hidden="true" />
              : <PanelLeftClose size={16} strokeWidth={1.9} aria-hidden="true" />}
            {!rail && 'Collapse'}
          </button>
        )}
      </nav>
    );
  }

  return (
    <div className="flex min-h-full bg-bg">
      {!compact && (
        <aside
          className={cx(
            'sticky top-0 h-screen shrink-0 border-r border-border bg-surface transition-[width] duration-150',
            railMode ? 'w-[64px]' : 'w-[228px]',
          )}
        >
          {renderNav(railMode)}
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
            {renderNav(false)}
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
              <Menu size={16} strokeWidth={1.9} aria-hidden="true" />
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
