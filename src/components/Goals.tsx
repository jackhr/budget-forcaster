import { useState } from 'react';
import type { Account, Debt, Goal, GoalKind } from '../types';
import { GOAL_KINDS, STATUS_LABEL, type GoalInputs, type GoalProgress, goalBoard } from '../lib/goals';
import { formatMoney } from '../lib/format';
import { useDnd } from '../lib/useDnd';
import { useCollapsed } from '../lib/useCollapsed';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';
import { Target, X } from 'lucide-react';
import {
  AddButton, Button, EmptyState, Field, FieldError, ModalActions, MoneyInput,
  Panel, PanelHeader, Pill, cx,
} from '../ui';

export type GoalInput = Omit<Goal, 'id' | 'start_amount' | 'sort_order' | 'created_at' | 'updated_at'>;

interface Props {
  goals: Goal[];
  accounts: Account[];
  debts: Debt[];
  inputs: GoalInputs;
  onAdd: (data: GoalInput) => Promise<void>;
  onUpdate: (id: number, data: GoalInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onReorder: (ids: number[]) => void;
}

const STATUS_TONE: Record<GoalProgress['status'], 'income' | 'expense' | 'warning' | 'neutral' | 'primary'> = {
  met: 'income',
  'on-track': 'primary',
  ahead: 'income',
  behind: 'warning',
  'off-track': 'expense',
  untracked: 'neutral',
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** What a goal is tracking, in words. */
function targetLabel(goal: Goal, accounts: Account[], debts: Debt[]): string {
  if (goal.kind === 'net_worth') return 'net worth';
  if (goal.kind === 'debt_payoff') {
    if (goal.debt_id == null) return 'everything owed';
    return debts.find((d) => d.id === goal.debt_id)?.name ?? 'a deleted debt';
  }
  if (goal.account_id == null) return 'all cash';
  return accounts.find((a) => a.id === goal.account_id)?.name ?? 'a deleted account';
}

function GoalEditor({
  title, initial, accounts, debts, onCancel, onSubmit,
}: {
  title: string;
  initial: GoalInput;
  accounts: Account[];
  debts: Debt[];
  onCancel: () => void;
  onSubmit: (data: GoalInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState<GoalKind>(initial.kind);
  const [amount, setAmount] = useState(initial.target_amount != null ? String(initial.target_amount) : '');
  const [date, setDate] = useState(initial.target_date ?? '');
  const [accountId, setAccountId] = useState<number | null>(initial.account_id);
  const [debtId, setDebtId] = useState<number | null>(initial.debt_id);
  const [note, setNote] = useState(initial.note ?? '');
  const [saving, setSaving] = useState(false);

  // A payoff goal's target is zero by definition, so it asks for no amount.
  const needsAmount = kind !== 'debt_payoff';
  const amountNum = parseFloat(amount);
  const amountValid = !needsAmount || amountNum > 0;
  const dateValid = !date || date >= today();
  const valid = name.trim().length > 0 && amountValid && dateValid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    await onSubmit({
      name: name.trim(),
      kind,
      target_amount: needsAmount ? amountNum : null,
      target_date: date || null,
      account_id: kind === 'savings' ? accountId : null,
      debt_id: kind === 'debt_payoff' ? debtId : null,
      note: note.trim() || null,
    });
    setSaving(false);
  }

  return (
    <Modal title={title} onClose={onCancel} maxWidth={520}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name" hint="What you'd call it — “Emergency fund”, “Clear the car loan”.">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Emergency fund"
            autoFocus
            required
            className="w-full"
          />
        </Field>

        <Field label="Kind" hint={GOAL_KINDS.find((k) => k.id === kind)?.description}>
          <select value={kind} onChange={(e) => setKind(e.target.value as GoalKind)} className="w-full">
            {GOAL_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </Field>

        {kind === 'savings' && (
          <Field label="Tracking" hint="One account, or everything you hold in cash.">
            <select
              value={accountId ?? ''}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : null)}
              className="w-full"
            >
              <option value="">All cash accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
            </select>
          </Field>
        )}

        {kind === 'debt_payoff' && (
          <Field label="Tracking" hint="One debt, or every balance you owe.">
            <select
              value={debtId ?? ''}
              onChange={(e) => setDebtId(e.target.value ? Number(e.target.value) : null)}
              className="w-full"
            >
              <option value="">Everything owed</option>
              {debts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        )}

        {needsAmount && (
          <Field label="Target amount">
            <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
        )}

        <Field
          label="By when (optional)"
          hint="Leave blank for a goal with no deadline — it still gets a projected date."
        >
          <input
            type="date"
            value={date}
            min={today()}
            onChange={(e) => setDate(e.target.value)}
            className="w-full"
          />
        </Field>

        <Field label="Note (optional)">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this matters, or how you plan to get there"
            className="w-full"
          />
        </Field>

        {!amountValid && <FieldError>Enter a target greater than zero.</FieldError>}
        {!dateValid && <FieldError>Pick a date in the future.</FieldError>}

        <ModalActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !valid}>
            {saving ? 'Saving…' : 'Save goal'}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}

function GoalRow({
  progress, accounts, debts, onEdit, onDelete, drag, dragging,
}: {
  progress: GoalProgress;
  accounts: Account[];
  debts: Debt[];
  onEdit: () => void;
  onDelete: () => void;
  drag?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  dragging?: boolean;
}) {
  const { goal, status } = progress;
  const payoff = goal.kind === 'debt_payoff';
  const pct = Math.round(progress.fraction * 100);

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
            <span className="font-semibold">{goal.name}</span>
            <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {payoff
              ? <>Clear {targetLabel(goal, accounts, debts)} · {formatMoney(progress.current, { whole: true })} left</>
              : <>{formatMoney(progress.current, { whole: true })} of {formatMoney(progress.target, { whole: true })} · {targetLabel(goal, accounts, debts)}</>}
            {goal.target_date && <> · due {goal.target_date}</>}
          </div>
          {goal.note && <p className="mt-0.5 text-[12px] text-faint">{goal.note}</p>}
        </div>

        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={onEdit}>Edit</Button>
          <ConfirmButton onConfirm={onDelete} title={`Delete ${goal.name}`}>
            <X size={14} strokeWidth={2.2} aria-hidden="true" />
          </ConfirmButton>
        </div>
      </div>

      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          {/* A proportion, so the width has to be computed. */}
          <div
            className={cx('h-full rounded-full', status === 'met' ? 'bg-income' : status === 'off-track' ? 'bg-expense' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11.5px] text-muted">
          <span>{pct}%</span>
          <span>
            {status === 'untracked'
              ? 'Re-point this goal at something that still exists.'
              : progress.projectedLabel
                ? <>On the current plan: <strong className="text-text">{progress.projectedLabel}</strong>
                  {progress.slackMonths != null && progress.slackMonths < 0 && (
                    <> · {Math.abs(progress.slackMonths)} month{Math.abs(progress.slackMonths) === 1 ? '' : 's'} late</>
                  )}</>
                : status === 'met' ? 'Done.' : 'Not reached inside the forecast.'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Goals({ goals, accounts, debts, inputs, onAdd, onUpdate, onDelete, onReorder }: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { collapsed, toggle } = useCollapsed('goals');
  const dnd = useDnd<Goal>(goals, onReorder);

  const board = goalBoard(goals, inputs);
  const editing = goals.find((g) => g.id === editingId) ?? null;
  const met = board.filter((p) => p.status === 'met').length;
  const atRisk = board.filter((p) => p.status === 'behind' || p.status === 'off-track').length;

  return (
    <Panel>
      <PanelHeader
        title="Goals"
        description="Where you're trying to get to. Entirely optional — the forecast works without any."
        badges={atRisk > 0 && <Pill tone="warning">{atRisk} at risk</Pill>}
        stats={goals.length > 0
          ? [{ label: 'Reached', value: `${met} / ${goals.length}`, className: met === goals.length ? 'text-income' : 'text-text' }]
          : undefined}
        collapsed={collapsed}
        onToggle={toggle}
      />

      {!collapsed && (
        <>
          {/* The board is sorted by risk, so dragging reorders the stored list
              rather than what's on screen — only offer it when they agree. */}
          <div className="flex flex-col gap-2">
            {board.map((progress) => (
              <GoalRow
                key={progress.goal.id}
                progress={progress}
                accounts={accounts}
                debts={debts}
                onEdit={() => setEditingId(progress.goal.id)}
                onDelete={() => onDelete(progress.goal.id)}
                drag={dnd.handlers(progress.goal)}
                dragging={dnd.dragId === progress.goal.id}
              />
            ))}
            {goals.length === 0 && (
              <EmptyState>
                <span className="inline-flex items-center gap-1.5">
                  <Target size={14} strokeWidth={2} aria-hidden="true" />
                  No goals yet. Add one to see when the current plan gets you there.
                </span>
              </EmptyState>
            )}
          </div>

          <AddButton accent="cash" onClick={() => setAdding(true)} className="mt-3 w-full">
            + Add Goal
          </AddButton>
        </>
      )}

      {adding && (
        <GoalEditor
          title="Add Goal"
          accounts={accounts}
          debts={debts}
          initial={{
            name: '', kind: 'savings', target_amount: null, target_date: null,
            account_id: null, debt_id: null, note: null,
          }}
          onCancel={() => setAdding(false)}
          onSubmit={async (data) => { await onAdd(data); setAdding(false); }}
        />
      )}
      {editing && (
        <GoalEditor
          title={`Edit ${editing.name}`}
          accounts={accounts}
          debts={debts}
          initial={{
            name: editing.name, kind: editing.kind, target_amount: editing.target_amount,
            target_date: editing.target_date, account_id: editing.account_id,
            debt_id: editing.debt_id, note: editing.note,
          }}
          onCancel={() => setEditingId(null)}
          onSubmit={async (data) => { await onUpdate(editing.id, data); setEditingId(null); }}
        />
      )}
    </Panel>
  );
}
