import { useEffect } from 'react';

interface TabDef { id: string; label: string }

interface Props {
  tabs: TabDef[];
  current: string;
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode; // extra actions (Toolbar) shown below the nav
}

// Hamburger button + slide-in drawer for narrow screens. Holds the page nav
// and any extra actions passed as children.
export default function NavMenu({ tabs, current, onSelect, open, onOpenChange, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <>
      <button
        onClick={() => onOpenChange(!open)}
        aria-label="Menu"
        aria-expanded={open}
        style={{
          background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', padding: '7px 12px', fontSize: 18, lineHeight: 1,
        }}
      >
        ☰
      </button>

      {open && (
        <>
          <div
            onClick={() => onOpenChange(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50 }}
          />
          <div
            role="dialog"
            aria-label="Navigation"
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(86vw, 320px)', zIndex: 51,
              background: 'var(--color-surface)', borderLeft: '1px solid var(--color-border)',
              padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
              boxShadow: '-8px 0 24px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Menu</span>
              <button onClick={() => onOpenChange(false)} aria-label="Close menu" style={{ background: 'transparent', color: 'var(--color-text-muted)', fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { onSelect(t.id); onOpenChange(false); }}
                  style={{
                    background: current === t.id ? 'var(--color-surface-2)' : 'transparent',
                    color: current === t.id ? 'var(--color-text)' : 'var(--color-text-muted)',
                    border: `1px solid ${current === t.id ? 'var(--color-border)' : 'transparent'}`,
                    borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontWeight: 600, fontSize: 14, textAlign: 'left',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {children}
          </div>
        </>
      )}
    </>
  );
}
