import { useState } from 'react';
import type { Debt, DebtType, ExpenseAllocation, FundingRule, LineItemGroup } from '../types';
import { summarizeDebt, type DebtPlan, type DebtStrategy } from '../lib/debt';
import { formatMoney } from '../lib/format';
import { useDnd } from '../lib/useDnd';
import { useCollapsedGroup } from '../lib/useCollapsedGroup';
import { useCollapsed } from '../lib/useCollapsed';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';
import FundingPlanModal, { summarizeFundingPlan } from './FundingPlanModal';
import { AlertTriangle, X } from 'lucide-react';
import {
  ACCENTS, AddButton, Button, EmptyState, Field, FieldError, IconButton, ModalActions,
  MoneyInput, PaidToggle, Panel, PanelHeader, PercentInput, Pill, cx,
} from '../ui';
import { GroupBar } from '../ui/GroupBar';

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
  isPaidThisMonth: (d: Debt) => boolean;
  paidDetail?: (d: Debt) => string | null; // why it counts as paid/unpaid (manual, Plaid, autopay day)
  onTogglePaid: (d: Debt) => void;
}

const ACCENT = ACCENTS.debt;

function OverLimitBadge({ label }: { label: string }) {
  return (
    <Pill tone="danger" className="gap-1">
      <AlertTriangle size={11} strokeWidth={2.4} aria-hidden="true" />{label}
    </Pill>
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
  // A payment is required while something is owed; a paid-off debt may carry $0.
  const paymentValid = balNum > 0 ? payNum > 0 : !(payNum < 0);
  const fundingPercentValid = fundingRules.every((r) => r.alloc_type !== 'percent' || r.value <= 100);

  const preview = (balNum > 0 && payNum > 0 && aprNum >= 0)
    ? summarizeDebt({ id: 0, name, balance: balNum, apr: aprNum, credit_limit: limNum, monthly_payment: payNum, debt_type: debtType, payment_day: dayNum, group_id: null, account_id: null, funding_allocations: [], funding_rules: [], created_at: '', updated_at: '' })
    : null;

  const valid = name.trim().length > 0 && balNum >= 0 && paymentValid && fundingPercentValid && (isNaN(aprNum) ? false : aprNum >= 0);

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
    <Modal title={title} onClose={onCancel} maxWidth={520}>
      <form onSubmit={handle} className="flex flex-col gap-4">
        <Field label="Name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rewards card" autoFocus required className="w-full" />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <select value={debtType} onChange={(e) => setDebtType(e.target.value as DebtType)} className="w-full">
              <option value="credit_card">Credit card (revolving — can be charged)</option>
              <option value="loan">Loan (installment — no credit)</option>
            </select>
          </Field>
          <Field label="Autopay day (optional)">
            <input type="number" value={payDay} onChange={(e) => setPayDay(e.target.value)} min={1} max={31} step={1} placeholder="1–31" className="w-full" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Balance">
            <MoneyInput value={balance} onChange={(e) => setBalance(e.target.value)} required />
          </Field>
          <Field label="APR">
            <PercentInput value={apr} onChange={(e) => setApr(e.target.value)} required />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monthly Payment">
            <MoneyInput value={payment} onChange={(e) => setPayment(e.target.value)} required />
          </Field>
          {isCard && (
            <Field label="Credit Limit (optional)">
              <MoneyInput value={limit} onChange={(e) => setLimit(e.target.value)} />
            </Field>
          )}
        </div>

        {overLimit && (
          <FieldError>This card is {formatMoney(balNum - limNum!, { whole: true })} over its credit limit.</FieldError>
        )}
        {!paymentValid && (
          <FieldError>
            A monthly payment greater than $0 is required while a balance is owed. It is also the payment used in
            months no funding rule covers.
          </FieldError>
        )}
        {!fundingPercentValid && (
          <FieldError>A funding-plan percentage exceeds 100%. Edit the funding plan before saving this debt.</FieldError>
        )}

        <Field label="Pay from">
          {advancedFunding ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-text">{summarizeFundingPlan(fundingRules, allocations)}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setEditingFunding(true)} className="border-dashed">Edit funding plan</Button>
                <Button size="sm" onClick={() => { setFundingRules([]); setAllocations([]); }}>Use one account</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <select
                value={payAccountId ?? ''}
                onChange={(e) => setAllocations(e.target.value ? [{ source_type: 'account', source_id: Number(e.target.value), alloc_type: 'percent', value: 100 }] : [])}
                className="w-full"
              >
                <option value="">Primary account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
              </select>
              <Button size="sm" onClick={() => setEditingFunding(true)} className="self-start border-dashed">
                Split across accounts or schedule…
              </Button>
            </div>
          )}
        </Field>

        <Field label="Group">
          <select value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)} className="w-full">
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>

        {preview && (
          <div className="rounded-control border border-border bg-surface-2 px-3 py-2.5 text-[13px]">
            {preview.neverPaysOff ? (
              <span className="flex items-start gap-1.5 text-danger">
                <AlertTriangle size={13} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
                <span>This payment won’t cover the interest — the balance never gets paid off. Increase the monthly payment.</span>
              </span>
            ) : (
              <span className="text-text">
                Paid off in <strong>{preview.monthsToPayoff}</strong> months
                {preview.payoffMonthIndex != null && <> ({payoffDateLabel(preview.payoffMonthIndex)})</>}
                {' · '}<span className="text-muted">{formatMoney(preview.totalInterest!)} total interest</span>
              </span>
            )}
          </div>
        )}

        <ModalActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="bare" disabled={saving || !valid} className={ACCENT.solid}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

