import { useState } from 'react';
import type { Debt, DebtType, ExpenseAllocation, FundingRule, LineItemGroup } from '../types';
import { summarizeDebt, type DebtPlan, type DebtStrategy } from '../lib/debt';
import { formatMoney } from '../lib/format';
import { useDnd } from '../lib/useDnd';
import { useCollapsedGroup } from '../lib/useCollapsedGroup';
import { useCollapsed } from '../lib/useCollapsed';
import CollapseToggle from './CollapseToggle';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';
import FundingPlanModal, { summarizeFundingPlan } from './FundingPlanModal';

interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }

interface DebtInput {
  name: string;
  balance: number;
  apr: number;
  credit_limit: number | null;
  monthly_payment: number;
  debt_type: DebtType;
  payment_day: number | null;
  group_id: number | null;
  account_id: number | null;
  funding_allocations: ExpenseAllocation[];
  funding_rules: FundingRule[];
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

function OverLimitBadge({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap',
      color: 'var(--color-expense)', background: 'var(--color-surface-2)', border: '1px solid var(--color-expense)',
    }}>
      ⚠ {label}
    </span>
  );
}

function isCurrentlyOverLimit(debt: Debt): boolean {
  return debt.debt_type !== 'loan' && debt.credit_limit != null && debt.balance > debt.credit_limit + 0.005;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

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
  if (debt.funding_rules?.length) return `${debt.funding_rules.length} scheduled rule${debt.funding_rules.length !== 1 ? 's' : ''}`;
  const allocations = allocationsFromLegacy(debt);
  if (allocations.length > 0) {
    const valid = allocations.filter((a) => a.source_type === 'account' && a.source_id != null);
    if (valid.length === 1) return accounts.find((a) => a.id === valid[0].source_id)?.name ?? 'account';
    if (valid.length > 1) return `${valid.length} accounts`;
  }
  return (accounts.find((a) => a.id === debt.account_id) ?? accounts.find((a) => a.is_primary))?.name ?? null;
}

