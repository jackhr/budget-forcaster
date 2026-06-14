import { useState } from 'react';
import type { AllocationSourceType, Frequency, ItemFormData } from '../types';
import { FREQUENCIES, FREQUENCY_LABELS, INCOME_FREQUENCIES } from '../lib/forecast';
import { formatMoney } from '../lib/format';
import Modal from './Modal';

interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }
interface NamedSource { id: number; name: string; available?: number | null }

interface Props {
  onAdd: (data: ItemFormData) => Promise<void>;
  accentColor: string;
  placeholder: string;
  showFrequency?: boolean;
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
  width: '100%',
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddItemForm({ onAdd, accentColor, placeholder, showFrequency, showAccount, showFunding, groupId, accounts, debts }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [payday1, setPayday1] = useState(15);
  const [payday2, setPayday2] = useState(31);
  const [start, setStart] = useState(today);
  const [account, setAccount] = useState<number | null>(null);
  const [fundingSource, setFundingSource] = useState('');
  const [saving, setSaving] = useState(false);

  const primaryId = accounts?.find((a) => a.is_primary)?.id ?? null;
  const selectedCard = fundingSource.startsWith('debt:') ? debts?.find((d) => d.id === Number(fundingSource.slice(5))) : undefined;
  const cardAvail = selectedCard?.available ?? null;
  const amtNum = parseFloat(amount);
  const cardSpill = cardAvail != null && amtNum > cardAvail ? amtNum - cardAvail : 0;
  const valid = name.trim().length > 0 && amtNum > 0 && (!showFunding || !!start);

  const reset = () => {
    setName(''); setAmount(''); setFrequency('monthly'); setPayday1(15); setPayday2(31); setStart(today());
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
      ...(showFrequency ? { frequency } : {}),
      ...(showAccount && frequency === 'semimonthly' ? { payday_1: payday1, payday_2: payday2 } : {}),
      ...(showFunding ? { start_date: start } : {}),
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
                {(showAccount ? INCOME_FREQUENCIES : FREQUENCIES).map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
              </select>
            ))}

            {showAccount && frequency === 'semimonthly' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {field('First payday', 'Day of month.', <input type="number" min={1} max={31} value={payday1} onChange={(e) => setPayday1(Number(e.target.value))} />)}
                {field('Second payday', 'Use 31 for month end.', <input type="number" min={1} max={31} value={payday2} onChange={(e) => setPayday2(Number(e.target.value))} />)}
              </div>
            )}

            {showFunding && field('When', 'First occurrence; repeats according to the selected frequency.', (
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required style={{ width: '100%' }} />
            ))}

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
                ⚠ {selectedCard.name} has {formatMoney(cardAvail!)} available. This charge would put it {formatMoney(cardSpill)} over its limit.
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
