import { useState } from 'react';
import type { Debt, ExpenseAllocation, LineItemGroup } from '../types';
import { summarizeDebt, type DebtPlan, type DebtStrategy } from '../lib/debt';
import { formatMoney } from '../lib/format';
import { useDnd } from '../lib/useDnd';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';

interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }

interface DebtInput {
  name: string;
  balance: number;
  apr: number;
  credit_limit: number | null;
  monthly_payment: number;
  group_id: number | null;
  account_id: number | null;
  funding_allocations: ExpenseAllocation[];
}

interface Props {
  debts: Debt[];
  groups: LineItemGroup[];
  accounts: AccountOpt[];
  onAdd: (data: DebtInput) => Promise<void>;
  onUpdate: (id: number, data: DebtInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAddGroup: (name: string) => Promise<void>;
  onRenameGroup: (id: number, name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  onReorder: (ids: number[]) => void;
  onReorderGroup: (ids: number[]) => void;
  plan: DebtPlan;
  basePlan: DebtPlan; // strategy 'none', no extra — for comparison
  extra: number;
  strategy: DebtStrategy;
  onExtraChange: (v: number) => void;
  onStrategyChange: (s: DebtStrategy) => void;
}

const ACCENT = 'var(--color-net-neg)';

function payoffDateLabel(monthIndex: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthIndex);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const inputStyle: React.CSSProperties = { width: '100%' };
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};
const selectStyle: React.CSSProperties = {
  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', padding: '8px 10px',
  fontSize: 13, fontFamily: 'inherit', width: '100%',
};

interface EditorProps {
  title: string;
  initial: DebtInput;
  groups: LineItemGroup[];
  accounts: AccountOpt[];
  onCancel: () => void;
  onSubmit: (data: DebtInput) => Promise<void>;
}

function allocationsFromLegacy(debt: { account_id: number | null; funding_allocations?: ExpenseAllocation[] }): ExpenseAllocation[] {
  if (debt.funding_allocations?.length) return debt.funding_allocations;
  if (debt.account_id != null) {
    return [{ source_type: 'account', source_id: debt.account_id, alloc_type: 'percent', value: 100 }];
  }
  return [];
}

function legacyAccountFromAllocations(allocations: ExpenseAllocation[]): number | null {
  return allocations.find((a) => a.source_type === 'account' && a.source_id != null)?.source_id ?? null;
}

function accountFundingLabel(debt: Debt, accounts: AccountOpt[]): string | null {
  const allocations = allocationsFromLegacy(debt);
  if (allocations.length > 0) {
    const valid = allocations.filter((a) => a.source_type === 'account' && a.source_id != null);
    if (valid.length === 1) return accounts.find((a) => a.id === valid[0].source_id)?.name ?? 'account';
    if (valid.length > 1) return `${valid.length} accounts`;
  }
  return (accounts.find((a) => a.id === debt.account_id) ?? accounts.find((a) => a.is_primary))?.name ?? null;
}

function DebtEditor({ title, initial, groups, accounts, onCancel, onSubmit }: EditorProps) {
  const primaryId = accounts.find((a) => a.is_primary)?.id ?? null;
  const [name, setName] = useState(initial.name);
  const [balance, setBalance] = useState(String(initial.balance || ''));
  const [apr, setApr] = useState(String(initial.apr ?? ''));
  const [limit, setLimit] = useState(initial.credit_limit != null ? String(initial.credit_limit) : '');
  const [payment, setPayment] = useState(String(initial.monthly_payment || ''));
  const [groupId, setGroupId] = useState<number | null>(initial.group_id);
  const [allocations, setAllocations] = useState<ExpenseAllocation[]>(allocationsFromLegacy(initial));
  const [saving, setSaving] = useState(false);

  const balNum = parseFloat(balance);
  const aprNum = parseFloat(apr);
  const payNum = parseFloat(payment);
  const limNum = limit ? parseFloat(limit) : null;

  const preview = (balNum > 0 && payNum > 0 && aprNum >= 0)
    ? summarizeDebt({ id: 0, name, balance: balNum, apr: aprNum, credit_limit: limNum, monthly_payment: payNum, group_id: null, account_id: null, funding_allocations: [], created_at: '', updated_at: '' })
    : null;

  const valid = name.trim().length > 0 && balNum > 0 && payNum > 0 && (isNaN(aprNum) ? false : aprNum >= 0);
  const fixedSum = allocations.filter((a) => a.alloc_type === 'fixed').reduce((s, a) => s + (a.value || 0), 0);
  const pctSum = allocations.filter((a) => a.alloc_type === 'percent').reduce((s, a) => s + (a.value || 0), 0);
  const remainderAmt = Math.max(0, (payNum || 0) - fixedSum - (payNum || 0) * pctSum / 100);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const clean = allocations.filter((a) => a.source_type === 'account' && a.source_id != null && a.value > 0);
    setSaving(true);
    await onSubmit({
      name: name.trim(),
      balance: balNum,
      apr: isNaN(aprNum) ? 0 : aprNum,
      credit_limit: limNum != null && !isNaN(limNum) ? limNum : null,
      monthly_payment: payNum,
      group_id: groupId,
      account_id: legacyAccountFromAllocations(clean),
      funding_allocations: clean,
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
        <div style={{ display: 'flex', gap: 12 }}>
          {field('Pay from', (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allocations.map((a, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    value={a.source_id ?? ''}
                    onChange={(e) => setAllocations((prev) => prev.map((x, i) => i === idx ? { ...x, source_type: 'account', source_id: e.target.value ? Number(e.target.value) : null } : x))}
                    style={{ ...selectStyle, flex: 1 }}
                  >
                    <option value="" disabled>Choose account…</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
                  </select>
                  <select
                    value={a.alloc_type}
                    onChange={(e) => setAllocations((prev) => prev.map((x, i) => i === idx ? { ...x, alloc_type: e.target.value as 'percent' | 'fixed' } : x))}
                    style={{ ...selectStyle, width: 74 }}
                  >
                    <option value="percent">%</option>
                    <option value="fixed">$</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={a.value || ''}
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
                  ? 'Whole payment is paid from the primary account.'
                  : `Remainder (${formatMoney(remainderAmt, { whole: true })}) is paid from the primary account.`}
              </p>
            </div>
          ))}
          {field('Group', (
            <select value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
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

function DebtRow({ debt, groups, accounts, onUpdate, onDelete, drag, dragging }: {
  debt: Debt;
  groups: LineItemGroup[];
  accounts: AccountOpt[];
  onUpdate: (id: number, data: DebtInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  drag?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  dragging?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const s = summarizeDebt(debt);
  const payFrom = accountFundingLabel(debt, accounts);
  return (
    <>
      <div {...drag} style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-sm)',
        borderLeft: `3px solid ${ACCENT}`,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        cursor: drag ? 'grab' : undefined,
        outline: dragging ? '2px dashed var(--color-primary)' : undefined,
      }}>
        <div style={{ minWidth: 160 }}>
          <div style={{ fontWeight: 600 }}>{debt.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            {formatMoney(debt.balance, { whole: true })} @ {debt.apr}% · {formatMoney(debt.monthly_payment, { whole: true })}/mo
            {s.utilization != null && <> · {Math.round(s.utilization * 100)}% used</>}
            {payFrom && <> · from {payFrom}</>}
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
          <button onClick={() => setEditing(true)} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', padding: '5px 10px', border: '1px solid var(--color-border)' }}>Edit</button>
          <ConfirmButton onConfirm={() => onDelete(debt.id)} title={`Delete ${debt.name}`} triggerStyle={{ background: 'transparent', color: 'var(--color-expense)', padding: '5px 10px', border: '1px solid transparent' }}>✕</ConfirmButton>
        </div>
      </div>
      {editing && (
        <DebtEditor
          title={`Edit ${debt.name}`}
          groups={groups}
          accounts={accounts}
          initial={{ name: debt.name, balance: debt.balance, apr: debt.apr, credit_limit: debt.credit_limit, monthly_payment: debt.monthly_payment, group_id: debt.group_id, account_id: debt.account_id, funding_allocations: debt.funding_allocations ?? [] }}
          onCancel={() => setEditing(false)}
          onSubmit={async (data) => { await onUpdate(debt.id, data); setEditing(false); }}
        />
      )}
    </>
  );
}

function DebtGroupBlock({ group, debts, groups, accounts, onUpdate, onDelete, onAddInGroup, onRenameGroup, onDeleteGroup, dragFor, draggingId, groupDrag }: {
  group: LineItemGroup;
  debts: Debt[];
  groups: LineItemGroup[];
  accounts: AccountOpt[];
  onUpdate: (id: number, data: DebtInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAddInGroup: (groupId: number) => void;
  onRenameGroup: (id: number, name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  dragFor: (d: Debt) => React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  draggingId: number | null;
  groupDrag?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const subtotal = debts.reduce((sum, d) => sum + d.balance, 0);

  function commitRename() {
    const v = draft.trim();
    setRenaming(false);
    if (v && v !== group.name) onRenameGroup(group.id, v);
    else setDraft(group.name);
  }

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', marginBottom: 8, overflow: 'hidden' }}>
      <div {...groupDrag} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--color-surface-2)', borderLeft: `3px solid ${ACCENT}`, cursor: groupDrag ? 'grab' : undefined }}>
        <button onClick={() => setCollapsed((c) => !c)} style={{ background: 'transparent', color: 'var(--color-text)', padding: '0 6px', fontSize: 18, lineHeight: 1, width: 26 }} aria-label={collapsed ? 'Expand group' : 'Collapse group'}>
          {collapsed ? '▸' : '▾'}
        </button>
        {renaming ? (
          <input
            type="text" value={draft} autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenaming(false); setDraft(group.name); } }}
            style={{ flex: 1, fontWeight: 600 }}
          />
        ) : (
          <button onClick={() => setRenaming(true)} title="Click to rename" style={{ background: 'transparent', color: 'var(--color-text)', fontWeight: 600, fontSize: 13, padding: 0, flex: 1, textAlign: 'left' }}>
            {group.name}
            <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: 8 }}>
              {debts.length} debt{debts.length !== 1 ? 's' : ''}
            </span>
          </button>
        )}
        <span style={{ fontWeight: 700, color: ACCENT, fontSize: 13 }}>{formatMoney(subtotal, { whole: true })}</span>
        <ConfirmButton onConfirm={() => onDeleteGroup(group.id)} title="Remove group (keeps debts, ungrouped)" confirmLabel="Ungroup?" triggerStyle={{ background: 'transparent', color: 'var(--color-text-muted)', padding: '4px 8px', border: '1px solid var(--color-border)', fontSize: 12 }}>
          Ungroup
        </ConfirmButton>
      </div>

      {!collapsed && (
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {debts.map((d) => <DebtRow key={d.id} debt={d} groups={groups} accounts={accounts} onUpdate={onUpdate} onDelete={onDelete} drag={dragFor(d)} dragging={draggingId === d.id} />)}
          {debts.length === 0 && (
            <p style={{ padding: '6px 4px', color: 'var(--color-text-muted)', fontSize: 12.5 }}>Empty group — add a debt below.</p>
          )}
          <button
            onClick={() => onAddInGroup(group.id)}
            style={{ background: 'transparent', color: ACCENT, border: `1px dashed ${ACCENT}`, borderRadius: 'var(--radius-sm)', padding: '6px 14px', opacity: 0.85, fontSize: 13 }}
          >
            + Add debt to {group.name}
          </button>
        </div>
      )}
    </div>
  );
}

function AddGroupInline({ onAddGroup }: { onAddGroup: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onAddGroup(name.trim());
    setSaving(false);
    setName('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '8px 16px', fontSize: 13 }}>
        + New Group
      </button>
    );
  }
  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 6, flex: 1 }}>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name (e.g. Jack's cards)" autoFocus style={{ flex: 1 }} required />
      <button type="submit" disabled={saving} style={{ background: ACCENT, color: '#fff', padding: '6px 14px' }}>{saving ? '…' : 'Create'}</button>
      <button type="button" onClick={() => setOpen(false)} style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '6px 10px' }}>✕</button>
    </form>
  );
}

