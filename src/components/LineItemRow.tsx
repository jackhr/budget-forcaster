import { useState } from 'react';
import type { ExpenseAllocation, Frequency, ItemFormData, LineItem, LineItemGroup } from '../types';
import { FREQUENCIES, FREQUENCY_LABELS } from '../lib/forecast';
import { formatMoney } from '../lib/format';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';

interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }
interface NamedSource { id: number; name: string }

interface Props {
  item: LineItem;
  onUpdate: (id: number, data: ItemFormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  accentColor: string;
  showFrequency?: boolean; // frequency + start date (income & expense)
  showEndDate?: boolean;   // end date (expense range)
  showAccount?: boolean;   // "lands in account" selector (income)
  showFunding?: boolean;   // expense split-funding editor
  groups?: LineItemGroup[];
  accounts?: AccountOpt[];
  debts?: NamedSource[];
  drag?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  dragging?: boolean;
}

function encodeSource(type: 'account' | 'debt', id: number): string { return `${type}:${id}`; }

function monthShort(ym: string | null): string | null {
  if (!ym) return null;
  return new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function LineItemRow({ item, onUpdate, onDelete, accentColor, showFrequency, showEndDate, showAccount, showFunding, groups, accounts, debts, drag, dragging }: Props) {
  const itemFreq: Frequency = 'frequency' in item ? item.frequency : 'monthly';
  const itemStart = 'start_date' in item ? item.start_date : null;
  const itemEnd = 'end_date' in item ? item.end_date : null;
  const itemAccount = 'account_id' in item ? item.account_id : null;
  const itemAllocations: ExpenseAllocation[] = 'funding_allocations' in item ? (item.funding_allocations ?? []) : [];
  const primaryId = accounts?.find((a) => a.is_primary)?.id ?? null;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(String(item.monthly_amount));
  const [frequency, setFrequency] = useState<Frequency>(itemFreq);
  const [groupId, setGroupId] = useState<number | null>(item.group_id);
  const [start, setStart] = useState(itemStart ? itemStart.slice(0, 7) : '');
  const [end, setEnd] = useState(itemEnd ? itemEnd.slice(0, 7) : '');
  const [account, setAccount] = useState<number | null>(itemAccount);
  const [allocations, setAllocations] = useState<ExpenseAllocation[]>(itemAllocations);
  const [saving, setSaving] = useState(false);

  function openEditor() {
    setName(item.name);
    setAmount(String(item.monthly_amount));
    setFrequency(itemFreq);
    setGroupId(item.group_id);
    setStart(itemStart ? itemStart.slice(0, 7) : '');
    setEnd(itemEnd ? itemEnd.slice(0, 7) : '');
    setAccount(itemAccount);
    setAllocations(itemAllocations);
    setEditing(true);
  }

  const amtNum = parseFloat(amount);
  const endBeforeStart = !!end && !!start && end < start;
  const valid = name.trim().length > 0 && amtNum > 0 && !endBeforeStart;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const amt = amtNum;
    setSaving(true);
    await onUpdate(item.id, {
      name: name.trim(),
      monthly_amount: amt,
      group_id: groupId,
      ...(showFrequency ? { frequency, start_date: start ? `${start}-01` : null } : {}),
      ...(showEndDate ? { end_date: end ? `${end}-01` : null } : {}),
      ...(showAccount ? { account_id: account } : {}),
      ...(showFunding ? { funding_allocations: allocations.filter((a) => a.source_id != null && a.value > 0) } : {}),
    });
    setSaving(false);
    setEditing(false);
  }

  // For the split-funding remainder hint.
  const fixedSum = allocations.filter((a) => a.alloc_type === 'fixed').reduce((s, a) => s + (a.value || 0), 0);
  const pctSum = allocations.filter((a) => a.alloc_type === 'percent').reduce((s, a) => s + (a.value || 0), 0);
  const remainderAmt = Math.max(0, (amtNum || 0) - fixedSum - (amtNum || 0) * pctSum / 100);

  const startLabel = monthShort(itemStart);
  const endLabel = monthShort(itemEnd);

  return (
    <>
      <div {...drag} style={{
        display: 'grid',
        gridTemplateColumns: '1fr 140px 96px',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-sm)',
        alignItems: 'center',
        transition: 'background 0.1s',
        cursor: drag ? 'grab' : undefined,
        outline: dragging ? '2px dashed var(--color-primary)' : undefined,
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
          {showFrequency && (startLabel || endLabel) && (
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', flexShrink: 0,
              color: 'var(--color-text-muted)', background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)', borderRadius: 5, padding: '1px 6px',
            }}>
              {startLabel ? `from ${startLabel}` : ''}{startLabel && endLabel ? ' ' : ''}{endLabel ? `until ${endLabel}` : ''}
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

            {showFrequency && (
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Starts <span style={{ textTransform: 'none', opacity: 0.7 }}>(blank = now)</span>
                  </span>
                  <input
                    type="month"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    style={{
                      background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                      padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', colorScheme: 'dark',
                    }}
                  />
                </label>
                {showEndDate && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Ends <span style={{ textTransform: 'none', opacity: 0.7 }}>(blank = ongoing)</span>
                    </span>
                    <input
                      type="month"
                      value={end}
                      min={start}
                      onChange={(e) => setEnd(e.target.value)}
                      style={{
                        background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                        padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', colorScheme: 'dark',
                      }}
                    />
                  </label>
                )}
              </div>
            )}
            {endBeforeStart && (
              <p style={{ fontSize: 12, color: 'var(--color-expense)', marginTop: -6 }}>End can’t be before the start.</p>
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

            {showAccount && accounts && accounts.length > 0 && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Lands in account
                </span>
                <select
                  value={account ?? primaryId ?? ''}
                  onChange={(e) => setAccount(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                    padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
                  }}
                >
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
                </select>
              </label>
            )}

            {showFunding && (accounts?.length || debts?.length) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Paid from
                </span>
                {allocations.map((a, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      value={a.source_id == null ? '' : `${a.source_type}:${a.source_id}`}
                      onChange={(e) => {
                        const [type, sid] = e.target.value.split(':');
                        setAllocations((prev) => prev.map((x, i) => i === idx ? { ...x, source_type: type as 'account' | 'debt', source_id: Number(sid) } : x));
                      }}
                      style={{ flex: 1, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', padding: '6px 8px', fontSize: 13 }}
                    >
                      <option value="" disabled>Choose source…</option>
                      {accounts && accounts.length > 0 && (
                        <optgroup label="Accounts (cash)">
                          {accounts.map((ac) => <option key={`a${ac.id}`} value={encodeSource('account', ac.id)}>{ac.name}{ac.is_primary ? ' ★' : ''}</option>)}
                        </optgroup>
                      )}
                      {debts && debts.length > 0 && (
                        <optgroup label="Credit lines / cards">
                          {debts.map((d) => <option key={`d${d.id}`} value={encodeSource('debt', d.id)}>{d.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                    <select
                      value={a.alloc_type}
                      onChange={(e) => setAllocations((prev) => prev.map((x, i) => i === idx ? { ...x, alloc_type: e.target.value as 'percent' | 'fixed' } : x))}
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', padding: '6px 8px', fontSize: 13 }}
                    >
                      <option value="percent">%</option>
                      <option value="fixed">$</option>
                    </select>
                    <input
                      type="number" min={0} step="any" value={a.value || ''}
                      onChange={(e) => setAllocations((prev) => prev.map((x, i) => i === idx ? { ...x, value: parseFloat(e.target.value) || 0 } : x))}
                      style={{ width: 80 }}
                    />
                    <button type="button" onClick={() => setAllocations((prev) => prev.filter((_, i) => i !== idx))} style={{ background: 'transparent', color: 'var(--color-expense)', padding: '4px 8px' }}>✕</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setAllocations((prev) => [...prev, { source_type: 'account', source_id: primaryId, alloc_type: 'percent', value: 0 }])}
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12.5, alignSelf: 'flex-start' }}
                >
                  + Add split
                </button>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {allocations.length === 0
                    ? 'Whole amount is paid from the primary account.'
                    : `Remainder (${formatMoney(remainderAmt, { whole: true })}) is paid from the primary account.`}
                </p>
              </div>
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
