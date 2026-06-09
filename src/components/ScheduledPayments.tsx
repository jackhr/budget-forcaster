import { useState } from 'react';
import type { ExpenseAllocation, Frequency, FundingRule, FundingSourceType, ScheduledPayment } from '../types';
import { FREQUENCIES, FREQUENCY_LABELS, monthOffset } from '../lib/forecast';
import { formatMoney } from '../lib/format';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';
import FundingPlanModal, { summarizeFundingPlan } from './FundingPlanModal';

interface NamedSource { id: number; name: string; group_id: number | null; available?: number | null }
interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }

interface PaymentInput {
  name: string;
  amount: number;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  funding_source_type: FundingSourceType;
  funding_source_id: number | null;
  funding_allocations: ExpenseAllocation[];
  funding_rules: FundingRule[];
}

interface Props {
  payments: ScheduledPayment[];
  accounts: AccountOpt[];
  debts: NamedSource[];
  onAdd: (data: PaymentInput) => Promise<void>;
  onUpdate: (id: number, data: PaymentInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const ACCENT = 'var(--color-net-neg)';

function allocationsFromLegacy(p: { funding_source_type: FundingSourceType; funding_source_id: number | null; funding_allocations?: ExpenseAllocation[] }): ExpenseAllocation[] {
  if (p.funding_allocations?.length) return p.funding_allocations;
  if ((p.funding_source_type === 'account' || p.funding_source_type === 'debt') && p.funding_source_id != null) {
    return [{ source_type: p.funding_source_type, source_id: p.funding_source_id, alloc_type: 'percent', value: 100 }];
  }
  return [];
}

function legacyFundingFromAllocations(allocations: ExpenseAllocation[]): { type: FundingSourceType; id: number | null } {
  const first = allocations.find((a) => a.source_id != null && (a.source_type === 'account' || a.source_type === 'debt'));
  return first ? { type: first.source_type, id: first.source_id } : { type: 'cash', id: null };
}

function fundingLabel(p: ScheduledPayment, accounts: AccountOpt[], debts: NamedSource[]): string {
  if (p.funding_rules?.length) return `${p.funding_rules.length} scheduled rule${p.funding_rules.length !== 1 ? 's' : ''}`;
  const allocations = allocationsFromLegacy(p);
  if (allocations.length > 0) {
    const debtCount = allocations.filter((a) => a.source_type === 'debt').length;
    const accountCount = allocations.filter((a) => a.source_type === 'account').length;
    if (debtCount && accountCount) return `${allocations.length} splits`;
    if (debtCount) return debtCount === 1
      ? debts.find((d) => d.id === allocations.find((a) => a.source_type === 'debt')?.source_id)?.name ?? 'card'
      : `${debtCount} cards`;
    if (accountCount) return accountCount === 1
      ? accounts.find((a) => a.id === allocations.find((a) => a.source_type === 'account')?.source_id)?.name ?? 'account'
      : `${accountCount} accounts`;
  }
  if (p.funding_source_type === 'debt') return debts.find((d) => d.id === p.funding_source_id)?.name ?? 'card';
  if (p.funding_source_type === 'account') return accounts.find((a) => a.id === p.funding_source_id)?.name ?? 'account';
  return accounts.find((a) => a.is_primary)?.name ?? 'Cash'; // legacy cash/income -> primary
}

function formatMonth(date: string) {
  const [y, m] = date.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function scheduleLabel(p: ScheduledPayment) {
  if (p.frequency === 'one-time') {
    const off = monthOffset(p.start_date);
    const rel = off < 0 ? 'past' : off === 0 ? 'this month' : `in ${off} mo`;
    return `One-time · ${formatMonth(p.start_date)} (${rel})`;
  }
  const end = p.end_date ? `→ ${formatMonth(p.end_date)}` : '→ ongoing';
  return `${FREQUENCY_LABELS[p.frequency]} · from ${formatMonth(p.start_date)} ${end}`;
}

function defaultMonth(monthsAhead: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthsAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const monthInputStyle: React.CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)',
  padding: '8px 10px',
  fontSize: 13,
  fontFamily: 'inherit',
  colorScheme: 'dark',
  width: '100%',
};

interface EditorProps {
  title: string;
  initial: PaymentInput;
  accounts: AccountOpt[];
  debts: NamedSource[];
  onCancel: () => void;
  onSubmit: (data: PaymentInput) => Promise<void>;
}

function PaymentEditor({ title, initial, accounts, debts, onCancel, onSubmit }: EditorProps) {
  const [name, setName] = useState(initial.name);
  const [amount, setAmount] = useState(String(initial.amount || ''));
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency);
  const [start, setStart] = useState(initial.start_date.slice(0, 7));
  const [end, setEnd] = useState(initial.end_date ? initial.end_date.slice(0, 7) : '');
  const [allocations] = useState<ExpenseAllocation[]>(allocationsFromLegacy(initial));
  const [fundingRules, setFundingRules] = useState<FundingRule[]>(initial.funding_rules ?? []);
  const [editingFunding, setEditingFunding] = useState(false);
  const [saving, setSaving] = useState(false);

  const recurring = frequency !== 'one-time';
  const amtNum = parseFloat(amount);
  const endBeforeStart = recurring && !!end && end < start;
  const valid = name.trim().length > 0 && amtNum > 0 && !!start && !endBeforeStart;
  const debtFunded = [...allocations, ...fundingRules].some((a) => a.source_type === 'debt' && a.source_id != null && a.value > 0);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const clean = allocations.filter((a) => a.source_id != null && a.value > 0);
    const cleanRules = fundingRules.filter((r) => r.source_id != null && r.value > 0);
    const f = legacyFundingFromAllocations(clean.length ? clean : cleanRules);
    setSaving(true);
    await onSubmit({
      name: name.trim(),
      amount: amtNum,
      frequency,
      start_date: `${start}-01`,
      end_date: recurring && end ? `${end}-01` : null,
      funding_source_type: f.type,
      funding_source_id: f.id,
      funding_allocations: clean,
      funding_rules: cleanRules,
    });
    setSaving(false);
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  if (editingFunding) {
    return (
      <FundingPlanModal
        title={`Funding plan for ${name || 'future expense'}`}
        amount={amtNum || initial.amount}
        accounts={accounts}
        debts={debts}
        allowDebt
        rules={fundingRules}
        legacyAllocations={allocations}
        onCancel={() => setEditingFunding(false)}
        onSave={(rules) => { setFundingRules(rules); setEditingFunding(false); }}
      />
    );
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mortgage Payment" autoFocus required />
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <span style={labelStyle}>Amount {recurring ? '(per payment)' : ''}</span>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>$</span>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={0} step="any" style={{ width: '100%', paddingLeft: 24 }} required />
            </div>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <span style={labelStyle}>Frequency</span>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} style={monthInputStyle}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <span style={labelStyle}>{recurring ? 'Starts' : 'When'}</span>
            <input type="month" value={start} onChange={(e) => setStart(e.target.value)} required style={monthInputStyle} />
          </label>
          {recurring && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <span style={labelStyle}>Ends <span style={{ textTransform: 'none', opacity: 0.7 }}>(optional)</span></span>
              <input type="month" value={end} min={start} onChange={(e) => setEnd(e.target.value)} style={monthInputStyle} />
            </label>
          )}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>Paid from</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => setEditingFunding(true)}
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12.5, alignSelf: 'flex-start' }}
            >
              Edit funding plan
            </button>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {summarizeFundingPlan(fundingRules, allocations)}
            </p>
          </div>
        </label>
        {debtFunded && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -6 }}>
            Card-funded portions add to debt instead of spending cash, then pay down via the debt’s payment.
          </p>
        )}

        {recurring && !end && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: -6 }}>
            No end date — this payment continues for the whole forecast.
          </p>
        )}
        {endBeforeStart && (
          <p style={{ fontSize: 12, color: 'var(--color-expense)', marginTop: -6 }}>
            End date can’t be before the start date.
          </p>
        )}
        {name.trim() && !(amtNum > 0) && (
          <p style={{ fontSize: 12, color: 'var(--color-expense)', marginTop: -6 }}>
            Amount must be greater than zero.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '9px 16px' }}>Cancel</button>
          <button type="submit" disabled={saving || !valid} style={{ background: ACCENT, color: '#fff', padding: '9px 18px' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ScheduledPayments({ payments, accounts, debts, onAdd, onUpdate, onDelete }: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const editingPayment = payments.find((p) => p.id === editingId) ?? null;

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Future Expenses</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: 2 }}>
            Costs that start on a future date — one-off or recurring. Unlike Expenses (which run now), these kick in later.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Items</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: ACCENT }}>{payments.length}</div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 110px 1.2fr 96px',
        gap: '8px',
        padding: '0 12px 8px',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: 4,
      }}>
        {['Name', 'Amount', 'Schedule', ''].map((h, i) => (
          <span key={i} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {payments.map((p) => (
          (() => {
            const hasDebtFunding = [...(p.funding_rules ?? []), ...allocationsFromLegacy(p)].some((a) => a.source_type === 'debt');
            return (
          <div key={p.id} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 110px 1.2fr 96px',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            alignItems: 'center',
            transition: 'background 0.1s',
          }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ width: 3, height: 24, borderRadius: 2, background: ACCENT, flexShrink: 0 }} />
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span style={{
                flexShrink: 0, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                color: hasDebtFunding ? 'var(--color-net-neg)' : 'var(--color-text-muted)',
                background: hasDebtFunding ? 'var(--color-net-neg)1f' : 'var(--color-surface-2)',
                border: '1px solid var(--color-border)', borderRadius: 5, padding: '1px 6px',
              }}>
                {hasDebtFunding ? '💳 ' : '↳ '}{fundingLabel(p, accounts, debts)}
              </span>
            </div>
            <span style={{ fontWeight: 600, color: ACCENT }}>
              −{formatMoney(p.amount, { whole: true })}
            </span>
            <span style={{ color: 'var(--color-text-muted)', fontSize: 12.5 }}>
              {scheduleLabel(p)}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setEditingId(p.id)} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', padding: '5px 10px', border: '1px solid var(--color-border)' }}>Edit</button>
              <ConfirmButton onConfirm={() => onDelete(p.id)} title={`Delete ${p.name}`} triggerStyle={{ background: 'transparent', color: 'var(--color-expense)', padding: '5px 10px', border: '1px solid transparent' }}>✕</ConfirmButton>
            </div>
          </div>
            );
          })()
        ))}
        {payments.length === 0 && (
          <p style={{ padding: '20px 12px', color: 'var(--color-text-muted)', textAlign: 'center', fontSize: 13 }}>
            No future expenses yet. Add one below.
          </p>
        )}
      </div>

      <button
        onClick={() => setAdding(true)}
        style={{
          background: 'transparent', color: ACCENT, border: `1px dashed ${ACCENT}`,
          borderRadius: 'var(--radius-sm)', padding: '8px 16px', width: '100%', marginTop: 8, opacity: 0.85, fontSize: 13,
        }}
      >
        + Add Future Expense
      </button>

      {adding && (
        <PaymentEditor
          title="Add Future Expense"
          accounts={accounts}
          debts={debts}
          initial={{ name: '', amount: 0, frequency: 'one-time', start_date: `${defaultMonth(6)}-01`, end_date: null, funding_source_type: 'cash', funding_source_id: null, funding_allocations: [], funding_rules: [] }}
          onCancel={() => setAdding(false)}
          onSubmit={async (data) => { await onAdd(data); setAdding(false); }}
        />
      )}
      {editingPayment && (
        <PaymentEditor
          title={`Edit ${editingPayment.name}`}
          accounts={accounts}
          debts={debts}
          initial={{
            name: editingPayment.name,
            amount: editingPayment.amount,
            frequency: editingPayment.frequency,
            start_date: editingPayment.start_date,
            end_date: editingPayment.end_date,
            funding_source_type: editingPayment.funding_source_type,
            funding_source_id: editingPayment.funding_source_id,
            funding_allocations: editingPayment.funding_allocations ?? [],
            funding_rules: editingPayment.funding_rules ?? [],
          }}
          onCancel={() => setEditingId(null)}
          onSubmit={async (data) => { await onUpdate(editingPayment.id, data); setEditingId(null); }}
        />
      )}
    </div>
  );
}
