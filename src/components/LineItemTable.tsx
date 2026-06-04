import { useState } from 'react';
import type { GroupKind, ItemFormData, LineItem, LineItemGroup } from '../types';
import { formatMoney } from '../lib/format';
import { useDnd } from '../lib/useDnd';
import LineItemRow from './LineItemRow';
import AddItemForm from './AddItemForm';
import ConfirmButton from './ConfirmButton';

type DragProps = React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }
interface NamedSource { id: number; name: string }

interface Props {
  title: string;
  description?: string;
  items: LineItem[];
  accentColor: string;
  totalLabel: string;
  kind: GroupKind;
  groups: LineItemGroup[];
  accounts?: AccountOpt[];
  debts?: NamedSource[];
  showFunding?: boolean;
  showFrequency?: boolean;
  showAccount?: boolean;
  showEndDate?: boolean;
  onUpdate: (id: number, data: ItemFormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAdd: (data: ItemFormData) => Promise<void>;
  onAddGroup: (name: string) => Promise<void>;
  onRenameGroup: (id: number, name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  onReorder: (ids: number[]) => void;
  onReorderGroup: (ids: number[]) => void;
}

const GRID = '1fr 140px 96px';

function money(n: number) {
  return formatMoney(n);
}

function ColumnHeader({ amountLabel }: { amountLabel: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: GRID,
      gap: '8px',
      padding: '0 12px 8px',
      borderBottom: '1px solid var(--color-border)',
      marginBottom: 4,
    }}>
      {['Name', amountLabel, ''].map((h, idx) => (
        <span key={idx} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
      ))}
    </div>
  );
}

interface GroupBlockProps {
  group: LineItemGroup;
  items: LineItem[];
  groups: LineItemGroup[];
  accentColor: string;
  showFrequency?: boolean;
  onUpdate: (id: number, data: ItemFormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAdd: (data: ItemFormData) => Promise<void>;
  onRenameGroup: (id: number, name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  accounts?: AccountOpt[];
  debts?: NamedSource[];
  showFunding?: boolean;
  showAccount?: boolean;
  showEndDate?: boolean;
  dragFor: (item: LineItem) => DragProps;
  draggingId: number | null;
  groupDrag?: DragProps;
}

function GroupBlock({ group, items, groups, accentColor, showFrequency, onUpdate, onDelete, onAdd, onRenameGroup, onDeleteGroup, accounts, debts, showFunding, showAccount, showEndDate, dragFor, draggingId, groupDrag }: GroupBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const subtotal = items.reduce((sum, i) => sum + i.monthly_amount, 0);

  function commitRename() {
    const v = draft.trim();
    setRenaming(false);
    if (v && v !== group.name) onRenameGroup(group.id, v);
    else setDraft(group.name);
  }

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      background: 'rgba(255,255,255,0.015)',
      marginBottom: 8,
      overflow: 'hidden',
    }}>
      <div {...groupDrag} style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--color-surface-2)',
        borderLeft: `3px solid ${accentColor}`,
        cursor: groupDrag ? 'grab' : undefined,
      }}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{ background: 'transparent', color: 'var(--color-text)', padding: '0 6px', fontSize: 18, lineHeight: 1, width: 26 }}
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        {renaming ? (
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setRenaming(false); setDraft(group.name); }
            }}
            autoFocus
            style={{ flex: 1, fontWeight: 600 }}
          />
        ) : (
          <button
            onClick={() => setRenaming(true)}
            style={{ background: 'transparent', color: 'var(--color-text)', fontWeight: 600, fontSize: 13, padding: 0, flex: 1, textAlign: 'left' }}
            title="Click to rename"
          >
            {group.name}
            <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: 8 }}>
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
          </button>
        )}
        <span style={{ fontWeight: 700, color: accentColor, fontSize: 13 }}>{money(subtotal)}</span>
        <ConfirmButton
          onConfirm={() => onDeleteGroup(group.id)}
          title="Remove group (keeps items, ungrouped)"
          confirmLabel="Ungroup?"
          triggerStyle={{ background: 'transparent', color: 'var(--color-text-muted)', padding: '4px 8px', border: '1px solid var(--color-border)', fontSize: 12 }}
        >
          Ungroup
        </ConfirmButton>
      </div>

      {!collapsed && (
        <div style={{ padding: '4px 0' }}>
          {items.map((item) => (
            <LineItemRow
              key={item.id}
              item={item}
              onUpdate={onUpdate}
              onDelete={onDelete}
              accentColor={accentColor}
              showFrequency={showFrequency}
              showFunding={showFunding}
              showAccount={showAccount}
              showEndDate={showEndDate}
              groups={groups}
              accounts={accounts}
              debts={debts}
              drag={dragFor(item)}
              dragging={draggingId === item.id}
            />
          ))}
          {items.length === 0 && (
            <p style={{ padding: '8px 16px', color: 'var(--color-text-muted)', fontSize: 12.5 }}>
              Empty group — add an item below.
            </p>
          )}
          <div style={{ padding: '0 12px 6px' }}>
            <AddItemForm onAdd={onAdd} accentColor={accentColor} placeholder="item" showFrequency={showFrequency} showAccount={showAccount} groupId={group.id} accounts={accounts} />
          </div>
        </div>
      )}
    </div>
  );
}

