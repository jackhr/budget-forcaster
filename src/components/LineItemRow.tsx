import { useState } from 'react';
import type { Frequency, IncomeSource, ItemFormData, LineItem, LineItemGroup } from '../types';
import { FREQUENCIES, FREQUENCY_LABELS } from '../lib/forecast';
import { formatMoney } from '../lib/format';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';

interface Props {
  item: LineItem;
  onUpdate: (id: number, data: ItemFormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  accentColor: string;
  showFrequency?: boolean;
  groups?: LineItemGroup[];
}

function hasFrequency(item: LineItem): item is IncomeSource {
  return 'frequency' in item;
}

export default function LineItemRow({ item, onUpdate, onDelete, accentColor, showFrequency, groups }: Props) {
  const itemFreq = hasFrequency(item) ? item.frequency : 'monthly';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(String(item.monthly_amount));
  const [frequency, setFrequency] = useState<Frequency>(itemFreq);
  const [groupId, setGroupId] = useState<number | null>(item.group_id);
  const [saving, setSaving] = useState(false);

  function openEditor() {
    setName(item.name);
    setAmount(String(item.monthly_amount));
    setFrequency(itemFreq);
    setGroupId(item.group_id);
    setEditing(true);
  }

  const amtNum = parseFloat(amount);
  const valid = name.trim().length > 0 && amtNum > 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const amt = amtNum;
    setSaving(true);
    await onUpdate(item.id, {
      name: name.trim(),
      monthly_amount: amt,
      group_id: groupId,
      ...(showFrequency ? { frequency } : {}),
    });
    setSaving(false);
    setEditing(false);
  }

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 140px 96px',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-sm)',
        alignItems: 'center',
        transition: 'background 0.1s',
      }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 3, height: 24, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
          {showFrequency && itemFreq !== 'monthly' && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: accentColor,
              background: `${accentColor}1f`,
              border: `1px solid ${accentColor}40`,
              borderRadius: 5,
              padding: '1px 6px',
              flexShrink: 0,
            }}>
              {FREQUENCY_LABELS[itemFreq]}
            </span>
          )}
        </div>
        <span style={{ fontWeight: 600, color: accentColor }}>
          {formatMoney(item.monthly_amount)}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={openEditor}
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', padding: '5px 10px', border: '1px solid var(--color-border)' }}
          >
            Edit
          </button>
          <ConfirmButton
            onConfirm={() => onDelete(item.id)}
            title={`Delete ${item.name}`}
            triggerStyle={{ background: 'transparent', color: 'var(--color-expense)', padding: '5px 10px', border: '1px solid transparent' }}
          >
            ✕
          </ConfirmButton>
        </div>
      </div>

      {editing && (
        <Modal title={`Edit ${item.name}`} onClose={() => setEditing(false)}>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                autoFocus
                required
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {showFrequency ? 'Amount Per Payment' : 'Monthly Amount'}
              </span>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={0}
                  step="any"
                  style={{ width: '100%', paddingLeft: 24 }}
                  required
                />
              </div>
            </label>

            {showFrequency && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Frequency
                </span>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as Frequency)}
                  style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text)',
                    padding: '8px 10px',
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
                  ))}
                </select>
              </label>
            )}

            {groups && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Group
                </span>
                <select
                  value={groupId ?? ''}
                  onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text)',
                    padding: '8px 10px',
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="">No group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>
            )}

            {!valid && (
              <p style={{ fontSize: 12, color: 'var(--color-expense)', marginTop: -6 }}>
                Enter a name and an amount greater than zero.
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setEditing(false)}
                style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '9px 16px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !valid}
                style={{ background: 'var(--color-primary)', color: '#fff', padding: '9px 18px' }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
