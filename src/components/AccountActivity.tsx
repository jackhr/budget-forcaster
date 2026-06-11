import type { AccountActivity, AccountActivityItem } from '../lib/forecast';
import { FREQUENCY_LABELS } from '../lib/forecast';
import { formatMoney, formatSignedMoney } from '../lib/format';
import RangeControl from './RangeControl';

interface Entity { id: number; name: string; kind: 'account' | 'debt'; isPrimary?: boolean }

interface Props {
  entities: Entity[];
  selected: string;            // 'account:5' | 'debt:3'
  onSelect: (value: string) => void;
  entityKind: 'account' | 'debt';
  balance: number;             // account balance, or debt balance owed
  balanceSub: string;
  activity: AccountActivity;
  months: number;
  onMonthsChange: (m: number) => void;
}

const KIND_META: Record<AccountActivityItem['kind'], { label: string; color: string }> = {
  income: { label: 'Income', color: 'var(--color-income)' },
  expense: { label: 'Expense', color: 'var(--color-expense)' },
  future: { label: 'Future', color: 'var(--color-net-neg)' },
  debt: { label: 'Debt', color: '#a78bfa' },
  interest: { label: 'Interest', color: '#fbbf24' },
};

function Badge({ kind }: { kind: AccountActivityItem['kind'] }) {
  const m = KIND_META[kind];
  return (
    <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: m.color, background: `${m.color}1f`, border: `1px solid ${m.color}40`, borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  );
}

function Row({ item, cost }: { item: AccountActivityItem; cost: boolean }) {
  const color = cost ? 'var(--color-expense)' : 'var(--color-income)';
  const sign = item.direction === 'in' ? '+' : '−'; // relative to the entity's balance
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 0.9fr 0.9fr', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 'var(--radius-sm)', transition: 'background 0.1s' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ color, fontWeight: 700 }}>{cost ? '↑' : '↓'}</span>
        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
        <Badge kind={item.kind} />
      </div>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{FREQUENCY_LABELS[item.frequency]}</span>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
        {item.detail}{item.rangeLabel ? ` · ${item.rangeLabel}` : ''}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{item.nextLabel ?? '—'}</span>
      <span style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 600, color }}>{sign}{formatMoney(item.perOccurrence)}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>≈{formatMoney(item.monthlyAvg, { whole: true })}/mo</div>
      </span>
    </div>
  );
}

function Section({ items, cost, empty }: { items: AccountActivityItem[]; cost: boolean; empty: string }) {
  if (items.length === 0) {
    return <p style={{ padding: '8px 12px', color: 'var(--color-text-muted)', fontSize: 13 }}>{empty}</p>;
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 0.9fr 0.9fr', gap: 8, padding: '0 12px 6px', borderBottom: '1px solid var(--color-border)' }}>
        {['Item', 'Frequency', 'How / when', 'Next', 'Per occurrence'].map((h, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 4 ? 'right' : 'left' }}>{h}</span>
        ))}
      </div>
      {items.map((it) => <Row key={it.key} item={it} cost={cost} />)}
    </div>
  );
}

export default function AccountActivity({ entities, selected, onSelect, entityKind, balance, balanceSub, activity, months, onMonthsChange }: Props) {
  const isDebt = entityKind === 'debt';
  const monthlyIn = activity.inByMonth.reduce((s, v) => s + v, 0) / Math.max(1, months);
  const monthlyOut = activity.outByMonth.reduce((s, v) => s + v, 0) / Math.max(1, months);
  const net = monthlyIn - monthlyOut;
  const inItems = activity.items.filter((i) => i.direction === 'in');
  const outItems = activity.items.filter((i) => i.direction === 'out');

  // The "cost" (red, balance-growing) section sits on top; "good" (green) below.
  const topItems = isDebt ? inItems : outItems;
  const bottomItems = isDebt ? outItems : inItems;
  // For a debt, a positive net change means the balance is growing (bad).
  const netColor = isDebt ? (net > 0.005 ? 'var(--color-expense)' : 'var(--color-income)') : (net >= 0 ? 'var(--color-income)' : 'var(--color-expense)');

  const accounts = entities.filter((e) => e.kind === 'account');
  const debts = entities.filter((e) => e.kind === 'debt');

  const card = (label: string, value: string, color: string, sub: string) => (
    <div style={{ flex: 1, minWidth: 150, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '12px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>{isDebt ? 'Debt Activity' : 'Account Activity'}</h2>
            <select
              value={selected}
              onChange={(e) => onSelect(e.target.value)}
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', padding: '6px 10px', fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }}
            >
              {accounts.length > 0 && (
                <optgroup label="Accounts">
                  {accounts.map((a) => <option key={`a${a.id}`} value={`account:${a.id}`}>{a.name}{a.isPrimary ? ' ★' : ''}</option>)}
                </optgroup>
              )}
              {debts.length > 0 && (
                <optgroup label="Debts">
                  {debts.map((d) => <option key={`d${d.id}`} value={`debt:${d.id}`}>{d.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>
            {isDebt ? 'What grows this debt (charges + interest) and what pays it down' : 'What flows in and out of this account, when, and how it’s funded'}
          </p>
        </div>
        <RangeControl months={months} onMonthsChange={onMonthsChange} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {isDebt ? (
          <>
            {card('Balance Owed', formatMoney(balance, { whole: true }), 'var(--color-expense)', balanceSub)}
            {card('Added', formatMoney(monthlyIn, { whole: true }), 'var(--color-expense)', 'charges + interest / mo')}
            {card('Paid', formatMoney(monthlyOut, { whole: true }), 'var(--color-income)', 'avg / month')}
            {card('Net Change', formatSignedMoney(net, { whole: true }), netColor, monthlyIn > monthlyOut ? 'growing / mo' : 'shrinking / mo')}
          </>
        ) : (
          <>
            {card('Current Balance', formatMoney(balance, { whole: true }), 'var(--color-net-pos)', balanceSub)}
            {card('Money In', formatMoney(monthlyIn, { whole: true }), 'var(--color-income)', 'avg / month')}
            {card('Money Out', formatMoney(monthlyOut, { whole: true }), 'var(--color-expense)', 'avg / month')}
            {card('Net', formatSignedMoney(net, { whole: true }), netColor, 'avg / month')}
          </>
        )}
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-expense)', margin: '0 0 8px' }}>{isDebt ? 'Adds to balance ↑' : 'Money out ↑'}</h3>
      <Section items={topItems} cost empty={isDebt ? 'Nothing charged to this card.' : 'Nothing leaves this account.'} />

      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-income)', margin: '20px 0 8px' }}>{isDebt ? 'Pays it down ↓' : 'Money in ↓'}</h3>
      <Section items={bottomItems} cost={false} empty={isDebt ? 'No payments toward this debt yet.' : 'Nothing enters this account.'} />
    </div>
  );
}
