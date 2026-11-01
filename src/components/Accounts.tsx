import { useState } from 'react';
import type { Account } from '../types';
import { formatMoney } from '../lib/format';
import { useDnd } from '../lib/useDnd';
import { useCollapsed } from '../lib/useCollapsed';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';
import { Star, X } from 'lucide-react';
import {
  ACCENTS, AddButton, Button, EmptyState, Field, IconButton, ModalActions, MoneyInput,
  Panel, PanelHeader, cx,
} from '../ui';

interface AccountInput { name: string; balance: number; is_primary?: 0 | 1 }

interface Props {
  accounts: Account[];
  onAdd: (data: AccountInput) => Promise<void>;
  onUpdate: (id: number, data: AccountInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onMakePrimary: (id: number) => Promise<void>;
  onReorder: (ids: number[]) => void;
}

const ACCENT = ACCENTS.cash;

interface EditorProps {
  title: string;
  initial: { name: string; balance: number };
  onCancel: () => void;
  onSubmit: (data: { name: string; balance: number }) => Promise<void>;
}

function AccountEditor({ title, initial, onCancel, onSubmit }: EditorProps) {
  const [name, setName] = useState(initial.name);
  const [balance, setBalance] = useState(String(initial.balance ?? ''));
  const [saving, setSaving] = useState(false);
  const balNum = parseFloat(balance);
  const valid = name.trim().length > 0 && !isNaN(balNum);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    await onSubmit({ name: name.trim(), balance: balNum });
    setSaving(false);
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={handle} className="flex flex-col gap-4">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Checking, Emergency Fund"
            autoFocus
            required
            className="w-full"
          />
        </Field>
        <Field label="Current Balance">
          {/* An account may legitimately be overdrawn, so no minimum. */}
          <MoneyInput value={balance} onChange={(e) => setBalance(e.target.value)} min={undefined} required />
        </Field>
        <ModalActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="bare" disabled={saving || !valid} className={ACCENT.solid}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

export default function Accounts({ accounts, onAdd, onUpdate, onDelete, onMakePrimary, onReorder }: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const editing = accounts.find((a) => a.id === editingId) ?? null;
  const dnd = useDnd<Account>(accounts, onReorder);
  const total = accounts.reduce((sum, a) => sum + a.balance, 0);
  const { collapsed, toggle } = useCollapsed('accounts');

  return (
    <Panel>
      <PanelHeader
        title="Accounts"
        description="Cash & savings piles. Income lands in its account; the starred primary account pays the bills."
        stats={[{ label: 'Total Cash', value: formatMoney(total, { whole: true }), className: ACCENT.text }]}
        collapsed={collapsed}
        onToggle={toggle}
      />

      {!collapsed && (
        <>
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <div
                key={a.id}
                {...dnd.handlers(a)}
                className={cx(
                  'flex flex-wrap items-center justify-between gap-3 rounded-control border border-border border-l-[3px] px-3.5 py-3',
                  ACCENT.rail,
                  'cursor-grab',
                  dnd.dragId === a.id && 'outline-2 outline-dashed outline-primary',
                )}
              >
                <div className="flex min-w-[140px] items-center gap-2">
                  {a.is_primary ? (
                    <span title="Primary — pays the bills" className="grid place-items-center text-warning">
                      <Star size={15} fill="currentColor" strokeWidth={0} aria-label="Primary account" />
                    </span>
                  ) : (
                    <IconButton
                      size="sm"
                      onClick={() => onMakePrimary(a.id)}
                      title="Make primary"
                      aria-label={`Make ${a.name} the primary account`}
                    >
                      <Star size={15} strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                  )}
                  <span className="font-semibold">{a.name}</span>
                  {a.is_primary && (
                    <span className="text-[10px] font-semibold tracking-wide text-muted">PRIMARY</span>
                  )}
                </div>

                <span className={cx('font-bold tabular-nums', ACCENT.text)}>
                  {formatMoney(a.balance, { whole: true })}
                </span>

                <div className="flex items-center gap-1.5">
                  <Button size="sm" onClick={() => setEditingId(a.id)}>Edit</Button>
                  <ConfirmButton onConfirm={() => onDelete(a.id)} title={`Delete ${a.name}`}>
                    <X size={14} strokeWidth={2.2} aria-hidden="true" />
                  </ConfirmButton>
                </div>
              </div>
            ))}
            {accounts.length === 0 && (
              <EmptyState>No accounts yet. Add one so income has somewhere to land.</EmptyState>
            )}
          </div>

          <AddButton accent="cash" onClick={() => setAdding(true)} className="mt-3 w-full">
            + Add Account
          </AddButton>
        </>
      )}

      {adding && (
        <AccountEditor
          title="Add Account"
          initial={{ name: '', balance: 0 }}
          onCancel={() => setAdding(false)}
          onSubmit={async (data) => { await onAdd(data); setAdding(false); }}
        />
      )}
      {editing && (
        <AccountEditor
          title={`Edit ${editing.name}`}
          initial={{ name: editing.name, balance: editing.balance }}
          onCancel={() => setEditingId(null)}
          onSubmit={async (data) => { await onUpdate(editing.id, data); setEditingId(null); }}
        />
      )}
    </Panel>
  );
}
