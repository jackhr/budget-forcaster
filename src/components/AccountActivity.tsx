import type { Account } from '../types';
import type { AccountActivity, AccountActivityItem } from '../lib/forecast';
import { FREQUENCY_LABELS } from '../lib/forecast';
import { formatMoney, formatSignedMoney } from '../lib/format';
import RangeControl from './RangeControl';

interface Props {
  accounts: Account[];
  selectedId: number;
  onSelect: (id: number) => void;
  account: Account | undefined;
  activity: AccountActivity;
  months: number;
  onMonthsChange: (m: number) => void;
}

const KIND_META: Record<AccountActivityItem['kind'], { label: string; color: string }> = {
  income: { label: 'Income', color: 'var(--color-income)' },
  expense: { label: 'Expense', color: 'var(--color-expense)' },
  future: { label: 'Future', color: 'var(--color-net-neg)' },
  debt: { label: 'Debt', color: '#a78bfa' },
};

function Badge({ kind }: { kind: AccountActivityItem['kind'] }) {
  const m = KIND_META[kind];
  return (
    <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: m.color, background: `${m.color}1f`, border: `1px solid ${m.color}40`, borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  );
}

function Row({ item }: { item: AccountActivityItem }) {
  const out = item.direction === 'out';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 0.9fr 0.9fr', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 'var(--radius-sm)', transition: 'background 0.1s' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ color: out ? 'var(--color-expense)' : 'var(--color-income)', fontWeight: 700 }}>{out ? '↑' : '↓'}</span>
        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
        <Badge kind={item.kind} />
      </div>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{FREQUENCY_LABELS[item.frequency]}</span>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
        {item.detail}{item.rangeLabel ? ` · ${item.rangeLabel}` : ''}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{item.nextLabel ?? '—'}</span>
      <span style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 600, color: out ? 'var(--color-expense)' : 'var(--color-income)' }}>
          {out ? '−' : '+'}{formatMoney(item.perOccurrence)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>≈{formatMoney(item.monthlyAvg, { whole: true })}/mo</div>
      </span>
    </div>
  );
}

function Section({ title, items }: { title: string; items: AccountActivityItem[] }) {
  if (items.length === 0) {
    return <p style={{ padding: '8px 12px', color: 'var(--color-text-muted)', fontSize: 13 }}>Nothing {title.toLowerCase()} this account.</p>;
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 0.9fr 0.9fr', gap: 8, padding: '0 12px 6px', borderBottom: '1px solid var(--color-border)' }}>
        {['Item', 'Frequency', 'How / when', 'Next', 'Per occurrence'].map((h, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 4 ? 'right' : 'left' }}>{h}</span>
        ))}
      </div>
      {items.map((it) => <Row key={it.key} item={it} />)}
    </div>
  );
}

export default function AccountActivity({ accounts, selectedId, onSelect, account, activity, months, onMonthsChange }: Props) {
  const monthlyIn = activity.inByMonth.reduce((s, v) => s + v, 0) / Math.max(1, months);
  const monthlyOut = activity.outByMonth.reduce((s, v) => s + v, 0) / Math.max(1, months);
  const net = monthlyIn - monthlyOut;
  const moneyIn = activity.items.filter((i) => i.direction === 'in');
  const moneyOut = activity.items.filter((i) => i.direction === 'out');

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
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Account Activity</h2>
            <select
              value={selectedId}
              onChange={(e) => onSelect(Number(e.target.value))}
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', padding: '6px 10px', fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }}
            >
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
            </select>
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>
            What flows in and out of this account, when, and how it’s funded
          </p>
        </div>
        <RangeControl months={months} onMonthsChange={onMonthsChange} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {card('Current Balance', formatMoney(account?.balance ?? 0, { whole: true }), 'var(--color-net-pos)', account?.is_primary ? '★ primary — pays the bills' : 'savings pile')}
        {card('Money In', formatMoney(monthlyIn, { whole: true }), 'var(--color-income)', 'avg / month')}
        {card('Money Out', formatMoney(monthlyOut, { whole: true }), 'var(--color-expense)', 'avg / month')}
        {card('Net', formatSignedMoney(net, { whole: true }), net >= 0 ? 'var(--color-income)' : 'var(--color-expense)', 'avg / month')}
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-expense)', margin: '0 0 8px' }}>Money out ↑</h3>
      <Section title="leaves" items={moneyOut} />

      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-income)', margin: '20px 0 8px' }}>Money in ↓</h3>
      <Section title="enters" items={moneyIn} />
    </div>
  );
}
