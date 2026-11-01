import { useEffect, useRef, useState } from 'react';
import {
  ComposedChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { Breakdown } from '../lib/forecast';
import { formatCompactMoney, formatMoney } from '../lib/format';
import RangeControl from './RangeControl';
import { Button, ChartPanel, ChartTooltip, EmptyState, SeriesToggle, cx } from '../ui';
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
    <ChartTooltip className="max-w-[320px]">
      <p className="mb-2 font-semibold">{label}</p>
      {rows.map((p) => {
        const d = detail(p.dataKey);
        const isTotal = p.dataKey === TOTAL_KEY;
        return (
          <div key={p.dataKey} className={d ? 'mb-1.5' : 'mb-0.5'}>
            {/* Each series' colour is set by the chart, so it stays a value. */}
            <p className={isTotal ? 'font-bold text-text' : undefined} style={isTotal ? undefined : { color: p.color }}>
              {p.name}: {formatMoney(p.value)}
            </p>
            {d && (
              <div className="ml-3 text-[12px] text-muted">
                {d.charges.map((c, i) => (
                  <p key={i}>+{formatMoney(c.amount)} {c.label} <span className="opacity-70">(expense)</span></p>
                ))}
                {d.payment > 0.005 && <p>−{formatMoney(d.payment)} payment</p>}
              </div>
            )}
          </div>
        );
      })}
    </ChartTooltip>
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
  const renderChip = (c: { key: string; name: string; color: string; paid?: boolean }) => (
    <SeriesToggle
      key={c.key}
      color={c.color === TOTAL_COLOR ? 'var(--color-text)' : c.color}
      label={<span className={c.key === TOTAL_KEY ? 'font-bold' : undefined}>{c.name}</span>}
      off={hidden.has(c.key)}
      onClick={() => toggle(c.key)}
      title={hidden.has(c.key) ? 'Show' : 'Hide'}
    >
      {c.paid && (
        <span title="Paid this month" className="inline-grid place-items-center text-income">
          <Check size={13} strokeWidth={2.6} aria-hidden="true" />
        </span>
      )}
    </SeriesToggle>
  );

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
      <div key={grp.id} className="relative">
        <button
          type="button"
          onClick={() => setOpenGroup(open ? null : grp.id)}
          title={open ? 'Close' : 'Show debts in this group'}
          aria-expanded={open}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px] font-semibold transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            allHidden && !open ? 'bg-transparent text-muted' : 'bg-surface-2 text-text hover:border-border-strong',
          )}
        >
          <span className="inline-flex gap-0.5">
            {grp.seriesIds.slice(0, 3).map((id) => (
              // Series colours come from the palette, so they stay values.
              <span key={id} className="inline-block h-2 w-2 shrink-0 rounded-xs" style={{ background: metaById.get(id)?.color }} />
            ))}
          </span>
          {grp.name}
          <span className="text-[11px] text-muted">{visibleCount}/{keys.length}</span>
          <span className="inline-grid place-items-center opacity-70">
            {open
              ? <ChevronUp size={12} strokeWidth={2.4} aria-hidden="true" />
              : <ChevronDown size={12} strokeWidth={2.4} aria-hidden="true" />}
          </span>
        </button>
        {open && (
          <div className="absolute left-0 top-[calc(100%+4px)] z-20 min-w-[220px] rounded-lg border border-border bg-surface-2 p-1.5 shadow-pop">
            <button
              type="button"
              onClick={() => setGroupHidden(!allHidden)}
              className="block w-full rounded-md px-2 py-1 text-left text-[11px] font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-text"
            >
              {allHidden ? 'Show all' : 'Hide all'}
            </button>
            <div className="my-1 h-px bg-border" />
            {grp.seriesIds.map((id) => {
              const key = `k${id}`;
              const off = hidden.has(key);
              const m = metaById.get(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(key)}
                  aria-pressed={!off}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-3',
                    off ? 'text-muted' : 'text-text',
                  )}
                >
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-sm border-[1.5px]"
                    style={{ borderColor: m?.color ?? 'var(--color-border)', background: off ? 'transparent' : m?.color }}
                  />
                  <span className={cx('flex-1', off && 'line-through')}>{m?.name}</span>
                  {m?.paid && (
                    <span title="Paid this month" className="inline-grid place-items-center text-income">
                      <Check size={13} strokeWidth={2.6} aria-hidden="true" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <ChartPanel
      title={title}
      subtitle={subtitle}
      actions={<RangeControl startMonth={startMonth} endMonth={months} onStartMonthChange={onStartMonthChange} onEndMonthChange={onMonthsChange} />}
    >
      {series.length === 0 ? (
        <div className="grid h-80 place-items-center">
          <EmptyState>Nothing to break down yet — add some items.</EmptyState>
        </div>
      ) : (
        <>
          {/* Legend — flat chips per series, or (Debt Breakdown) grouped dropdowns */}
          <div ref={legendRef} className="mb-4 flex flex-wrap items-center gap-1.5">
            {chipGroups
              ? [renderChip(chips[0]), ...chipGroups.map(renderGroup)]
              : chips.map(renderChip)}
            <Button
              size="sm"
              className="ml-1 border-dashed"
              onClick={() => setHidden(anyHidden ? new Set() : new Set(chips.map((c) => c.key)))}
            >
              {anyHidden ? 'Show all' : 'Hide all'}
            </Button>
            {hasLimits && (
              <Button
                size="sm"
                className={cx('ml-1', showLimits && 'bg-surface-3 text-text')}
                onClick={() => setShowLimits((v) => !v)}
                aria-pressed={showLimits}
                title="Show each card's credit limit as a dashed line"
              >
                {showLimits && <Check size={12} strokeWidth={2.6} aria-hidden="true" />}Credit limits
              </Button>
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
    </ChartPanel>
  );
}
