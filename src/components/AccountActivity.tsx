import type { AccountActivity, AccountActivityItem } from '../lib/forecast';
import { FREQUENCY_LABELS } from '../lib/forecast';
import { formatMoney, formatSignedMoney } from '../lib/format';
import MonthControl from './MonthControl';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { EmptyState, PaidToggle, Panel, Pill, cx } from '../ui';

interface Entity { id: number; name: string; kind: 'account' | 'debt'; isPrimary?: boolean }

interface Props {
  entities: Entity[];
  selected: string;            // 'account:5' | 'debt:3'
  onSelect: (value: string) => void;
  entityKind: 'account' | 'debt';
  balance: number;             // account balance, or debt balance owed
  balanceSub: string;
  activity: AccountActivity;
  month: number;
  onMonthChange: (m: number) => void;
  paid?: boolean;              // selected debt: paid this month?
  onTogglePaid?: () => void;
  paidIds?: Set<number>;       // debt ids paid this month (to mark the dropdown)
}

const KIND_META: Record<AccountActivityItem['kind'], { label: string; tone: 'income' | 'expense' | 'charge' | 'warning' }> = {
  income: { label: 'Income', tone: 'income' },
  expense: { label: 'Expense', tone: 'expense' },
  debt: { label: 'Debt', tone: 'charge' },
  interest: { label: 'Interest', tone: 'warning' },
};

// The four columns, shared by the header and every row so they line up.
const COLUMNS = 'grid grid-cols-[1.4fr_0.8fr_1fr_0.9fr] gap-2';

function Row({ item, cost }: { item: AccountActivityItem; cost: boolean }) {
  const paid = !!item.paid;
  const amountColor = paid ? 'text-muted' : cost ? 'text-expense' : 'text-income';
  const sign = item.direction === 'in' ? '+' : '−'; // relative to the entity's balance
  const meta = KIND_META[item.kind];
  return (
    <div className={cx(COLUMNS, 'items-center rounded-control px-3 py-2.5 transition-colors hover:bg-surface-2', paid && 'opacity-70')}>
      <div className="flex min-w-0 items-center gap-2">
        <span className={cx('inline-grid shrink-0 place-items-center', amountColor)}>
          {cost
            ? <ArrowUp size={14} strokeWidth={2.4} aria-hidden="true" />
            : <ArrowDown size={14} strokeWidth={2.4} aria-hidden="true" />}
        </span>
        <span className="truncate font-medium">{item.name}</span>
        <Pill tone={meta.tone}>{meta.label}</Pill>
        {paid && (
          <Pill tone="income" className="gap-1 border-income">
            <Check size={10} strokeWidth={3} aria-hidden="true" />PAID
          </Pill>
        )}
      </div>
      <span className="text-[12.5px] text-muted">{FREQUENCY_LABELS[item.frequency]}</span>
      <span className="text-[12.5px] text-muted">
        {paid ? 'Already paid this month' : `${item.detail}${item.rangeLabel ? ` · ${item.rangeLabel}` : ''}`}
      </span>
      <span className="text-right">
        <div className={cx('font-semibold tabular-nums', amountColor, paid && 'line-through')}>
          {sign}{formatMoney(item.perOccurrence)}
        </div>
        <div className="text-[11px] text-muted">≈{formatMoney(item.monthlyAvg, { whole: true })}/mo</div>
      </span>
    </div>
  );
}

function Section({ items, cost, empty }: { items: AccountActivityItem[]; cost: boolean; empty: string }) {
  if (items.length === 0) return <EmptyState compact>{empty}</EmptyState>;
  return (
    <div>
      <div className={cx(COLUMNS, 'border-b border-border px-3 pb-1.5')}>
        {['Item', 'Frequency', 'How / when', 'Per occurrence'].map((heading, i) => (
          <span
            key={i}
            className={cx('text-[11px] font-semibold uppercase tracking-wider text-muted', i === 3 && 'text-right')}
          >
            {heading}
          </span>
        ))}
      </div>
      {items.map((it) => <Row key={it.key} item={it} cost={cost} />)}
    </div>
  );
}

function Stat({ label, value, className, sub }: { label: string; value: string; className: string; sub: string }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-control border border-border bg-bg px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={cx('mt-0.5 text-xl font-bold tabular-nums', className)}>{value}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  );
}

