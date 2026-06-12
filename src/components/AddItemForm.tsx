import { useState } from 'react';
import type { AllocationSourceType, Frequency, ItemFormData } from '../types';
import { FREQUENCIES, FREQUENCY_LABELS } from '../lib/forecast';
import { formatMoney } from '../lib/format';
import Modal from './Modal';
import OptionalMonthField from './OptionalMonthField';

interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }
interface NamedSource { id: number; name: string; available?: number | null }

interface Props {
  onAdd: (data: ItemFormData) => Promise<void>;
  accentColor: string;
  placeholder: string;
  showFrequency?: boolean;
  showEndDate?: boolean;
  showAccount?: boolean;
  showFunding?: boolean;
  groupId?: number | null;
  accounts?: AccountOpt[];
  debts?: NamedSource[];
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

const selectStyle: React.CSSProperties = {
  width: '100%', background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
  padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
};

export default function AddItemForm({ onAdd, accentColor, placeholder, showFrequency, showEndDate, showAccount, showFunding, groupId, accounts, debts }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [account, setAccount] = useState<number | null>(null);
  const [fundingSource, setFundingSource] = useState('');
  const [saving, setSaving] = useState(false);

  const primaryId = accounts?.find((a) => a.is_primary)?.id ?? null;
  const selectedCard = fundingSource.startsWith('debt:') ? debts?.find((d) => d.id === Number(fundingSource.slice(5))) : undefined;
  const cardAvail = selectedCard?.available ?? null;
  const amtNum = parseFloat(amount);
  const cardSpill = cardAvail != null && amtNum > cardAvail ? amtNum - cardAvail : 0;
  const valid = name.trim().length > 0 && amtNum > 0 && (!end || !start || end >= start);

  const reset = () => {
    setName(''); setAmount(''); setFrequency('monthly'); setStart(''); setEnd('');
    setAccount(null); setFundingSource('');
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    const funding = showFunding && fundingSource
      ? [{ source_type: fundingSource.split(':')[0] as AllocationSourceType, source_id: Number(fundingSource.split(':')[1]), alloc_type: 'percent' as const, value: 100 }]
      : [];
    await onAdd({
      name: name.trim(),
      monthly_amount: amtNum,
      ...(showFrequency ? { frequency, start_date: start ? `${start}-01` : null } : {}),
      ...(showEndDate ? { end_date: end ? `${end}-01` : null } : {}),
      ...(showAccount ? { account_id: account } : {}),
      ...(showFunding ? { funding_allocations: funding } : {}),
      ...(groupId != null ? { group_id: groupId } : {}),
    });
    setSaving(false);
    reset();
    setOpen(false);
  }

  const field = (label: string, help: string, child: React.ReactNode) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      {child}
      <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{help}</span>
    </label>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'transparent', color: accentColor, border: `1px dashed ${accentColor}`,
          borderRadius: 'var(--radius-sm)', padding: '8px 16px', width: '100%',
          marginTop: 8, opacity: 0.8, fontSize: 13,
        }}
      >
        + Add {placeholder}
      </button>

      {open && (
        <Modal title={`Add ${placeholder}`} onClose={() => setOpen(false)} maxWidth={560}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {field('Name', `A recognizable label, such as ${showFunding ? '"Electricity"' : '"Paycheck"'}.`, (
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={showFunding ? 'e.g. Electricity' : `e.g. ${placeholder}`} autoFocus required />
            ))}

            {field(
              showFrequency ? 'Amount per payment' : 'Monthly amount',
              showFrequency ? 'Enter the amount charged each time it occurs, not its monthly average.' : 'Enter the amount received each month.',
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>$</span>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" min={0} step="any" style={{ width: '100%', paddingLeft: 24 }} required />
              </div>,
            )}

            {showFrequency && field('Frequency', 'How often the amount above occurs.', (
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} style={selectStyle}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
              </select>
            ))}

            {showFrequency && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Active period</div>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 11.5, marginTop: 2 }}>Use the defaults for an item that is already active and continues indefinitely.</p>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <OptionalMonthField label="Starts" value={start} onChange={(value) => { setStart(value); if (value && end && end < value) setEnd(value); }} emptyLabel="Active now" chooseLabel="Schedule a future start" clearLabel="Make active now" />
                  {showEndDate && <OptionalMonthField label="Ends" value={end} min={start || undefined} onChange={setEnd} emptyLabel="Ongoing" chooseLabel="Set an end month" clearLabel="Make ongoing" />}
                </div>
              </div>
            )}

            {showAccount && accounts?.length ? field('Deposited into', 'The account that receives this income.', (
              <select value={account ?? primaryId ?? ''} onChange={(e) => setAccount(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
              </select>
            )) : null}

            {showFunding && (accounts?.length || debts?.length) ? field('Paid from', 'Choose the account or credit card used for this expense.', (
              <select value={fundingSource} onChange={(e) => setFundingSource(e.target.value)} style={selectStyle}>
                <option value="">Primary account</option>
                {accounts?.length ? <optgroup label="Accounts">{accounts.map((a) => <option key={`a${a.id}`} value={`account:${a.id}`}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}</optgroup> : null}
                {debts?.length ? <optgroup label="Credit cards">{debts.map((d) => <option key={`d${d.id}`} value={`debt:${d.id}`}>{d.name}</option>)}</optgroup> : null}
              </select>
            )) : null}

            {selectedCard && cardSpill > 0.005 && (
              <p style={{ fontSize: 12, margin: 0, color: 'var(--color-expense)' }}>
                ⚠ {selectedCard.name} has {formatMoney(cardAvail!)} left. {formatMoney(cardSpill)} of this payment would be uncovered.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '9px 16px' }}>Cancel</button>
              <button type="submit" disabled={saving || !valid} style={{ background: accentColor, color: '#fff', padding: '9px 18px' }}>{saving ? 'Adding…' : `Add ${placeholder}`}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
