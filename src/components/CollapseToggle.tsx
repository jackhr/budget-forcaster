import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  label?: string;
  size?: number;
}

// Small chevron button for collapsing a section. Pair with a clickable header.
export default function CollapseToggle({ collapsed, onToggle, label, size = 32 }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={collapsed ? `Expand ${label ?? 'section'}` : `Collapse ${label ?? 'section'}`}
      aria-expanded={!collapsed}
      style={{
        background: 'transparent', color: 'var(--color-text-muted)', border: 'none',
        padding: 0, lineHeight: 1, cursor: 'pointer', display: 'grid', placeItems: 'center',
        width: size, height: size, flexShrink: 0,
      }}
    >
      {collapsed
        ? <ChevronRight size={Math.round(size * 0.58)} strokeWidth={2} aria-hidden="true" />
        : <ChevronDown size={Math.round(size * 0.58)} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}
