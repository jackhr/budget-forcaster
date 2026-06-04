import { useState } from 'react';
import type { Account } from '../types';
import { formatMoney } from '../lib/format';
import { useDnd } from '../lib/useDnd';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';

interface AccountInput { name: string; balance: number; is_primary?: 0 | 1 }

interface Props {
  accounts: Account[];
  onAdd: (data: AccountInput) => Promise<void>;
  onUpdate: (id: number, data: AccountInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onMakePrimary: (id: number) => Promise<void>;
  onReorder: (ids: number[]) => void;
}

const ACCENT = 'var(--color-net-pos)';

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

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' };

  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Checking, Emergency Fund" autoFocus required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>Current Balance</span>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>$</span>
            <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} step="any" style={{ width: '100%', paddingLeft: 24 }} required />
          </div>
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '9px 16px' }}>Cancel</button>
          <button type="submit" disabled={saving || !valid} style={{ background: ACCENT, color: '#fff', padding: '9px 18px' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
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

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Accounts</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 2 }}>
            Cash &amp; savings piles. Income lands in its account; the ★ primary account pays the bills.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Cash</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: ACCENT }}>{formatMoney(total, { whole: true })}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {accounts.map((a) => (
          <div
            key={a.id}
            {...dnd.handlers(a)}
            style={{
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              borderLeft: `3px solid ${ACCENT}`, padding: '12px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              cursor: 'grab', outline: dnd.dragId === a.id ? '2px dashed var(--color-primary)' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
              {a.is_primary
                ? <span title="Primary — pays the bills" style={{ color: '#facc15' }}>★</span>
                : <button onClick={() => onMakePrimary(a.id)} title="Make primary" style={{ background: 'transparent', color: 'var(--color-text-muted)', fontSize: 15, padding: 0 }}>☆</button>}
              <span style={{ fontWeight: 600 }}>{a.name}</span>
              {a.is_primary ? <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)' }}>PRIMARY</span> : null}
            </div>
            <span style={{ fontWeight: 700, color: ACCENT }}>{formatMoney(a.balance, { whole: true })}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setEditingId(a.id)} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', padding: '5px 10px', border: '1px solid var(--color-border)' }}>Edit</button>
              <ConfirmButton onConfirm={() => onDelete(a.id)} title={`Delete ${a.name}`} triggerStyle={{ background: 'transparent', color: 'var(--color-expense)', padding: '5px 10px', border: '1px solid transparent' }}>✕</ConfirmButton>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setAdding(true)}
        style={{ background: 'transparent', color: ACCENT, border: `1px dashed ${ACCENT}`, borderRadius: 'var(--radius-sm)', padding: '8px 16px', width: '100%', marginTop: 12, opacity: 0.85, fontSize: 13 }}
      >
        + Add Account
      </button>

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
    </div>
  );
}