function payoffDateFromIndex(monthIndex: number | null): string {
  if (monthIndex == null) return 'never';
  return payoffDateLabel(monthIndex);
}

export default function Debts({ debts, groups, accounts, onAdd, onUpdate, onDelete, onAddGroup, onRenameGroup, onDeleteGroup, onReorder, onReorderGroup, plan, basePlan, extra, strategy, onExtraChange, onStrategyChange }: Props) {
  const [adding, setAdding] = useState<false | { groupId: number | null }>(false);
  const myGroups = groups.filter((g) => g.kind === 'debt');
  const ungrouped = debts.filter((d) => d.group_id == null);

  const dnd = useDnd<Debt>(debts, onReorder, (a, b) => a.group_id === b.group_id);
  const groupDnd = useDnd<LineItemGroup>(myGroups, onReorderGroup);

  const totalBalance = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalMonthly = debts.reduce((sum, d) => sum + d.monthly_payment, 0);

  const hasDebts = debts.length > 0;
  const interestSaved = (basePlan.totalInterest || 0) - (plan.totalInterest || 0);
  const baseFree = basePlan.debtFreeMonthIndex;
  const planFree = plan.debtFreeMonthIndex;
  const monthsSaved = baseFree != null && planFree != null ? baseFree - planFree : null;

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

      {/* Payoff plan */}
      {hasDebts && (
        <div style={{
          background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Strategy</span>
            <select value={strategy} onChange={(e) => onStrategyChange(e.target.value as DebtStrategy)} style={selectStyle as React.CSSProperties}>
              <option value="none">None (pay minimums)</option>
              <option value="avalanche">Avalanche (highest APR first)</option>
              <option value="snowball">Snowball (smallest balance first)</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Extra / mo</span>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>$</span>
              <input type="number" value={extra || ''} onChange={(e) => onExtraChange(parseFloat(e.target.value) || 0)} min={0} step="any" disabled={strategy === 'none'} style={{ width: 100, paddingLeft: 20 }} />
            </div>
          </label>
          <div style={{ fontSize: 13, marginLeft: 'auto', textAlign: 'right' }}>
            <div>Debt-free: <strong>{payoffDateFromIndex(plan.debtFreeMonthIndex)}</strong></div>
            {strategy !== 'none' && (interestSaved > 1 || (monthsSaved ?? 0) > 0) && (
              <div style={{ color: 'var(--color-income)', fontSize: 12 }}>
                saves {formatMoney(interestSaved, { whole: true })}
                {monthsSaved ? ` · ${monthsSaved} mo sooner` : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grouped debts */}
      {myGroups.map((group) => (
        <DebtGroupBlock
          key={group.id}
          group={group}
          debts={debts.filter((d) => d.group_id === group.id)}
          groups={myGroups}
          accounts={accounts}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddInGroup={(groupId) => setAdding({ groupId })}
          onRenameGroup={onRenameGroup}
          onDeleteGroup={onDeleteGroup}
          dragFor={dnd.handlers}
          draggingId={dnd.dragId}
          groupDrag={groupDnd.handlers(group)}
        />
      ))}

      {/* Ungrouped debts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ungrouped.map((d) => <DebtRow key={d.id} debt={d} groups={myGroups} accounts={accounts} onUpdate={onUpdate} onDelete={onDelete} drag={dnd.handlers(d)} dragging={dnd.dragId === d.id} />)}
        {debts.length === 0 && (
          <p style={{ padding: '20px 12px', color: 'var(--color-text-muted)', textAlign: 'center', fontSize: 13 }}>
            No debts tracked. Add a loan or credit card to see when it’s paid off.
          </p>
        )}
      </div>

      <button
        onClick={() => setAdding({ groupId: null })}
        style={{ background: 'transparent', color: ACCENT, border: `1px dashed ${ACCENT}`, borderRadius: 'var(--radius-sm)', padding: '8px 16px', width: '100%', marginTop: 12, opacity: 0.85, fontSize: 13 }}
      >
        + Add Debt
      </button>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <AddGroupInline onAddGroup={onAddGroup} />
      </div>

      {adding && (
        <DebtEditor
          title="Add Debt"
          groups={myGroups}
          accounts={accounts}
          initial={{ name: '', balance: 0, apr: 0, credit_limit: null, monthly_payment: 0, group_id: adding.groupId, account_id: null, funding_allocations: [] }}
          onCancel={() => setAdding(false)}
          onSubmit={async (data) => { await onAdd(data); setAdding(false); }}
        />
      )}
    </div>
  );
}
