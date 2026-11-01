import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton, cx } from '../ui';

interface Props {
  startMonth: number;
  endMonth: number;
  onStartMonthChange: (m: number) => void;
  onEndMonthChange: (m: number) => void;
}

const PRESETS = [
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
  { label: '3Y', months: 36 },
  { label: '5Y', months: 60 },
];

function monthLabel(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const MAX_END_MONTH = 120;

/** One end of the range: a label between two nudge arrows. */
function Boundary({
  label, value, onBack, onForward, backDisabled, forwardDisabled, noun,
}: {
  label: string;
  value: string;
  onBack: () => void;
  onForward: () => void;
  backDisabled: boolean;
  forwardDisabled: boolean;
  noun: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <IconButton
        tone="neutral"
        size="sm"
        onClick={onBack}
        disabled={backDisabled}
        aria-label={`Move ${noun} one month earlier`}
        title={`${label} one month earlier`}
      >
        <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
      </IconButton>
      <span className="min-w-[78px] whitespace-nowrap text-center text-[12.5px] tabular-nums text-muted">
        <span className="block text-[10px] uppercase tracking-wider">{label}</span>
        <strong className="text-text">{value}</strong>
      </span>
      <IconButton
        tone="neutral"
        size="sm"
        onClick={onForward}
        disabled={forwardDisabled}
        aria-label={`Move ${noun} one month later`}
        title={`${label} one month later`}
      >
        <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

// Quick duration presets plus independent controls for each date boundary.
export default function RangeControl({ startMonth, endMonth, onStartMonthChange, onEndMonthChange }: Props) {
  const duration = endMonth - startMonth;
  const setDuration = (months: number) => onEndMonthChange(Math.min(MAX_END_MONTH, startMonth + months));

  return (
    <div className="flex min-w-[300px] flex-col gap-2">
      <div className="flex flex-wrap justify-end gap-1">
        {PRESETS.map((p) => {
          const active = duration === p.months;
          return (
            <button
              key={p.months}
              type="button"
              onClick={() => setDuration(p.months)}
              aria-pressed={active}
              className={cx(
                'rounded-md border px-2.5 py-0.5 text-[12px] font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                active
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-surface-2 text-muted hover:border-border-strong hover:text-text',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Boundary
          label="Start"
          noun="start"
          value={monthLabel(startMonth)}
          onBack={() => onStartMonthChange(startMonth - 1)}
          onForward={() => onStartMonthChange(startMonth + 1)}
          backDisabled={startMonth <= 0}
          forwardDisabled={startMonth >= endMonth - 1}
        />
        <span className="whitespace-nowrap text-[12px] text-muted">{duration} mo</span>
        <Boundary
          label="End"
          noun="end"
          value={monthLabel(endMonth - 1)}
          onBack={() => onEndMonthChange(endMonth - 1)}
          onForward={() => onEndMonthChange(endMonth + 1)}
          backDisabled={endMonth <= startMonth + 1}
          forwardDisabled={endMonth >= MAX_END_MONTH}
        />
      </div>
    </div>
  );
}
