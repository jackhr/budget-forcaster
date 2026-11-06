import { useState } from 'react';
import type { Account, Bucket, BudgetCategory, Expense, ExpenseAllocation, Frequency, ItemFormData } from '../types';
import type { BucketInput } from '../api/client';
import { CONTRIBUTION_PERIOD, bucketAccountId, bucketFullMonth, type BucketPlan } from '../lib/buckets';
import { FREQUENCIES, FREQUENCY_LABELS } from '../lib/forecast';
import { formatMoney } from '../lib/format';
import { useDnd } from '../lib/useDnd';
import { useCollapsed } from '../lib/useCollapsed';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';
import { PiggyBank, ShoppingCart, X } from 'lucide-react';
import {
  AddButton, Button, EmptyState, Field, FieldError, ModalActions, MoneyInput,
  Panel, PanelHeader, Pill, cx,
} from '../ui';

interface CardOption { id: number; name: string }

interface Props {
  buckets: Bucket[];
  budgets: Expense[];
  accounts: Account[];
  cards: CardOption[];
  categories: BudgetCategory[];
  bucketPlan: BucketPlan;
  /** Month labels for the forecast, so a month index reads as "Mar 27". */
  labels: string[];
  onAddBucket: (data: BucketInput) => Promise<void>;
  onUpdateBucket: (id: number, data: BucketInput) => Promise<void>;
  onDeleteBucket: (id: number) => Promise<void>;
  onReorderBuckets: (ids: number[]) => void;
  onAddBudget: (data: ItemFormData) => Promise<void>;
  onUpdateBudget: (id: number, data: ItemFormData) => Promise<void>;
  onDeleteBudget: (id: number) => Promise<void>;
}

function firstOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** FOOD_AND_DRINK → "Food and drink". */
export function categoryLabel(code: string): string {
  const words = code.toLowerCase().split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function accountName(id: number | null, accounts: Account[]): string {
  return accounts.find((a) => a.id === id)?.name ?? 'primary account';
}

/** A one-line bar: how full something is. The width is a proportion, so it's computed. */
function Bar({ fraction, tone }: { fraction: number; tone: 'income' | 'primary' | 'warning' | 'expense' }) {
  const fill = { income: 'bg-income', primary: 'bg-primary', warning: 'bg-warning', expense: 'bg-expense' }[tone];
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
      <div className={cx('h-full rounded-full', fill)} style={{ width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%` }} />
    </div>
  );
}

/* --------------------------------- Buckets -------------------------------- */

function BucketEditor({
  title, initial, accounts, availableToday, onCancel, onSubmit,
}: {
  title: string;
  initial: BucketInput;
  accounts: Account[];
  availableToday: Map<number, number>;
  onCancel: () => void;
  onSubmit: (data: BucketInput) => Promise<void>;
}) {
  const primaryId = (accounts.find((a) => a.is_primary) ?? accounts[0])?.id ?? null;
  const [name, setName] = useState(initial.name);
  const [accountId, setAccountId] = useState<number | null>(initial.account_id ?? primaryId);
  const [balance, setBalance] = useState(String(initial.balance));
  const [contribution, setContribution] = useState(initial.contribution ? String(initial.contribution) : '');
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency);
  const [start, setStart] = useState(initial.start_date ?? '');
  const [end, setEnd] = useState(initial.end_date ?? '');
  const [target, setTarget] = useState(initial.target_amount != null ? String(initial.target_amount) : '');
  const [note, setNote] = useState(initial.note ?? '');
  const [saving, setSaving] = useState(false);

  const balanceNum = balance === '' ? 0 : parseFloat(balance);
  const contributionNum = contribution === '' ? 0 : parseFloat(contribution);
  const targetNum = target === '' ? null : parseFloat(target);
  const oneTime = frequency === 'one-time';
  const errors = [
    !name.trim() && 'Give it a name.',
    (isNaN(balanceNum) || balanceNum < 0) && 'Set-aside amount must be zero or more.',
    (isNaN(contributionNum) || contributionNum < 0) && 'Contribution must be zero or more.',
    targetNum != null && (isNaN(targetNum) || targetNum <= 0) && 'Target must be greater than zero.',
    !oneTime && start && end && end < start && 'The end date is before the start.',
  ].filter(Boolean) as string[];
  // "Free" already excludes this bucket's own saved balance when editing, so add it back.
  const free = accountId != null ? availableToday.get(accountId) : undefined;
  const freeForThis = free != null ? free + ((initial.account_id ?? primaryId) === accountId ? initial.balance : 0) : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (errors.length) return;
    setSaving(true);
    await onSubmit({
      name: name.trim(),
      account_id: accountId,
      balance: balanceNum,
      contribution: contributionNum,
      frequency,
      start_date: start || null,
      end_date: oneTime ? null : end || null,
      target_amount: targetNum,
      note: note.trim() || null,
    });
    setSaving(false);
  }

  return (
    <Modal title={title} onClose={onCancel} maxWidth={540}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name" hint="What the money is for — “Emergency fund”, “Car repairs”, “Holidays”.">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" autoFocus required className="w-full" />
        </Field>

        <Field label="Held in" hint="The money stays in this account. It just stops counting as free to spend.">
          <select value={accountId ?? ''} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)} className="w-full">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
          </select>
        </Field>

        <Field
          label="Set aside now"
          hint={freeForThis != null ? `${formatMoney(freeForThis, { whole: true })} in this account isn't in a bucket yet.` : undefined}
        >
          <MoneyInput value={balance} onChange={(e) => setBalance(e.target.value)} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Add">
            <MoneyInput value={contribution} onChange={(e) => setContribution(e.target.value)} placeholder="0" />
          </Field>
          <Field label="How often">
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className="w-full">
              {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
            </select>
          </Field>
          <Field label={oneTime ? 'On' : 'Starting'} hint={oneTime ? undefined : 'Blank = this month. An annual amount repeats in this month each year.'}>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full" />
          </Field>
          {!oneTime && (
            <Field label="Until (optional)">
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full" />
            </Field>
          )}
        </div>

        <Field label="Target (optional)" hint="Contributions stop once the bucket holds this much.">
          <MoneyInput value={target} onChange={(e) => setTarget(e.target.value)} placeholder="No cap" />
        </Field>

        <Field label="Note (optional)">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Three months of rent" className="w-full" />
        </Field>

        {errors.map((msg) => <FieldError key={msg}>{msg}</FieldError>)}

        <ModalActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || errors.length > 0}>
            {saving ? 'Saving…' : 'Save bucket'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

function BucketRow({
  bucket, accounts, plan, labels, onEdit, onDelete, drag, dragging,
}: {
  bucket: Bucket;
  accounts: Account[];
  plan: BucketPlan;
  labels: string[];
  onEdit: () => void;
  onDelete: () => void;
  drag?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  dragging?: boolean;
}) {
  const series = plan.series.get(bucket.id) ?? [];
  const accountId = bucketAccountId(bucket, accounts);
  const shortfall = plan.shortfalls.find((s) => s.accountId === accountId);
  const fullAt = bucketFullMonth(bucket, series);
  const full = bucket.target_amount != null && bucket.balance >= bucket.target_amount - 0.005;
  const end = series[series.length - 1];
  const contributes = bucket.contribution > 0;

  return (
    <div
      {...drag}
      className={cx(
        'flex flex-col gap-2 rounded-control border border-border px-3.5 py-3',
        drag && 'cursor-grab',
        dragging && 'outline-2 outline-dashed outline-primary',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{bucket.name}</span>
            {full && <Pill tone="income">Full</Pill>}
            {shortfall && (
              <Pill tone="danger" title={`${accountName(accountId, accounts)} holds ${formatMoney(shortfall.shortBy, { whole: true })} less than its buckets.`}>
                {shortfall.monthIndex < 0 ? 'Not covered' : `Not covered from ${labels[shortfall.monthIndex] ?? 'later'}`}
              </Pill>
            )}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            <strong className="text-text">{formatMoney(bucket.balance, { whole: true })}</strong> in {accountName(accountId, accounts)}
            {contributes && (
              <> · {bucket.frequency === 'one-time' ? '' : '+'}{formatMoney(bucket.contribution, { whole: true })}
                {bucket.frequency === 'one-time' ? ' once' : ` / ${CONTRIBUTION_PERIOD[bucket.frequency]}`}
                {bucket.start_date && <> from {bucket.start_date}</>}
                {bucket.end_date && <> until {bucket.end_date}</>}</>
            )}
          </div>
          {bucket.note && <p className="mt-0.5 text-[12px] text-faint">{bucket.note}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={onEdit}>Edit</Button>
          <ConfirmButton onConfirm={onDelete} title={`Delete ${bucket.name}`}>
            <X size={14} strokeWidth={2.2} aria-hidden="true" />
          </ConfirmButton>
        </div>
      </div>

      {bucket.target_amount != null ? (
        <div>
          <Bar fraction={bucket.balance / bucket.target_amount} tone={full ? 'income' : 'primary'} />
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11.5px] text-muted">
            <span>{formatMoney(bucket.balance, { whole: true })} of {formatMoney(bucket.target_amount, { whole: true })}</span>
            <span>
              {full ? 'Full.' : fullAt != null
                ? <>Full by <strong className="text-text">{labels[fullAt]}</strong></>
                : contributes ? 'Not full inside the forecast.' : 'Add a contribution to fill it.'}
            </span>
          </div>
        </div>
      ) : contributes && end != null && (
        <div className="text-[11.5px] text-muted">
          {formatMoney(end, { whole: true })} by <strong className="text-text">{labels[labels.length - 1]}</strong>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Budgets -------------------------------- */

/** A funding plan the simple "Paid from" picker can't show without losing it. */
function hasSplit(e: Expense): boolean {
  return e.funding_rules.length > 0 || (e.funding_allocations.length > 0 && !sourceValue(e.funding_allocations));
}

/** The single "paid from" a simple budget uses, as a select value. */
function sourceValue(allocations: ExpenseAllocation[]): string {
  const only = allocations.length === 1 && allocations[0].alloc_type === 'percent' && allocations[0].value === 100 ? allocations[0] : null;
  if (!only || only.source_id == null) return '';
  return `${only.source_type}:${only.source_id}`;
}

function BudgetEditor({
  title, initial, accounts, cards, categories, onCancel, onSubmit,
}: {
  title: string;
  initial: { name: string; amount: number | null; source: string; categories: string[]; split: boolean };
  accounts: Account[];
  cards: CardOption[];
  categories: BudgetCategory[];
  onCancel: () => void;
  onSubmit: (data: { name: string; amount: number; source: string; categories: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [amount, setAmount] = useState(initial.amount != null ? String(initial.amount) : '');
  const [source, setSource] = useState(initial.source);
  const [picked, setPicked] = useState<string[]>(initial.categories);
  const [saving, setSaving] = useState(false);
  const amountNum = parseFloat(amount);
  const valid = name.trim().length > 0 && amountNum > 0;
  // Categories saved on the budget but no longer seen in transactions still show, so they can be removed.
  const options = [
    ...categories,
    ...picked.filter((c) => !categories.some((x) => x.category === c)).map((category) => ({ category, this_month: 0, monthly_average: 0 })),
  ];
  const suggested = picked.reduce((sum, c) => sum + (categories.find((x) => x.category === c)?.monthly_average ?? 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    await onSubmit({ name: name.trim(), amount: amountNum, source, categories: picked });
    setSaving(false);
  }

  const toggle = (c: string) => setPicked((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <Modal title={title} onClose={onCancel} maxWidth={540}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name" hint="Spending that varies — “Groceries”, “Eating out”, “Gas”.">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" autoFocus required className="w-full" />
        </Field>

        <Field
          label="Per month"
          hint={suggested > 0 ? `You've averaged ${formatMoney(suggested, { whole: true })} a month in these categories over the last three months.` : 'The forecast spends this every month.'}
        >
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>

        {initial.split ? (
          <p className="text-[12.5px] text-muted">This budget has a split or scheduled funding plan — change it from the Expenses page.</p>
        ) : (
          <Field label="Paid from" hint="A card here means the spending is charged to it, and paid off through the card.">
            <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full">
              <option value="">Primary account</option>
              <optgroup label="Accounts">
                {accounts.map((a) => <option key={a.id} value={`account:${a.id}`}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
              </optgroup>
              {cards.length > 0 && (
                <optgroup label="Credit cards">
                  {cards.map((c) => <option key={c.id} value={`debt:${c.id}`}>{c.name}</option>)}
                </optgroup>
              )}
            </select>
          </Field>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[12.5px] font-semibold text-text">Track spending in</legend>
          {options.length === 0 ? (
            <p className="text-[12.5px] text-muted">
              Link a bank under Account to track what's actually spent. Without it, the budget is still part of the forecast.
            </p>
          ) : (
            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-control border border-border p-2 sm:grid-cols-2">
              {options.map((c) => (
                <label key={c.category} className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1 text-[12.5px] hover:bg-surface-2">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={picked.includes(c.category)} onChange={() => toggle(c.category)} />
                    {categoryLabel(c.category)}
                  </span>
                  {c.monthly_average > 0 && <span className="tabular-nums text-faint">{formatMoney(c.monthly_average, { whole: true })}/mo</span>}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {!(amountNum > 0) && amount !== '' && <FieldError>Enter an amount greater than zero.</FieldError>}

        <ModalActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !valid}>
            {saving ? 'Saving…' : 'Save budget'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

function BudgetRow({
  budget, accounts, cards, onEdit, onDelete,
}: {
  budget: Expense;
  accounts: Account[];
  cards: CardOption[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tracked = (budget.budget_categories ?? []).length > 0;
  const spent = budget.spent_this_month ?? 0;
  const fraction = budget.monthly_amount > 0 ? spent / budget.monthly_amount : 0;
  const left = budget.monthly_amount - spent;
  const source = sourceValue(budget.funding_allocations);
  const [kind, idText] = source.split(':');
  const from = hasSplit(budget)
    ? 'a split'
    : kind === 'debt'
      ? cards.find((c) => c.id === Number(idText))?.name ?? 'a card'
      : kind === 'account' ? accountName(Number(idText), accounts) : 'primary account';

  return (
    <div className="flex flex-col gap-2 rounded-control border border-border px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{budget.name}</span>
            {tracked && fraction > 1 && <Pill tone="danger">Over</Pill>}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            <strong className="text-text">{formatMoney(budget.monthly_amount, { whole: true })}</strong> / month · from {from}
          </div>
          <div className="mt-0.5 text-[12px] text-faint">
            {tracked ? (budget.budget_categories ?? []).map(categoryLabel).join(' · ') : 'No categories tracked — the forecast spends the full amount each month.'}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={onEdit}>Edit</Button>
          <ConfirmButton onConfirm={onDelete} title={`Delete ${budget.name}`}>
            <X size={14} strokeWidth={2.2} aria-hidden="true" />
          </ConfirmButton>
        </div>
      </div>
      {tracked && (
        <div>
          <Bar fraction={fraction} tone={fraction > 1 ? 'expense' : fraction >= 0.8 ? 'warning' : 'income'} />
          <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11.5px] text-muted">
            <span>{formatMoney(spent, { whole: true })} spent this month</span>
            <span className={cx(left < 0 && 'font-semibold text-expense')}>
              {left >= 0 ? `${formatMoney(left, { whole: true })} left` : `${formatMoney(-left, { whole: true })} over`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export default function Budgets({
  buckets, budgets, accounts, cards, categories, bucketPlan, labels,
  onAddBucket, onUpdateBucket, onDeleteBucket, onReorderBuckets,
  onAddBudget, onUpdateBudget, onDeleteBudget,
}: Props) {
  const [addingBucket, setAddingBucket] = useState(false);
  const [editingBucketId, setEditingBucketId] = useState<number | null>(null);
  const [addingBudget, setAddingBudget] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);
  const bucketsSection = useCollapsed('buckets');
  const budgetsSection = useCollapsed('budgets');
  const dnd = useDnd<Bucket>(buckets, onReorderBuckets);

  const editingBucket = buckets.find((b) => b.id === editingBucketId) ?? null;
  const editingBudget = budgets.find((b) => b.id === editingBudgetId) ?? null;
  const setAside = buckets.reduce((sum, b) => sum + b.balance, 0);
  const budgeted = budgets.reduce((sum, b) => sum + b.monthly_amount, 0);
  const spent = budgets.reduce((sum, b) => sum + ((b.budget_categories ?? []).length ? (b.spent_this_month ?? 0) : 0), 0);
  const trackedBudgeted = budgets.reduce((sum, b) => sum + ((b.budget_categories ?? []).length ? b.monthly_amount : 0), 0);
  const shortAccounts = bucketPlan.shortfalls.length;

  const toBudgetData = (data: { name: string; amount: number; source: string; categories: string[] }, existing?: Expense): ItemFormData => {
    const [type, id] = data.source.split(':');
    const keepSplit = existing && hasSplit(existing);
    return {
      name: data.name,
      monthly_amount: data.amount,
      frequency: 'monthly',
      start_date: existing?.start_date ?? firstOfThisMonth(),
      end_date: existing?.end_date ?? null,
      group_id: existing?.group_id ?? null,
      ...(!keepSplit && {
        funding_allocations: data.source
          ? [{ source_type: type as 'account' | 'debt', source_id: Number(id), alloc_type: 'percent' as const, value: 100 }]
          : [],
      }),
      is_budget: 1,
      budget_categories: data.categories,
    };
  };

  return (
    <>
      <Panel>
        <PanelHeader
          title="Buckets"
          description="Money set aside inside an account. It stays in the account, but it's no longer free to spend."
          badges={shortAccounts > 0 && <Pill tone="danger">{shortAccounts} account{shortAccounts === 1 ? '' : 's'} short</Pill>}
          stats={buckets.length > 0 ? [{ label: 'Set aside', value: formatMoney(setAside, { whole: true }), className: 'text-net-pos' }] : undefined}
          collapsed={bucketsSection.collapsed}
          onToggle={bucketsSection.toggle}
        />
        {!bucketsSection.collapsed && (
          <>
            {accounts.length > 0 && buckets.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted">
                {accounts.filter((a) => bucketPlan.committedByAccount.has(a.id)).map((a) => {
                  const free = bucketPlan.availableToday.get(a.id) ?? a.balance;
                  return (
                    <span key={a.id}>
                      {a.name}: <strong className={cx(free < 0 ? 'text-expense' : 'text-text')}>{formatMoney(free, { whole: true })}</strong> free of {formatMoney(a.balance, { whole: true })}
                    </span>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {buckets.map((b) => (
                <BucketRow
                  key={b.id}
                  bucket={b}
                  accounts={accounts}
                  plan={bucketPlan}
                  labels={labels}
                  onEdit={() => setEditingBucketId(b.id)}
                  onDelete={() => onDeleteBucket(b.id)}
                  drag={dnd.handlers(b)}
                  dragging={dnd.dragId === b.id}
                />
              ))}
              {buckets.length === 0 && (
                <EmptyState>
                  <span className="inline-flex items-center gap-1.5">
                    <PiggyBank size={14} strokeWidth={2} aria-hidden="true" />
                    No buckets yet. Set money aside for an emergency fund, a trip, or next year's insurance.
                  </span>
                </EmptyState>
              )}
            </div>
            <AddButton accent="cash" onClick={() => setAddingBucket(true)} className="mt-3 w-full" disabled={accounts.length === 0}>
              + Add Bucket
            </AddButton>
          </>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Budgets"
          description="Spending limits for costs that vary. Each one is an expense in the forecast; tracked categories show what's been spent this month."
          stats={budgets.length > 0 ? [
            ...(trackedBudgeted > 0 ? [{ label: 'Spent', value: `${formatMoney(spent, { whole: true })} / ${formatMoney(trackedBudgeted, { whole: true })}`, className: spent > trackedBudgeted ? 'text-expense' : 'text-text' }] : []),
            { label: 'Per month', value: formatMoney(budgeted, { whole: true }), className: 'text-expense' },
          ] : undefined}
          collapsed={budgetsSection.collapsed}
          onToggle={budgetsSection.toggle}
        />
        {!budgetsSection.collapsed && (
          <>
            <div className="flex flex-col gap-2">
              {budgets.map((b) => (
                <BudgetRow
                  key={b.id}
                  budget={b}
                  accounts={accounts}
                  cards={cards}
                  onEdit={() => setEditingBudgetId(b.id)}
                  onDelete={() => onDeleteBudget(b.id)}
                />
              ))}
              {budgets.length === 0 && (
                <EmptyState>
                  <span className="inline-flex items-center gap-1.5">
                    <ShoppingCart size={14} strokeWidth={2} aria-hidden="true" />
                    No budgets yet. Add one for groceries, eating out or gas — anything without a fixed bill.
                  </span>
                </EmptyState>
              )}
            </div>
            <AddButton accent="expense" onClick={() => setAddingBudget(true)} className="mt-3 w-full">
              + Add Budget
            </AddButton>
          </>
        )}
      </Panel>

      {addingBucket && (
        <BucketEditor
          title="Add Bucket"
          accounts={accounts}
          availableToday={bucketPlan.availableToday}
          initial={{
            name: '', account_id: null, balance: 0, contribution: 0, frequency: 'monthly',
            start_date: null, end_date: null, target_amount: null, note: null,
          }}
          onCancel={() => setAddingBucket(false)}
          onSubmit={async (data) => { await onAddBucket(data); setAddingBucket(false); }}
        />
      )}
      {editingBucket && (
        <BucketEditor
          title={`Edit ${editingBucket.name}`}
          accounts={accounts}
          availableToday={bucketPlan.availableToday}
          initial={editingBucket}
          onCancel={() => setEditingBucketId(null)}
          onSubmit={async (data) => { await onUpdateBucket(editingBucket.id, data); setEditingBucketId(null); }}
        />
      )}
      {addingBudget && (
        <BudgetEditor
          title="Add Budget"
          accounts={accounts}
          cards={cards}
          categories={categories}
          initial={{ name: '', amount: null, source: '', categories: [], split: false }}
          onCancel={() => setAddingBudget(false)}
          onSubmit={async (data) => { await onAddBudget(toBudgetData(data)); setAddingBudget(false); }}
        />
      )}
      {editingBudget && (
        <BudgetEditor
          title={`Edit ${editingBudget.name}`}
          accounts={accounts}
          cards={cards}
          categories={categories}
          initial={{
            name: editingBudget.name,
            amount: editingBudget.monthly_amount,
            source: sourceValue(editingBudget.funding_allocations),
            categories: editingBudget.budget_categories ?? [],
            split: hasSplit(editingBudget),
          }}
          onCancel={() => setEditingBudgetId(null)}
          onSubmit={async (data) => {
            await onUpdateBudget(editingBudget.id, toBudgetData(data, editingBudget));
            setEditingBudgetId(null);
          }}
        />
      )}
    </>
  );
}