function DebtEditor({ title, initial, groups, accounts, onCancel, onSubmit }: EditorProps) {
  const [name, setName] = useState(initial.name);
  const [balance, setBalance] = useState(String(initial.balance || ''));
  const [apr, setApr] = useState(String(initial.apr ?? ''));
  const [limit, setLimit] = useState(initial.credit_limit != null ? String(initial.credit_limit) : '');
  const [payment, setPayment] = useState(String(initial.monthly_payment || ''));
  const [debtType, setDebtType] = useState<DebtType>(initial.debt_type);
  const [payDay, setPayDay] = useState(initial.payment_day != null ? String(initial.payment_day) : '');
  const [groupId, setGroupId] = useState<number | null>(initial.group_id);
  const [allocations, setAllocations] = useState<ExpenseAllocation[]>(allocationsFromLegacy(initial));
  const [fundingRules, setFundingRules] = useState<FundingRule[]>(initial.funding_rules ?? []);
  const [editingFunding, setEditingFunding] = useState(false);
  const [saving, setSaving] = useState(false);

  const isCard = debtType === 'credit_card';
  // "Pay from" is simple (one account) unless there's a scheduled plan or a split
  // across accounts/percentages — then we show the funding-plan summary instead.
  const advancedFunding = fundingRules.length > 0
    || allocations.length > 1
    || allocations.some((a) => a.source_type !== 'account' || a.alloc_type !== 'percent' || a.value !== 100);
  const payAccountId = allocations.length === 1 && allocations[0].source_type === 'account' ? allocations[0].source_id : null;
  const balNum = parseFloat(balance);
  const aprNum = parseFloat(apr);
  const payNum = parseFloat(payment);
  // Loans have no credit line, so a limit only applies to cards.
  const limNum = isCard && limit ? parseFloat(limit) : null;
  const dayNum = payDay ? Math.trunc(parseFloat(payDay)) : null;
  const overLimit = limNum != null && !isNaN(limNum) && balNum > limNum + 0.005;
  const hasFundingPlan = fundingRules.length > 0;
  const paymentValid = payNum > 0 || (hasFundingPlan && (payment.trim() === '' || payNum === 0));

  const preview = (balNum > 0 && payNum > 0 && aprNum >= 0)
    ? summarizeDebt({ id: 0, name, balance: balNum, apr: aprNum, credit_limit: limNum, monthly_payment: payNum, debt_type: debtType, payment_day: dayNum, group_id: null, account_id: null, funding_allocations: [], funding_rules: [], created_at: '', updated_at: '' })
    : null;

  const valid = name.trim().length > 0 && balNum > 0 && paymentValid && (isNaN(aprNum) ? false : aprNum >= 0);
  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const clean = allocations.filter((a) => a.source_type === 'account' && a.source_id != null && a.value > 0);
    const cleanRules = fundingRules.filter((r) => r.source_type === 'account' && r.source_id != null && r.value > 0);
    setSaving(true);
    await onSubmit({
      name: name.trim(),
      balance: balNum,
      apr: isNaN(aprNum) ? 0 : aprNum,
      credit_limit: limNum != null && !isNaN(limNum) ? limNum : null,
      monthly_payment: Number.isFinite(payNum) ? payNum : 0,
      debt_type: debtType,
      payment_day: dayNum != null && dayNum >= 1 && dayNum <= 31 ? dayNum : null,
      group_id: groupId,
      account_id: legacyAccountFromAllocations(clean.length ? clean : cleanRules),
      funding_allocations: clean,
      funding_rules: cleanRules,
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

  if (editingFunding) {
    return (
      <FundingPlanModal
        title={`Funding plan for ${name || 'debt'}`}
        amount={payNum || initial.monthly_payment}
        accounts={accounts}
        allowDebt={false}
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
        {field('Name', (
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amex" autoFocus required style={inputStyle} />
        ))}
        <div style={{ display: 'flex', gap: 12 }}>
          {field('Type', (
            <select value={debtType} onChange={(e) => setDebtType(e.target.value as DebtType)} style={selectStyle}>
              <option value="credit_card">Credit card (revolving — can be charged)</option>
              <option value="loan">Loan (installment — no credit)</option>
            </select>
          ))}
          {field('Autopay day (optional)', (
            <input type="number" value={payDay} onChange={(e) => setPayDay(e.target.value)} min={1} max={31} step={1} placeholder="1–31" style={inputStyle} />
          ))}
        </div>
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
              <input type="number" value={payment} onChange={(e) => setPayment(e.target.value)} min={0} step="any" style={{ ...inputStyle, paddingLeft: 24 }} required={!hasFundingPlan} />
            </div>
          ))}
          {isCard && field('Credit Limit (optional)', (
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>$</span>
              <input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} min={0} step="any" style={{ ...inputStyle, paddingLeft: 24 }} />
            </div>
          ))}
          {!isCard && <div style={{ flex: 1 }} />}
        </div>
        {overLimit && (
          <p style={{ fontSize: 12, color: 'var(--color-expense)', margin: 0 }}>
            ⚠ This card is {formatMoney(balNum - limNum!, { whole: true })} over its credit limit.
          </p>
        )}
        {field('Pay from', (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            {advancedFunding ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--color-text)' }}>{summarizeFundingPlan(fundingRules, allocations)}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setEditingFunding(true)} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12.5 }}>
                    Edit funding plan
                  </button>
                  <button type="button" onClick={() => { setFundingRules([]); setAllocations([]); }} style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12.5 }}>
                    Use one account
                  </button>
                </div>
              </>
            ) : (
              <>
                <select
                  value={payAccountId ?? ''}
                  onChange={(e) => setAllocations(e.target.value ? [{ source_type: 'account', source_id: Number(e.target.value), alloc_type: 'percent', value: 100 }] : [])}
                  style={selectStyle}
                >
                  <option value="">Primary account</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setEditingFunding(true)}
                  style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12.5, alignSelf: 'flex-start' }}
                >
                  Split across accounts or schedule…
                </button>
              </>
            )}
          </div>
        ))}
        {field('Group', (
          <select value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        ))}

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

function DebtRow({ debt, groups, accounts, overLimitMonth, onUpdate, onDelete, drag, dragging }: {
  debt: Debt;
  groups: LineItemGroup[];
  accounts: AccountOpt[];
  overLimitMonth?: number | null; // first forecast month its balance exceeds the limit
  onUpdate: (id: number, data: DebtInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  drag?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  dragging?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const s = summarizeDebt(debt);
  const payFrom = accountFundingLabel(debt, accounts);
  const currentlyOver = isCurrentlyOverLimit(debt);
  const forecastOver = !currentlyOver && overLimitMonth != null;
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
          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {debt.name}
            {currentlyOver && <OverLimitBadge label="Over limit" />}
            {forecastOver && <OverLimitBadge label={`Over limit ${payoffDateLabel(overLimitMonth)}`} />}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            {debt.debt_type === 'loan' ? 'Loan' : 'Card'} · {formatMoney(debt.balance, { whole: true })} @ {debt.apr}% · {formatMoney(debt.monthly_payment, { whole: true })}/mo
            {s.utilization != null && <> · <span style={{ color: currentlyOver ? 'var(--color-expense)' : 'inherit', fontWeight: currentlyOver ? 700 : 400 }}>{Math.round(s.utilization * 100)}% used</span></>}
            {debt.payment_day != null && <> · autopay {ordinal(debt.payment_day)}</>}
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
          initial={{ name: debt.name, balance: debt.balance, apr: debt.apr, credit_limit: debt.credit_limit, monthly_payment: debt.monthly_payment, debt_type: debt.debt_type, payment_day: debt.payment_day, group_id: debt.group_id, account_id: debt.account_id, funding_allocations: debt.funding_allocations ?? [], funding_rules: debt.funding_rules ?? [] }}
          onCancel={() => setEditing(false)}
          onSubmit={async (data) => { await onUpdate(debt.id, data); setEditing(false); }}
        />
      )}
    </>
  );
}

