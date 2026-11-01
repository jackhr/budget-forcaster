import { useState } from 'react';
import type { GroupKind, ItemFormData, LineItem, LineItemGroup } from '../types';
import { formatMoney } from '../lib/format';
import { useDnd } from '../lib/useDnd';
import { useCollapsedGroup } from '../lib/useCollapsedGroup';
import { useCollapsed } from '../lib/useCollapsed';
import LineItemRow from './LineItemRow';
import AddItemForm from './AddItemForm';
import { X } from 'lucide-react';
import { ACCENTS, Button, EmptyState, IconButton, Panel, PanelHeader, cx, type Accent } from '../ui';
import { GroupBar } from '../ui/GroupBar';

type DragProps = React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }
interface NamedSource { id: number; name: string; available?: number | null }

interface Props {
  title: string;
  description?: string;
  items: LineItem[];
  accent: Accent;
  totalLabel: string;
  kind: GroupKind;
  groups: LineItemGroup[];
  accounts?: AccountOpt[];
  debts?: NamedSource[];
  showFunding?: boolean;
  showFrequency?: boolean;
  showAccount?: boolean;
  isPaidThisMonth?: (item: LineItem) => boolean;
  onTogglePaid?: (item: LineItem) => void;
  onUpdateOccurrence?: (item: LineItem, scheduledDate: string, occurrenceDate: string, status: 'expected' | 'received' | 'skipped') => Promise<void>;
  onResetOccurrence?: (item: LineItem, scheduledDate: string) => Promise<void>;
  onUpdate: (id: number, data: ItemFormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAdd: (data: ItemFormData) => Promise<void>;
  onAddGroup: (name: string) => Promise<void>;
  onRenameGroup: (id: number, name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  onReorder: (ids: number[]) => void;
  onReorderGroup: (ids: number[]) => void;
}

// Shared by the column header and every row, so the three columns line up.
const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_140px_96px] gap-2';

function ColumnHeader({ amountLabel }: { amountLabel: string }) {
  return (
    <div className={cx(COLUMNS, 'mb-1 border-b border-border px-3 pb-2')}>
      {['Name', amountLabel, ''].map((heading, idx) => (
        <span key={idx} className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {heading}
        </span>
      ))}
    </div>
  );
}

interface GroupBlockProps {
  group: LineItemGroup;
  placeholder: string;
  items: LineItem[];
  groups: LineItemGroup[];
  accent: Accent;
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
  isPaidThisMonth?: (item: LineItem) => boolean;
  onTogglePaid?: (item: LineItem) => void;
  onUpdateOccurrence?: (item: LineItem, scheduledDate: string, occurrenceDate: string, status: 'expected' | 'received' | 'skipped') => Promise<void>;
  onResetOccurrence?: (item: LineItem, scheduledDate: string) => Promise<void>;
  dragFor: (item: LineItem) => DragProps;
  draggingId: number | null;
  groupDrag?: DragProps;
}

function GroupBlock({ group, placeholder, items, groups, accent, showFrequency, onUpdate, onDelete, onAdd, onRenameGroup, onDeleteGroup, accounts, debts, showFunding, showAccount, isPaidThisMonth, onTogglePaid, onUpdateOccurrence, onResetOccurrence, dragFor, draggingId, groupDrag }: GroupBlockProps) {
  const { collapsed, toggle } = useCollapsedGroup(group.id);
  const subtotal = items.reduce((sum, i) => sum + i.monthly_amount, 0);

  return (
    <GroupBar
      accent={accent}
      name={group.name}
      count={items.length}
      noun="item"
      subtotal={formatMoney(subtotal)}
      collapsed={collapsed}
      onToggle={toggle}
      onRename={(name) => onRenameGroup(group.id, name)}
      onDelete={() => onDeleteGroup(group.id)}
      drag={groupDrag}
    >
      <div className="py-1">
        {items.map((item) => (
          <LineItemRow
            key={item.id}
            item={item}
            onUpdate={onUpdate}
            onDelete={onDelete}
            accent={accent}
            showFrequency={showFrequency}
            showFunding={showFunding}
            showAccount={showAccount}
            groups={groups}
            accounts={accounts}
            debts={debts}
            paid={isPaidThisMonth?.(item)}
            onTogglePaid={onTogglePaid ? () => onTogglePaid(item) : undefined}
            onUpdateOccurrence={onUpdateOccurrence ? (scheduledDate, occurrenceDate, status) => onUpdateOccurrence(item, scheduledDate, occurrenceDate, status) : undefined}
            onResetOccurrence={onResetOccurrence ? (scheduledDate) => onResetOccurrence(item, scheduledDate) : undefined}
            drag={dragFor(item)}
            dragging={draggingId === item.id}
          />
        ))}
        {items.length === 0 && <EmptyState compact>Empty group — add an item below.</EmptyState>}
        <div className="px-3 pb-1.5">
          <AddItemForm
            onAdd={onAdd}
            accent={accent}
            placeholder={placeholder}
            showFrequency={showFrequency}
            showAccount={showAccount}
            showFunding={showFunding}
            groupId={group.id}
            accounts={accounts}
            debts={debts}
          />
        </div>
      </div>
    </GroupBar>
  );
}

function AddGroup({ accent, onAddGroup }: { accent: Accent; onAddGroup: (name: string) => Promise<void> }) {
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
    return <Button onClick={() => setOpen(true)}>+ New Group</Button>;
  }