export default function AccountActivity({ entities, selected, onSelect, entityKind, balance, balanceSub, activity, month, onMonthChange, paid, onTogglePaid, paidIds }: Props) {
  const isDebt = entityKind === 'debt';
  const monthlyIn = activity.inByMonth[0] ?? 0;
  const monthlyOut = activity.outByMonth[0] ?? 0;
  const net = monthlyIn - monthlyOut;
  const inItems = activity.items.filter((i) => i.direction === 'in');
  const outItems = activity.items.filter((i) => i.direction === 'out');

  // The "cost" (red, balance-growing) section sits on top; "good" (green) below.
  const topItems = isDebt ? inItems : outItems;
  const bottomItems = isDebt ? outItems : inItems;
  // For a debt, a positive net change means the balance is growing (bad).
  const netColor = isDebt
    ? (net > 0.005 ? 'text-expense' : 'text-income')
    : (net >= 0 ? 'text-income' : 'text-expense');

  const accounts = entities.filter((e) => e.kind === 'account');
  const debts = entities.filter((e) => e.kind === 'debt');

  return (
    <Panel className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-semibold tracking-tight">{isDebt ? 'Debt Activity' : 'Account Activity'}</h2>
            <select value={selected} onChange={(e) => onSelect(e.target.value)} className="font-semibold">
              {accounts.length > 0 && (
                <optgroup label="Accounts">
                  {accounts.map((a) => <option key={`a${a.id}`} value={`account:${a.id}`}>{a.name}{a.isPrimary ? ' ★' : ''}</option>)}
                </optgroup>
              )}
              {debts.length > 0 && (
                <optgroup label="Debts">
                  {debts.map((d) => <option key={`d${d.id}`} value={`debt:${d.id}`}>{d.name}{paidIds?.has(d.id) ? ' ✓ paid' : ''}</option>)}
                </optgroup>
              )}
            </select>
            {isDebt && onTogglePaid && <PaidToggle paid={!!paid} onToggle={onTogglePaid} noun="payment" />}
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {isDebt
              ? 'What grows this debt (charges + interest) and what pays it down'
              : 'What flows in and out of this account, when, and how it’s funded'}
          </p>
        </div>
        <MonthControl month={month} onMonthChange={onMonthChange} />
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        {isDebt ? (
          <>
            <Stat label="Balance Owed" value={formatMoney(balance, { whole: true })} className="text-expense" sub={balanceSub} />
            <Stat label="Added" value={formatMoney(monthlyIn, { whole: true })} className="text-expense" sub="charges + interest / mo" />
            <Stat label="Paid" value={formatMoney(monthlyOut, { whole: true })} className="text-income" sub="selected month" />
            <Stat
              label="Net Change"
              value={formatSignedMoney(net, { whole: true })}
              className={netColor}
              sub={monthlyIn > monthlyOut ? 'growing this month' : 'shrinking this month'}
            />
          </>
        ) : (
          <>
            <Stat label="Current Balance" value={formatMoney(balance, { whole: true })} className="text-net-pos" sub={balanceSub} />
            <Stat label="Money In" value={formatMoney(monthlyIn, { whole: true })} className="text-income" sub="selected month" />
            <Stat label="Money Out" value={formatMoney(monthlyOut, { whole: true })} className="text-expense" sub="selected month" />
            <Stat label="Net" value={formatSignedMoney(net, { whole: true })} className={netColor} sub="selected month" />
          </>
        )}
      </div>

      <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-expense">
        <ArrowUp size={13} strokeWidth={2.4} aria-hidden="true" />{isDebt ? 'Adds to balance' : 'Money out'}
      </h3>
      <Section items={topItems} cost empty={isDebt ? 'Nothing charged to this card.' : 'Nothing leaves this account.'} />

      <h3 className="mb-2 mt-5 flex items-center gap-1.5 text-[13px] font-semibold text-income">
        <ArrowDown size={13} strokeWidth={2.4} aria-hidden="true" />{isDebt ? 'Pays it down' : 'Money in'}
      </h3>
      <Section items={bottomItems} cost={false} empty={isDebt ? 'No payments toward this debt yet.' : 'Nothing enters this account.'} />
    </Panel>
  );
}
