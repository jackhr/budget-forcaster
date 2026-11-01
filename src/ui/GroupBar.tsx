import { useState } from 'react';
import ConfirmButton from '../components/ConfirmButton';
import { ACCENTS, CollapseToggle, cx, type Accent } from './index';

type DragProps = React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };

/**
 * The header band of a group, and the box it sits on top of. Income, expenses
 * and debts all group the same way — collapse, rename in place, see a subtotal,
 * ungroup — so they share this rather than each keeping their own copy.
 *
 * Deleting a group only ungroups its items; the confirm label says so.
 */
export function GroupBar({
  accent, name, count, noun, subtotal, badges, collapsed, onToggle, onRename, onDelete, drag, children,
}: {
  accent: Accent;
  name: string;
  count: number;
  /** Singular noun for the item count — "item", "debt". */
  noun: string;
  subtotal: React.ReactNode;
  badges?: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  drag?: DragProps;
  children: React.ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);

  function commitRename() {
    const next = draft.trim();
    setRenaming(false);
    if (next && next !== name) onRename(next);
    else setDraft(name);
  }

  return (
    <div className="mb-2 overflow-hidden rounded-control border border-border">
      <div
        {...drag}
        className={cx(
          'flex items-center gap-2 border-l-[3px] bg-surface-2 px-3 py-2',
          ACCENTS[accent].rail,
          drag && 'cursor-grab',
        )}
      >
        <CollapseToggle collapsed={collapsed} onToggle={onToggle} label={name} size="sm" />

        {renaming ? (
          <input
            type="text"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setRenaming(false); setDraft(name); }
            }}
            className="min-w-0 flex-1 font-semibold"
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            title="Click to rename"
            className="min-w-0 flex-1 truncate rounded-control px-1 py-0.5 text-left text-[13px] font-semibold text-text transition-colors hover:bg-surface-3"
          >
            {name}
            <span className="ml-2 font-normal text-muted">
              {count} {noun}{count !== 1 ? 's' : ''}
            </span>
          </button>
        )}

        {badges}

        <span className={cx('shrink-0 text-[13px] font-bold', ACCENTS[accent].text)}>{subtotal}</span>

        <ConfirmButton
          onConfirm={onDelete}
          title={`Remove group (keeps ${noun}s, ungrouped)`}
          confirmLabel="Ungroup?"
          tone="outline"
        >
          Ungroup
        </ConfirmButton>
      </div>

      {!collapsed && children}
    </div>
  );
}
