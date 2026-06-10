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
        padding: 0, fontSize: size, lineHeight: 1, cursor: 'pointer', width: size + 6, flexShrink: 0,
      }}
    >
      {collapsed ? '▸' : '▾'}
    </button>
  );
}
