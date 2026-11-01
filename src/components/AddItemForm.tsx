import { useState } from 'react';
import type { AllocationSourceType, Frequency, ItemFormData } from '../types';
import { FREQUENCIES, FREQUENCY_LABELS, INCOME_FREQUENCIES } from '../lib/forecast';
import { formatMoney } from '../lib/format';
import Modal from './Modal';
import { ACCENTS, AddButton, Button, Field, FieldError, ModalActions, MoneyInput, type Accent } from '../ui';

interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }
interface NamedSource { id: number; name: string; available?: number | null }

interface Props {
  onAdd: (data: ItemFormData) => Promise<void>;
  accent: Accent;
  placeholder: string;
  showFrequency?: boolean;
  showAccount?: boolean;
  showFunding?: boolean;
  groupId?: number | null;
  accounts?: AccountOpt[];
  debts?: NamedSource[];
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddItemForm({ onAdd, accent, placeholder, showFrequency, showAccount, showFunding, groupId, accounts, debts }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [payday1, setPayday1] = useState(15);
  const [payday2, setPayday2] = useState(31);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState('');
  const [account, setAccount] = useState<number | null>(null);
  const [fundingSource, setFundingSource] = useState('');
  const [saving, setSaving] = useState(false);

  const primaryId = accounts?.find((a) => a.is_primary)?.id ?? null;
  const selectedCard = fundingSource.startsWith('debt:') ? debts?.find((d) => d.id === Number(fundingSource.slice(5))) : undefined;
  const cardAvail = selectedCard?.available ?? null;
  const amtNum = parseFloat(amount);
  const cardSpill = cardAvail != null && amtNum > cardAvail ? amtNum - cardAvail : 0;
  // An end before the first occurrence would bill nothing at all.
  const rangeValid = !end || !start || end >= start;
  const valid = name.trim().length > 0 && amtNum > 0 && (!showFunding || !!start) && rangeValid;

  const reset = () => {
    setName(''); setAmount(''); setFrequency('monthly'); setPayday1(15); setPayday2(31); setStart(today()); setEnd('');
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
      ...(showFunding ? { start_date: start, end_date: end || null } : {}),
      ...(showAccount ? { account_id: account } : {}),
      ...(showFunding ? { funding_allocations: funding } : {}),
      ...(groupId != null ? { group_id: groupId } : {}),
    });
    setSaving(false);
    reset();
    setOpen(false);
  }

  return (
    <>
      <AddButton accent={accent} onClick={() => setOpen(true)} className="mt-2 w-full">
        + Add {placeholder}
      </AddButton>

      {open && (
        <Modal title={`Add ${placeholder}`} onClose={() => setOpen(false)} maxWidth={560}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Name" hint={`A recognizable label, such as ${showFunding ? '"Electricity"' : '"Paycheck"'}.`}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={showFunding ? 'e.g. Electricity' : `e.g. ${placeholder}`}
                autoFocus
                required
              />
            </Field>

            <Field
              label={showFrequency ? 'Amount per payment' : 'Monthly amount'}
              hint={showFrequency
                ? 'Enter the amount charged each time it occurs, not its monthly average.'
                : 'Enter the amount received each month.'}
            >
              <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
            </Field>

            {showFrequency && (
              <Field label="Frequency" hint="How often the amount above occurs.">
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className="w-full">
                  {(showAccount ? INCOME_FREQUENCIES : FREQUENCIES).map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                </select>
              </Field>
            )}

            {showAccount && frequency === 'semimonthly' && (
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="First payday" hint="Day of month.">
                  <input type="number" min={1} max={31} value={payday1} onChange={(e) => setPayday1(Number(e.target.value))} />
                </Field>
                <Field label="Second payday" hint="Use 31 for month end.">
                  <input type="number" min={1} max={31} value={payday2} onChange={(e) => setPayday2(Number(e.target.value))} />
                </Field>
              </div>
            )}

            {showFunding && (
              <Field label="When" hint="First occurrence; repeats according to the selected frequency.">
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required className="w-full" />
              </Field>
            )}

            {showFunding && frequency !== 'one-time' && (
              <Field label="Ends (optional)" hint="Last occurrence. Leave blank for an ongoing cost.">
                <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className="w-full" />
              </Field>
            )}

            {!rangeValid && <FieldError>The end date must be on or after the first occurrence.</FieldError>}

            {showAccount && accounts?.length ? (
              <Field label="Deposited into" hint="The account that receives this income.">
                <select value={account ?? primaryId ?? ''} onChange={(e) => setAccount(e.target.value ? Number(e.target.value) : null)} className="w-full">
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
                </select>
              </Field>
            ) : null}

            {showFunding && (accounts?.length || debts?.length) ? (
              <Field label="Paid from" hint="Choose the account or credit card used for this expense.">
                <select value={fundingSource} onChange={(e) => setFundingSource(e.target.value)} className="w-full">
                  <option value="">Primary account</option>
                  {accounts?.length ? <optgroup label="Accounts">{accounts.map((a) => <option key={`a${a.id}`} value={`account:${a.id}`}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}</optgroup> : null}
                  {debts?.length ? <optgroup label="Credit cards">{debts.map((d) => <option key={`d${d.id}`} value={`debt:${d.id}`}>{d.name}</option>)}</optgroup> : null}
                </select>
              </Field>
            ) : null}

            {selectedCard && cardSpill > 0.005 && (
              <FieldError>
                {selectedCard.name} has {formatMoney(cardAvail!)} available. This charge would put it {formatMoney(cardSpill)} over its limit.
              </FieldError>
            )}

            <ModalActions>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="bare" disabled={saving || !valid} className={ACCENTS[accent].solid}>
                {saving ? 'Adding…' : `Add ${placeholder}`}
              </Button>
            </ModalActions>
          </form>
        </Modal>
      )}
    </>
  );
}