function DebtGroupBlock({ group, debts, groups, accounts, overLimitFor, onUpdate, onDelete, onAddInGroup, onRenameGroup, onDeleteGroup, dragFor, draggingId, groupDrag }: {
  group: LineItemGroup;
  debts: Debt[];
  groups: LineItemGroup[];
  accounts: AccountOpt[];
  overLimitFor: (id: number) => number | null;
  onUpdate: (id: number, data: DebtInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAddInGroup: (groupId: number) => void;
  onRenameGroup: (id: number, name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  dragFor: (d: Debt) => React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  draggingId: number | null;
  groupDrag?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
}) {
  const { collapsed, toggle: toggleCollapsed } = useCollapsedGroup(group.id);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const subtotal = debts.reduce((sum, d) => sum + d.balance, 0);
  const overLimitCount = debts.filter((d) =>
    isCurrentlyOverLimit(d) || overLimitFor(d.id) != null,
  ).length;

  function commitRename() {
    const v = draft.trim();
    setRenaming(false);
    if (v && v !== group.name) onRenameGroup(group.id, v);
    else setDraft(group.name);
  }

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', marginBottom: 8, overflow: 'hidden' }}>
      <div {...groupDrag} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--color-surface-2)', borderLeft: `3px solid ${ACCENT}`, cursor: groupDrag ? 'grab' : undefined }}>
        <button onClick={toggleCollapsed} style={{ background: 'transparent', color: 'var(--color-text)', padding: '0 6px', fontSize: 32, lineHeight: 1, width: 26 }} aria-label={collapsed ? 'Expand group' : 'Collapse group'}>
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
        {overLimitCount > 0 && <OverLimitBadge label={`${overLimitCount} limit warning${overLimitCount !== 1 ? 's' : ''}`} />}
        <span style={{ fontWeight: 700, color: ACCENT, fontSize: 13 }}>{formatMoney(subtotal, { whole: true })}</span>
        <ConfirmButton onConfirm={() => onDeleteGroup(group.id)} title="Remove group (keeps debts, ungrouped)" confirmLabel="Ungroup?" triggerStyle={{ background: 'transparent', color: 'var(--color-text-muted)', padding: '4px 8px', border: '1px solid var(--color-border)', fontSize: 12 }}>
          Ungroup
        </ConfirmButton>
      </div>

      {!collapsed && (
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {debts.map((d) => <DebtRow key={d.id} debt={d} groups={groups} accounts={accounts} overLimitMonth={overLimitFor(d.id)} onUpdate={onUpdate} onDelete={onDelete} drag={dragFor(d)} dragging={draggingId === d.id} />)}
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
  const overLimitFor = (id: number) => plan.overLimitByDebt.get(id) ?? null;
  const overLimitCount = debts.filter((d) => isCurrentlyOverLimit(d) || overLimitFor(d.id) != null).length;
  const interestSaved = (basePlan.totalInterest || 0) - (plan.totalInterest || 0);
  const baseFree = basePlan.debtFreeMonthIndex;
  const planFree = plan.debtFreeMonthIndex;
  const monthsSaved = baseFree != null && planFree != null ? baseFree - planFree : null;
  const { collapsed, toggle } = useCollapsed('debts');

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: collapsed ? 0 : 16, flexWrap: 'wrap', gap: 8 }}>
        <div onClick={toggle} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <CollapseToggle collapsed={collapsed} onToggle={toggle} label="Debts" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Debts</h2>
              {overLimitCount > 0 && <OverLimitBadge label={`${overLimitCount} limit warning${overLimitCount !== 1 ? 's' : ''}`} />}
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginTop: 2 }}>
              Loans &amp; credit cards — payments stop automatically at payoff and free up cash
            </p>
          </div>
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

      {!collapsed && (<>
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
          overLimitFor={overLimitFor}
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
        {ungrouped.map((d) => <DebtRow key={d.id} debt={d} groups={myGroups} accounts={accounts} overLimitMonth={overLimitFor(d.id)} onUpdate={onUpdate} onDelete={onDelete} drag={dnd.handlers(d)} dragging={dnd.dragId === d.id} />)}
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
      </>)}

      {adding && (
        <DebtEditor
          title="Add Debt"
          groups={myGroups}
          accounts={accounts}
          initial={{ name: '', balance: 0, apr: 0, credit_limit: null, monthly_payment: 0, debt_type: 'credit_card', payment_day: null, group_id: adding.groupId, account_id: null, funding_allocations: [], funding_rules: [] }}
          onCancel={() => setAdding(false)}
          onSubmit={async (data) => { await onAdd(data); setAdding(false); }}
        />
      )}
    </div>
  );
}