function AddGroup({ accentColor, onAddGroup }: { accentColor: string; onAddGroup: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onAddGroup(name.trim());
    setSaving(false);
    setName('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'var(--color-surface-2)', color: 'var(--color-text-muted)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
          padding: '8px 16px', flex: '0 0 auto', fontSize: 13,
        }}
      >
        + New Group
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 6, flex: 1 }}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name (e.g. Jack CC payments)"
        autoFocus
        style={{ flex: 1 }}
        required
      />
      <button type="submit" disabled={saving} style={{ background: accentColor, color: '#fff', padding: '6px 14px' }}>
        {saving ? '…' : 'Create'}
      </button>
      <button type="button" onClick={() => setOpen(false)} style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '6px 10px' }}>✕</button>
    </form>
  );
}

export default function LineItemTable({ title, description, items, accentColor, totalLabel, kind, groups, accounts, debts, showFunding, showFrequency, showAccount, showEndDate, onUpdate, onDelete, onAdd, onAddGroup, onRenameGroup, onDeleteGroup, onReorder, onReorderGroup }: Props) {
  const total = items.reduce((sum, i) => sum + i.monthly_amount, 0);
  const myGroups = groups.filter((g) => g.kind === kind);
  const ungrouped = items.filter((i) => i.group_id == null);
  const amountLabel = showFrequency ? 'Per Payment' : 'Monthly';

  const dnd = useDnd<LineItem>(items, onReorder, (a, b) => a.group_id === b.group_id);
  const groupDnd = useDnd<LineItemGroup>(myGroups, onReorderGroup);

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{title}</h2>
          {description && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: 2 }}>{description}</p>
          )}
          <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: 2 }}>
            {items.length} item{items.length !== 1 ? 's' : ''}
            {myGroups.length > 0 ? ` · ${myGroups.length} group${myGroups.length !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{totalLabel}</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: accentColor }}>{money(total)}</div>
        </div>
      </div>

      <ColumnHeader amountLabel={amountLabel} />

      {/* Grouped sections */}
      {myGroups.map((group) => (
        <GroupBlock
          key={group.id}
          group={group}
          items={items.filter((i) => i.group_id === group.id)}
          groups={myGroups}
          accentColor={accentColor}
          showFrequency={showFrequency}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAdd={onAdd}
          onRenameGroup={onRenameGroup}
          onDeleteGroup={onDeleteGroup}
          accounts={accounts}
          debts={debts}
          showFunding={showFunding}
          showAccount={showAccount}
          showEndDate={showEndDate}
          dragFor={dnd.handlers}
          draggingId={dnd.dragId}
          groupDrag={groupDnd.handlers(group)}
        />
      ))}

      {/* Ungrouped items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ungrouped.map((item) => (
          <LineItemRow
            key={item.id}
            item={item}
            onUpdate={onUpdate}
            onDelete={onDelete}
            accentColor={accentColor}
            showFrequency={showFrequency}
            showFunding={showFunding}
            showAccount={showAccount}
            showEndDate={showEndDate}
            groups={myGroups}
            accounts={accounts}
            debts={debts}
            drag={dnd.handlers(item)}
            dragging={dnd.dragId === item.id}
          />
        ))}
        {items.length === 0 && (
          <p style={{ padding: '20px 12px', color: 'var(--color-text-muted)', textAlign: 'center', fontSize: 13 }}>
            No items yet. Add one below.
          </p>
        )}
      </div>

      <AddItemForm
        onAdd={onAdd}
        accentColor={accentColor}
        placeholder={title.replace(/s$/, '')}
        showFrequency={showFrequency}
        showAccount={showAccount}
        accounts={accounts}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <AddGroup accentColor={accentColor} onAddGroup={onAddGroup} />
      </div>
    </div>
  );
}
