import { useState } from 'react';
import type { Frequency, ItemFormData } from '../types';
import { FREQUENCIES, FREQUENCY_LABELS } from '../lib/forecast';

interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }

interface Props {
  onAdd: (data: ItemFormData) => Promise<void>;
  accentColor: string;
  placeholder: string;
  showFrequency?: boolean;
  showAccount?: boolean;
  groupId?: number | null;
  accounts?: AccountOpt[];
}

export default function AddItemForm({ onAdd, accentColor, placeholder, showFrequency, showAccount, groupId, accounts }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [start, setStart] = useState('');
  const [account, setAccount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const primaryId = accounts?.find((a) => a.is_primary)?.id ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!name.trim() || !(amt > 0)) return;
    setSaving(true);
    await onAdd({
      name: name.trim(),
      monthly_amount: amt,
      ...(showFrequency ? { frequency, start_date: start ? `${start}-01` : null } : {}),
      ...(showAccount ? { account_id: account } : {}),
      ...(groupId != null ? { group_id: groupId } : {}),
    });
    setSaving(false);
    setName('');
    setAmount('');
    setFrequency('monthly');
    setStart('');
    setAccount(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'transparent',
          color: accentColor,
          border: `1px dashed ${accentColor}`,
          borderRadius: 'var(--radius-sm)',
          padding: '8px 16px',
          width: '100%',
          marginTop: 8,
          opacity: 0.8,
          fontSize: 13,
        }}
      >
        + Add {placeholder}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      padding: '12px',
      background: 'var(--color-surface-2)',
      borderRadius: 'var(--radius-sm)',
      alignItems: 'center',
      marginTop: 8,
      border: `1px solid ${accentColor}33`,
    }}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`${placeholder} name`}
        style={{ flex: '1 1 140px' }}
        autoFocus
        required
      />
      <div style={{ position: 'relative', flex: '0 1 120px' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: 13 }}>$</span>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min={0}
          step="any"
          style={{ width: '100%', paddingLeft: 20 }}
          required
        />
      </div>
      {showFrequency && (
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          style={{
            flex: '0 1 120px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text)',
            padding: '6px 10px',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
          ))}
        </select>
      )}
      {showFrequency && (
        <input
          type="month"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          title="Optional — month this income starts (blank = now)"
          style={{
            flex: '0 1 130px',
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
            padding: '6px 10px', fontSize: 13, fontFamily: 'inherit', colorScheme: 'dark',
          }}
        />
      )}
      {showAccount && accounts && accounts.length > 0 && (
        <select
          value={account ?? primaryId ?? ''}
          onChange={(e) => setAccount(e.target.value ? Number(e.target.value) : null)}
          title="Which account this income lands in"
          style={{
            flex: '0 1 130px',
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
            padding: '6px 10px', fontSize: 13, fontFamily: 'inherit',
          }}
        >
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
        </select>
      )}
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <button
          type="submit"
          disabled={saving || !name.trim() || !(parseFloat(amount) > 0)}
          style={{ background: accentColor, color: '#fff', padding: '6px 14px' }}
        >
          {saving ? '…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '6px 10px' }}
        >
          ✕
        </button>
      </div>
    </form>
  );
}
