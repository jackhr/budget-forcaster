import { useState } from 'react';
import type { Debt } from '../types';
import { summarizeDebt } from '../lib/debt';
import { formatMoney } from '../lib/format';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';

interface DebtInput {
  name: string;
  balance: number;
  apr: number;
  credit_limit: number | null;
  monthly_payment: number;
}

interface Props {
  debts: Debt[];
  onAdd: (data: DebtInput) => Promise<void>;
  onUpdate: (id: number, data: DebtInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const ACCENT = 'var(--color-net-neg)';

function payoffDateLabel(monthIndex: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthIndex);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface EditorProps {
  title: string;
  initial: DebtInput;
  onCancel: () => void;
  onSubmit: (data: DebtInput) => Promise<void>;
}

const inputStyle: React.CSSProperties = { width: '100%' };
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

function DebtEditor({ title, initial, onCancel, onSubmit }: EditorProps) {
  const [name, setName] = useState(initial.name);
  const [balance, setBalance] = useState(String(initial.balance || ''));
  const [apr, setApr] = useState(String(initial.apr ?? ''));
  const [limit, setLimit] = useState(initial.credit_limit != null ? String(initial.credit_limit) : '');
  const [payment, setPayment] = useState(String(initial.monthly_payment || ''));
  const [saving, setSaving] = useState(false);

  const balNum = parseFloat(balance);
  const aprNum = parseFloat(apr);
  const payNum = parseFloat(payment);
  const limNum = limit ? parseFloat(limit) : null;

  // Live payoff preview while editing.
  const preview = (balNum > 0 && payNum > 0 && aprNum >= 0)
    ? summarizeDebt({ id: 0, name, balance: balNum, apr: aprNum, credit_limit: limNum, monthly_payment: payNum, created_at: '', updated_at: '' })
    : null;

  const valid = name.trim().length > 0 && balNum > 0 && payNum > 0 && (isNaN(aprNum) ? false : aprNum >= 0);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    await onSubmit({
      name: name.trim(),
      balance: balNum,
      apr: isNaN(aprNum) ? 0 : aprNum,
      credit_limit: limNum != null && !isNaN(limNum) ? limNum : null,
      monthly_payment: payNum,
    });
    setSaving(false);
  }

  function field(label: string, node: React.ReactNode) {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <span style={labelStyle}>{label}</span>
        {node}
      </label>
    );
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {field('Name', (
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amex" autoFocus required style={inputStyle} />
        ))}
        <div style={{ display: 'flex', gap: 12 }}>
          {field('Balance', (
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>$</span>
              <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} min={0} step="any" style={{ ...inputStyle, paddingLeft: 24 }} required />
            </div>
          ))}
          {field('APR', (
            <div style={{ position: 'relative' }}>
              <input type="number" value={apr} onChange={(e) => setApr(e.target.value)} min={0} step="any" style={{ ...inputStyle, paddingRight: 26 }} required />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>%</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {field('Monthly Payment', (
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>$</span>
              <input type="number" value={payment} onChange={(e) => setPayment(e.target.value)} min={0} step="any" style={{ ...inputStyle, paddingLeft: 24 }} required />
            </div>
          ))}
          {field('Credit Limit (optional)', (
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>$</span>
              <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} min={0} step="any" style={{ ...inputStyle, paddingLeft: 24 }} />
            </div>
          ))}
        </div>

        {preview && (
          <div style={{
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            fontSize: 13,
          }}>
            {preview.neverPaysOff ? (
              <span style={{ color: 'var(--color-expense)' }}>
                ⚠ This payment won’t cover the interest — the balance never gets paid off. Increase the monthly payment.
              </span>
            ) : (
              <span style={{ color: 'var(--color-text)' }}>
                Paid off in <strong>{preview.monthsToPayoff}</strong> months
                {preview.payoffMonthIndex != null && <> ({payoffDateLabel(preview.payoffMonthIndex)})</>}
                {' · '}<span style={{ color: 'var(--color-text-muted)' }}>{formatMoney(preview.totalInterest!)} total interest</span>
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '9px 16px' }}>Cancel</button>
          <button type="submit" disabled={saving || !valid} style={{ background: ACCENT, color: '#fff', padding: '9px 18px' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Debts({ debts, onAdd, onUpdate, onDelete }: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const editing = debts.find((d) => d.id === editingId) ?? null;

  const totalBalance = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalMonthly = debts.reduce((sum, d) => sum + d.monthly_payment, 0);

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Debts</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: 2 }}>
            Loans &amp; credit cards — payments stop automatically at payoff and free up cash
          </p>
        </div>
        <div style={{ display: 'flex', gap: 20, textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Owed</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: ACCENT }}>{formatMoney(totalBalance, { whole: true })}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text)' }}>{formatMoney(totalMonthly, { whole: true })}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {debts.map((d) => {
          const s = summarizeDebt(d);
          return (
            <div key={d.id} style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              borderLeft: `3px solid ${ACCENT}`,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 160 }}>
                <div style={{ fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                  {formatMoney(d.balance, { whole: true })} @ {d.apr}% · {formatMoney(d.monthly_payment, { whole: true })}/mo
                  {s.utilization != null && <> · {Math.round(s.utilization * 100)}% used</>}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 180, fontSize: 13 }}>
                {s.neverPaysOff ? (
                  <span style={{ color: 'var(--color-expense)' }}>⚠ Payment won’t cover interest — never pays off</span>
                ) : (
                  <span style={{ color: 'var(--color-text)' }}>
                    Paid off <strong>{payoffDateLabel(s.payoffMonthIndex!)}</strong>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {' '}· {s.monthsToPayoff} mo · {formatMoney(s.totalInterest!, { whole: true })} interest
                    </span>
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditingId(d.id)} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', padding: '5px 10px', border: '1px solid var(--color-border)' }}>Edit</button>
                <ConfirmButton onConfirm={() => onDelete(d.id)} title={`Delete ${d.name}`} triggerStyle={{ background: 'transparent', color: 'var(--color-expense)', padding: '5px 10px', border: '1px solid transparent' }}>✕</ConfirmButton>
              </div>
            </div>
          );
        })}
        {debts.length === 0 && (
          <p style={{ padding: '20px 12px', color: 'var(--color-text-muted)', textAlign: 'center', fontSize: 13 }}>
            No debts tracked. Add a loan or credit card to see when it’s paid off.
          </p>
        )}
      </div>

      <button
        onClick={() => setAdding(true)}
        style={{
          background: 'transparent', color: ACCENT, border: `1px dashed ${ACCENT}`,
          borderRadius: 'var(--radius-sm)', padding: '8px 16px', width: '100%', marginTop: 12, opacity: 0.85, fontSize: 13,
        }}
      >
        + Add Debt
      </button>

      {adding && (
        <DebtEditor
          title="Add Debt"
          initial={{ name: '', balance: 0, apr: 0, credit_limit: null, monthly_payment: 0 }}
          onCancel={() => setAdding(false)}
          onSubmit={async (data) => { await onAdd(data); setAdding(false); }}
        />
      )}
      {editing && (
        <DebtEditor
          title={`Edit ${editing.name}`}
          initial={{ name: editing.name, balance: editing.balance, apr: editing.apr, credit_limit: editing.credit_limit, monthly_payment: editing.monthly_payment }}
          onCancel={() => setEditingId(null)}
          onSubmit={async (data) => { await onUpdate(editing.id, data); setEditingId(null); }}
        />
      )}
    </div>
  );
}