function DebtRow({ debt, groups, accounts, overLimitMonth, paid, paidDetail, onTogglePaid, onUpdate, onDelete, drag, dragging }: {
  debt: Debt;
  groups: LineItemGroup[];
  accounts: AccountOpt[];
  overLimitMonth?: number | null; // first forecast month its balance exceeds the limit
  paid: boolean;
  paidDetail?: string | null;
  onTogglePaid: () => void;
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
      <div
        {...drag}
        className={cx(
          'flex flex-wrap items-center justify-between gap-3 rounded-control border border-border border-l-[3px] px-3.5 py-3',
          ACCENT.rail,
          drag && 'cursor-grab',
          dragging && 'outline-2 outline-dashed outline-primary',
        )}
      >
        <div className="min-w-[160px]">
          <div className="flex flex-wrap items-center gap-1.5 font-semibold">
            {debt.name}
            {currentlyOver && <OverLimitBadge label="Over limit" />}
            {forecastOver && <OverLimitBadge label={`Over limit ${payoffDateLabel(overLimitMonth)}`} />}
          </div>
          <div className="text-[12.5px] text-muted">
            {debt.debt_type === 'loan' ? 'Loan' : 'Card'} · {formatMoney(debt.balance, { whole: true })} @ {debt.apr}% · {formatMoney(debt.monthly_payment, { whole: true })}/mo
            {s.utilization != null && (
              <> · <span className={currentlyOver ? 'font-bold text-expense' : undefined}>{Math.round(s.utilization * 100)}% used</span></>
            )}
            {debt.payment_day != null && <> · autopay {ordinal(debt.payment_day)}</>}
            {payFrom && <> · from {payFrom}</>}
          </div>
        </div>

        <div className="min-w-[180px] flex-1 text-[13px]">
          {s.neverPaysOff ? (
            <span className="inline-flex items-center gap-1 text-expense">
              <AlertTriangle size={12} strokeWidth={2.2} aria-hidden="true" />
              Payment won’t cover interest — never pays off
            </span>
          ) : (
            <span className="text-text">
              Paid off <strong>{payoffDateLabel(s.payoffMonthIndex!)}</strong>
              <span className="text-muted"> · {s.monthsToPayoff} mo · {formatMoney(s.totalInterest!, { whole: true })} interest</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <PaidToggle paid={paid} onToggle={onTogglePaid} detail={paidDetail} noun="payment" />
          <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>
          <ConfirmButton onConfirm={() => onDelete(debt.id)} title={`Delete ${debt.name}`}>
            <X size={14} strokeWidth={2.2} aria-hidden="true" />
          </ConfirmButton>
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

function DebtGroupBlock({ group, debts, groups, accounts, overLimitFor, isPaidThisMonth, paidDetail, onTogglePaid, onUpdate, onDelete, onAddInGroup, onRenameGroup, onDeleteGroup, dragFor, draggingId, groupDrag }: {
  group: LineItemGroup;
  debts: Debt[];
  groups: LineItemGroup[];
  accounts: AccountOpt[];
  overLimitFor: (id: number) => number | null;
  isPaidThisMonth: (d: Debt) => boolean;
  paidDetail?: (d: Debt) => string | null;
  onTogglePaid: (d: Debt) => void;
  onUpdate: (id: number, data: DebtInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onAddInGroup: (groupId: number) => void;
  onRenameGroup: (id: number, name: string) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
  dragFor: (d: Debt) => React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  draggingId: number | null;
  groupDrag?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
}) {
  const { collapsed, toggle } = useCollapsedGroup(group.id);
  const subtotal = debts.reduce((sum, d) => sum + d.balance, 0);
  const overLimitCount = debts.filter((d) => isCurrentlyOverLimit(d) || overLimitFor(d.id) != null).length;

  return (
    <GroupBar
      accent="debt"
      name={group.name}
      count={debts.length}
      noun="debt"
      subtotal={formatMoney(subtotal, { whole: true })}
      badges={overLimitCount > 0 && <OverLimitBadge label={`${overLimitCount} limit warning${overLimitCount !== 1 ? 's' : ''}`} />}
      collapsed={collapsed}
      onToggle={toggle}
      onRename={(name) => onRenameGroup(group.id, name)}
      onDelete={() => onDeleteGroup(group.id)}
      drag={groupDrag}
    >
      <div className="flex flex-col gap-2 p-2">
        {debts.map((d) => (
          <DebtRow
            key={d.id}
            debt={d}
            groups={groups}
            accounts={accounts}
            overLimitMonth={overLimitFor(d.id)}
            paid={isPaidThisMonth(d)}
            paidDetail={paidDetail?.(d)}
            onTogglePaid={() => onTogglePaid(d)}
            onUpdate={onUpdate}
            onDelete={onDelete}
            drag={dragFor(d)}
            dragging={draggingId === d.id}
          />
        ))}
        {debts.length === 0 && <EmptyState compact>Empty group — add a debt below.</EmptyState>}
        <AddButton accent="debt" onClick={() => onAddInGroup(group.id)} className="self-start">
          + Add debt to {group.name}
        </AddButton>
      </div>
    </GroupBar>
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
    return <Button onClick={() => setOpen(true)}>+ New Group</Button>;
  }

  return (
    <form onSubmit={submit} className="flex flex-1 gap-1.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name (e.g. Credit cards)"
        autoFocus
        className="min-w-0 flex-1"
        required
      />
      <Button type="submit" variant="bare" disabled={saving} className={ACCENT.solid}>
        {saving ? '…' : 'Create'}
      </Button>
      <IconButton tone="neutral" onClick={() => setOpen(false)} aria-label="Cancel">
        <X size={14} strokeWidth={2.2} aria-hidden="true" />
      </IconButton>
    </form>
  );
}

function payoffDateFromIndex(monthIndex: number | null): string {
  if (monthIndex == null) return 'never';
  return payoffDateLabel(monthIndex);
}

export default function Debts({ debts, groups, accounts, onAdd, onUpdate, onDelete, onAddGroup, onRenameGroup, onDeleteGroup, onReorder, onReorderGroup, plan, basePlan, extra, strategy, onExtraChange, onStrategyChange, isPaidThisMonth, paidDetail, onTogglePaid }: Props) {
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
    <Panel>
      <PanelHeader
        title="Debts"
        description="Loans & credit cards — payments stop automatically at payoff and free up cash"
        badges={overLimitCount > 0 && <OverLimitBadge label={`${overLimitCount} limit warning${overLimitCount !== 1 ? 's' : ''}`} />}
        stats={[
          { label: 'Total Owed', value: formatMoney(totalBalance, { whole: true }), className: ACCENT.text },
          { label: 'Monthly', value: formatMoney(totalMonthly, { whole: true }) },
        ]}
        collapsed={collapsed}
        onToggle={toggle}
      />

      {!collapsed && (
        <>
          {/* Payoff plan */}
          {hasDebts && (
            <div className="mb-3 flex flex-wrap items-end gap-4 rounded-control border border-border bg-surface-2 px-3.5 py-3">
              <Field label="Strategy" className="min-w-[220px] flex-1">
                <select value={strategy} onChange={(e) => onStrategyChange(e.target.value as DebtStrategy)} className="w-full">
                  <option value="none">None (pay minimums)</option>
                  <option value="avalanche">Avalanche (highest APR first)</option>
                  <option value="snowball">Snowball (smallest balance first)</option>
                </select>
              </Field>
              <Field label="Extra / mo" className="w-[130px]">
                <MoneyInput
                  value={extra || ''}
                  onChange={(e) => onExtraChange(parseFloat(e.target.value) || 0)}
                  disabled={strategy === 'none'}
                />
              </Field>
              <div className="ml-auto pb-1.5 text-right text-[13px]">
                <div>Debt-free: <strong>{payoffDateFromIndex(plan.debtFreeMonthIndex)}</strong></div>
                {strategy !== 'none' && (interestSaved > 1 || (monthsSaved ?? 0) > 0) && (
                  <div className="text-[12px] text-income">
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
              isPaidThisMonth={isPaidThisMonth}
              paidDetail={paidDetail}
              onTogglePaid={onTogglePaid}
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
          <div className="flex flex-col gap-2">
            {ungrouped.map((d) => (
              <DebtRow
                key={d.id}
                debt={d}
                groups={myGroups}
                accounts={accounts}
                overLimitMonth={overLimitFor(d.id)}
                paid={isPaidThisMonth(d)}
                paidDetail={paidDetail?.(d)}
                onTogglePaid={() => onTogglePaid(d)}
                onUpdate={onUpdate}
                onDelete={onDelete}
                drag={dnd.handlers(d)}
                dragging={dnd.dragId === d.id}
              />
            ))}
            {debts.length === 0 && (
              <EmptyState>No debts tracked. Add a loan or credit card to see when it’s paid off.</EmptyState>
            )}
          </div>

          <AddButton accent="debt" onClick={() => setAdding({ groupId: null })} className="mt-3 w-full">
            + Add Debt
          </AddButton>

          <div className="mt-2 flex gap-2">
            <AddGroupInline onAddGroup={onAddGroup} />
          </div>
        </>
      )}

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
    </Panel>
  );
}
