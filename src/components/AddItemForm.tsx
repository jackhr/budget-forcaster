import { useState } from 'react';
import type { Frequency, ItemFormData } from '../types';
import { FREQUENCIES, FREQUENCY_LABELS } from '../lib/forecast';

interface Props {
  onAdd: (data: ItemFormData) => Promise<void>;
  accentColor: string;
  placeholder: string;
  showFrequency?: boolean;
  groupId?: number | null;
}

export default function AddItemForm({ onAdd, accentColor, placeholder, showFrequency, groupId }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!name.trim() || !(amt > 0)) return;
    setSaving(true);
    await onAdd({
      name: name.trim(),
      monthly_amount: amt,
      ...(showFrequency ? { frequency } : {}),
      ...(groupId != null ? { group_id: groupId } : {}),
    });
    setSaving(false);
    setName('');
    setAmount('');
    setFrequency('monthly');
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
