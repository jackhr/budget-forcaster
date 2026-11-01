import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton, cx } from '../ui';

interface Props {
  month: number;
  onMonthChange: (month: number) => void;
}

const MAX_MONTH = 119;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function dateAtOffset(offset: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

export default function MonthControl({ month, onMonthChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = dateAtOffset(month);
  const now = dateAtOffset(0);
  const max = dateAtOffset(MAX_MONTH);
  const years = Array.from({ length: max.getFullYear() - now.getFullYear() + 1 }, (_, i) => now.getFullYear() + i);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (year: number, selectedMonth: number) => {
    const offset = (year - now.getFullYear()) * 12 + selectedMonth - now.getMonth();
    onMonthChange(Math.max(0, Math.min(MAX_MONTH, offset)));
    setOpen(false);
  };

  const chooseYear = (year: number) => {
    const offset = (year - now.getFullYear()) * 12 + selected.getMonth() - now.getMonth();
    onMonthChange(Math.max(0, Math.min(MAX_MONTH, offset)));
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      <IconButton
        tone="neutral"
        onClick={() => onMonthChange(month - 1)}
        disabled={month <= 0}
        aria-label="Previous month"
        title="Previous month"
      >
        <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
      </IconButton>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="Choose month"
        className="min-w-[152px] rounded-control border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold tabular-nums transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {MONTH_NAMES[selected.getMonth()]} {selected.getFullYear()}
      </button>

      <IconButton
        tone="neutral"
        onClick={() => onMonthChange(month + 1)}
        disabled={month >= MAX_MONTH}
        aria-label="Next month"
        title="Next month"
      >
        <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
      </IconButton>

      {open && (
        <div className="absolute right-[42px] top-[calc(100%+6px)] z-20 flex min-w-[220px] flex-col gap-2 rounded-control border border-border bg-surface-2 p-2.5 shadow-pop">
          <select value={selected.getFullYear()} onChange={(e) => chooseYear(Number(e.target.value))}>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-1">
            {MONTH_NAMES.map((name, index) => {
              const offset = (selected.getFullYear() - now.getFullYear()) * 12 + index - now.getMonth();
              const disabled = offset < 0 || offset > MAX_MONTH;
              const active = selected.getMonth() === index;
              return (
                <button
                  key={name}
                  type="button"
                  disabled={disabled}
                  onClick={() => choose(selected.getFullYear(), index)}
                  aria-pressed={active}
                  className={cx(
                    'rounded-md border border-border px-1 py-1.5 text-[11px] transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                    active ? 'bg-primary text-white' : 'bg-bg text-text hover:bg-surface-3',
                  )}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
