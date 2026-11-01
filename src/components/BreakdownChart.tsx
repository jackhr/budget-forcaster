import { useEffect, useRef, useState } from 'react';
import {
  ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { Breakdown } from '../lib/forecast';
import { formatCompactMoney, formatMoney } from '../lib/format';
import RangeControl from './RangeControl';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

interface DebtMonthDetail { charges: { label: string; amount: number; kind: string }[]; payment: number }
type DebtMonthInfo = Map<number, DebtMonthDetail[]>;

interface Props {
  title: string;
  subtitle: string;
  breakdown: Breakdown;
  startMonth: number;
  months: number;
  onStartMonthChange: (m: number) => void;
  onMonthsChange: (m: number) => void;
  debtMonthInfo?: DebtMonthInfo; // per-debt charges + payment each month (Debt Breakdown tooltip)
  creditLimits?: Map<number, number>; // debt id -> credit limit (Debt Breakdown — toggleable lines)
  paidIds?: Set<number>;         // debt ids paid this month (Debt Breakdown — mark the chips)
  chipGroups?: ChipGroup[];      // when set, the legend is grouped into per-group dropdowns (Debt Breakdown)
}

// A named bucket of series ids — renders as one legend dropdown (Debt Breakdown groups the chips by line-item group).
interface ChipGroup { id: string; name: string; seriesIds: number[] }

const PALETTE = ['#22c55e', '#f43f5e', '#38bdf8', '#a78bfa', '#fb923c', '#facc15', '#2dd4bf', '#f472b6', '#60a5fa', '#c084fc', '#4ade80', '#fca5a5'];
const TOTAL_KEY = 'total';
const TOTAL_COLOR = 'var(--color-text)';

function CustomTooltip({ active, payload, label, debtMonthInfo }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey: string; payload?: Record<string, unknown> }[];
  label?: string;
  debtMonthInfo?: DebtMonthInfo;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const rows = [...payload]
    .sort((a, b) => (a.dataKey === TOTAL_KEY ? -1 : b.dataKey === TOTAL_KEY ? 1 : b.value - a.value));
  const idx = Number(row?.idx ?? -1);

  // Debt Breakdown: charges + payment applied to each visible debt this month.
  const detail = (dataKey: string): DebtMonthDetail | null => {
    if (!debtMonthInfo || !dataKey.startsWith('k') || idx < 0) return null;
    const d = debtMonthInfo.get(Number(dataKey.slice(1)))?.[idx];
    return d && (d.charges.length > 0 || d.payment > 0.005) ? d : null;
  };

  return (
    <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 16px', fontSize: 13, maxWidth: 320 }}>
      <p style={{ fontWeight: 600, marginBottom: 8 }}>{label}</p>
      {rows.map((p) => {
        const d = detail(p.dataKey);
        return (
          <div key={p.dataKey} style={{ marginBottom: d ? 6 : 3 }}>
            <p style={{ color: p.dataKey === TOTAL_KEY ? 'var(--color-text)' : p.color, fontWeight: p.dataKey === TOTAL_KEY ? 700 : 400 }}>
              {p.name}: {formatMoney(p.value)}
            </p>
            {d && (
              <div style={{ marginLeft: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>
                {d.charges.map((c, i) => (
                  <p key={i}>+{formatMoney(c.amount)} {c.label} <span style={{ opacity: 0.7 }}>(expense)</span></p>
                ))}
                {d.payment > 0.005 && <p>−{formatMoney(d.payment)} payment</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BreakdownChart({ title, subtitle, breakdown, startMonth, months, onStartMonthChange, onMonthsChange, debtMonthInfo, creditLimits, paidIds, chipGroups }: Props) {
  const { labels, total, series } = breakdown;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showLimits, setShowLimits] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const hasLimits = !!creditLimits && creditLimits.size > 0;

  // Reset visibility / open dropdown when switching sections (each section has a distinct title).
  useEffect(() => { setHidden(new Set()); setOpenGroup(null); }, [title]);

  // Close the open group dropdown on an outside click.
  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => {
      if (legendRef.current && !legendRef.current.contains(e.target as Node)) setOpenGroup(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openGroup]);

  const data = labels.map((label, i) => {
    const row: Record<string, unknown> = { label, total: total[i] ?? 0, idx: i };
    series.forEach((s) => { row[`k${s.id}`] = s.values[i] ?? 0; });
    return row;
  });

  const colorOf = (i: number) => PALETTE[i % PALETTE.length];
  const toggle = (key: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const chips: { key: string; name: string; color: string; paid?: boolean }[] = [
    { key: TOTAL_KEY, name: 'Total', color: TOTAL_COLOR },
    ...series.map((s, i) => ({ key: `k${s.id}`, name: s.name, color: colorOf(i), paid: paidIds?.has(s.id) })),
  ];
  const anyHidden = hidden.size > 0;

  // Per-series display info, keyed by debt id (used by the grouped dropdown legend).
  const metaById = new Map(series.map((s, i) => [s.id, { name: s.name, color: colorOf(i), paid: paidIds?.has(s.id) }]));

  // A single toggle chip (used for the flat legend and the standalone Total chip).
  const renderChip = (c: { key: string; name: string; color: string; paid?: boolean }) => {
    const off = hidden.has(c.key);
    return (
      <button
        key={c.key}
        onClick={() => toggle(c.key)}
        title={off ? 'Show' : 'Hide'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: off ? 'transparent' : 'var(--color-surface-2)',
          border: `1px solid var(--color-border)`, borderRadius: 999,
          padding: '3px 10px', fontSize: 12, fontWeight: c.key === TOTAL_KEY ? 700 : 500,
          color: off ? 'var(--color-text-muted)' : 'var(--color-text)',
          opacity: off ? 0.55 : 1, textDecoration: off ? 'line-through' : 'none', cursor: 'pointer',
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color === TOTAL_COLOR ? 'var(--color-text)' : c.color, flexShrink: 0 }} />
        {c.name}
        {c.paid && <span title="Paid this month" style={{ color: 'var(--color-income)', display: 'inline-grid', placeItems: 'center' }}><Check size={13} strokeWidth={2.6} aria-hidden="true" /></span>}
      </button>
    );
  };

  // A group dropdown: a button showing the group + visible count, opening a panel of per-debt toggles.
  const renderGroup = (grp: ChipGroup) => {
    const keys = grp.seriesIds.map((id) => `k${id}`);
    const visibleCount = keys.filter((k) => !hidden.has(k)).length;
    const allHidden = visibleCount === 0;
    const open = openGroup === grp.id;
    const setGroupHidden = (hide: boolean) => setHidden((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (hide ? next.add(k) : next.delete(k)));
      return next;
    });
    return (
      <div key={grp.id} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpenGroup(open ? null : grp.id)}
          title={open ? 'Close' : 'Show debts in this group'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: open ? 'var(--color-surface-2)' : (allHidden ? 'transparent' : 'var(--color-surface-2)'),
            border: `1px solid var(--color-border)`, borderRadius: 999,
            padding: '3px 10px', fontSize: 12, fontWeight: 600,
            color: allHidden ? 'var(--color-text-muted)' : 'var(--color-text)', cursor: 'pointer',
            opacity: allHidden ? 0.7 : 1,
          }}
        >
          <span style={{ display: 'inline-flex', gap: 2 }}>
            {grp.seriesIds.slice(0, 3).map((id) => (
              <span key={id} style={{ width: 8, height: 8, borderRadius: 2, background: metaById.get(id)?.color, flexShrink: 0 }} />
            ))}
          </span>
          {grp.name}
          <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>{visibleCount}/{keys.length}</span>
          <span style={{ opacity: 0.7, display: 'inline-grid', placeItems: 'center' }}>{open ? <ChevronUp size={12} strokeWidth={2.4} aria-hidden="true" /> : <ChevronDown size={12} strokeWidth={2.4} aria-hidden="true" />}</span>
        </button>
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20, minWidth: 220,
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 8,
            padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}>
            <button
              onClick={() => setGroupHidden(!allHidden)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                border: 'none', padding: '4px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                color: 'var(--color-text-muted)',
              }}
            >
              {allHidden ? 'Show all' : 'Hide all'}
            </button>
            <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }} />
            {grp.seriesIds.map((id) => {
              const key = `k${id}`;
              const off = hidden.has(key);
              const m = metaById.get(id);
              return (
                <button
                  key={id}
                  onClick={() => toggle(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    background: 'transparent', border: 'none', padding: '5px 8px', borderRadius: 6,
                    fontSize: 12, cursor: 'pointer', color: off ? 'var(--color-text-muted)' : 'var(--color-text)',
                  }}
                >
                  <span style={{
                    width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                    border: `1.5px solid ${m?.color ?? 'var(--color-border)'}`,
                    background: off ? 'transparent' : m?.color,
                  }} />
                  <span style={{ flex: 1, textDecoration: off ? 'line-through' : 'none' }}>{m?.name}</span>
                  {m?.paid && <span title="Paid this month" style={{ color: 'var(--color-income)', display: 'inline-grid', placeItems: 'center' }}><Check size={13} strokeWidth={2.6} aria-hidden="true" /></span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 2 }}>{subtitle}</p>
        </div>
        <RangeControl startMonth={startMonth} endMonth={months} onStartMonthChange={onStartMonthChange} onEndMonthChange={onMonthsChange} />
      </div>

      {series.length === 0 ? (
        <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
          Nothing to break down yet — add some items.
        </div>
      ) : (
        <>
          {/* Legend — flat chips per series, or (Debt Breakdown) grouped dropdowns */}
          <div ref={legendRef} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 16 }}>
            {chipGroups
              ? [renderChip(chips[0]), ...chipGroups.map(renderGroup)]
              : chips.map(renderChip)}
            <button
              onClick={() => setHidden(anyHidden ? new Set() : new Set(chips.map((c) => c.key)))}
              style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 999, padding: '3px 10px', fontSize: 12, marginLeft: 4 }}
            >
              {anyHidden ? 'Show all' : 'Hide all'}
            </button>
            {hasLimits && (
              <button
                onClick={() => setShowLimits((v) => !v)}
                title="Show each card's credit limit as a dashed line"
                style={{
                  background: showLimits ? 'var(--color-surface-2)' : 'transparent', color: showLimits ? 'var(--color-text)' : 'var(--color-text-muted)',
                  border: '1px solid var(--color-border)', borderRadius: 999, padding: '3px 10px', fontSize: 12, marginLeft: 4,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                {showLimits && <Check size={12} strokeWidth={2.6} aria-hidden="true" />}Credit limits
              </button>
            )}
          </div>

          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} interval={Math.max(0, Math.floor(data.length / 8) - 1)} />
              <YAxis tickFormatter={formatCompactMoney} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
              <Tooltip content={<CustomTooltip debtMonthInfo={debtMonthInfo} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              {showLimits && creditLimits && series.map((s, idx) => {
                const limit = creditLimits.get(s.id);
                if (limit == null || hidden.has(`k${s.id}`)) return null;
                return (
                  <ReferenceLine
                    key={`lim${s.id}`}
                    y={limit}
                    stroke={colorOf(idx)}
                    strokeDasharray="5 4"
                    strokeOpacity={0.7}
                    ifOverflow="extendDomain"
                    label={{ value: `${formatCompactMoney(limit)} limit`, position: 'insideTopRight', fill: colorOf(idx), fontSize: 10 }}
                  />
                );
              })}
              {series.map((s, idx) => (
                <Line key={s.id} type="monotone" dataKey={`k${s.id}`} name={s.name} stroke={colorOf(idx)} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} hide={hidden.has(`k${s.id}`)} />
              ))}
              <Line type="monotone" dataKey="total" name="Total (all combined)" stroke="var(--color-text)" strokeWidth={3} dot={false} activeDot={{ r: 4 }} hide={hidden.has(TOTAL_KEY)} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