  return (
    <form onSubmit={submit} className="flex flex-1 gap-1.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name (e.g. Utilities)"
        autoFocus
        className="min-w-0 flex-1"
        required
      />
      <Button type="submit" variant="bare" disabled={saving} className={ACCENTS[accent].solid}>
        {saving ? '…' : 'Create'}
      </Button>
      <IconButton tone="neutral" onClick={() => setOpen(false)} aria-label="Cancel">
        <X size={14} strokeWidth={2.2} aria-hidden="true" />
      </IconButton>
    </form>
  );
}

export default function LineItemTable({ title, description, items, accent, totalLabel, kind, groups, accounts, debts, showFunding, showFrequency, showAccount, isPaidThisMonth, onTogglePaid, onUpdateOccurrence, onResetOccurrence, onUpdate, onDelete, onAdd, onAddGroup, onRenameGroup, onDeleteGroup, onReorder, onReorderGroup }: Props) {
  const total = items.reduce((sum, i) => sum + i.monthly_amount, 0);
  const myGroups = groups.filter((g) => g.kind === kind);
  const ungrouped = items.filter((i) => i.group_id == null);
  const amountLabel = showFrequency ? 'Per Payment' : 'Monthly';
  const itemLabel = title.replace(/s$/, '');

  const dnd = useDnd<LineItem>(items, onReorder, (a, b) => a.group_id === b.group_id);
  const groupDnd = useDnd<LineItemGroup>(myGroups, onReorderGroup);
  const { collapsed, toggle } = useCollapsed(`section-${kind}`);

  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title={title}
        description={description}
        meta={`${items.length} item${items.length !== 1 ? 's' : ''}${myGroups.length > 0 ? ` · ${myGroups.length} group${myGroups.length !== 1 ? 's' : ''}` : ''}`}
        stats={[{ label: totalLabel, value: formatMoney(total), className: ACCENTS[accent].text }]}
        collapsed={collapsed}
        onToggle={toggle}
      />

      {!collapsed && (
        <>
          <ColumnHeader amountLabel={amountLabel} />

          {/* Grouped sections */}
          {myGroups.map((group) => (
            <GroupBlock
              key={group.id}
              group={group}
              placeholder={itemLabel}
              items={items.filter((i) => i.group_id === group.id)}
              groups={myGroups}
              accent={accent}
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
              isPaidThisMonth={isPaidThisMonth}
              onTogglePaid={onTogglePaid}
              onUpdateOccurrence={onUpdateOccurrence}
              onResetOccurrence={onResetOccurrence}
              dragFor={dnd.handlers}
              draggingId={dnd.dragId}
              groupDrag={groupDnd.handlers(group)}
            />
          ))}

          {/* Ungrouped items */}
          <div className="flex flex-col gap-0.5">
            {ungrouped.map((item) => (
              <LineItemRow
                key={item.id}
                item={item}
                onUpdate={onUpdate}
                onDelete={onDelete}
                accent={accent}
                showFrequency={showFrequency}
                showFunding={showFunding}
                showAccount={showAccount}
                groups={myGroups}
                accounts={accounts}
                debts={debts}
                paid={isPaidThisMonth?.(item)}
                onTogglePaid={onTogglePaid ? () => onTogglePaid(item) : undefined}
                onUpdateOccurrence={onUpdateOccurrence ? (scheduledDate, occurrenceDate, status) => onUpdateOccurrence(item, scheduledDate, occurrenceDate, status) : undefined}
                onResetOccurrence={onResetOccurrence ? (scheduledDate) => onResetOccurrence(item, scheduledDate) : undefined}
                drag={dnd.handlers(item)}
                dragging={dnd.dragId === item.id}
              />
            ))}
            {items.length === 0 && <EmptyState>No items yet. Add one below.</EmptyState>}
          </div>

          <AddItemForm
            onAdd={onAdd}
            accent={accent}
            placeholder={itemLabel}
            showFrequency={showFrequency}
            showAccount={showAccount}
            showFunding={showFunding}
            accounts={accounts}
            debts={debts}
          />

          <div className="mt-2 flex gap-2">
            <AddGroup accent={accent} onAddGroup={onAddGroup} />
          </div>
        </>
      )}
    </Panel>
  );
}
