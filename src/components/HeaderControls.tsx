import { CURRENCIES, formatMoney } from '../lib/format';

interface Props {
  totalCash: number;
  currency: string;
  onCurrencyChange: (code: string) => void;
  inflation: number;
  onInflationChange: (value: number) => void;
}

/** A labelled readout or control in the app header. */
function Chip({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div
      title={title}
      className="flex items-center gap-2 rounded-control border border-border bg-bg px-2.5 py-1"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      {children}
    </div>
  );
}

export default function HeaderControls({ totalCash, currency, onCurrencyChange, inflation, onInflationChange }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <Chip label="Total Cash" title="Total across all accounts — edit balances in the Accounts section">
        <span className="text-[15px] font-bold tabular-nums text-primary">
          {formatMoney(totalCash, { whole: true })}
        </span>
      </Chip>

      <Chip label="Inflation">
        <input
          type="number"
          value={inflation}
          onChange={(e) => onInflationChange(parseFloat(e.target.value) || 0)}
          min={0}
          max={50}
          step="any"
          title="Annual inflation applied to ongoing expenses"
          className="min-h-0 w-[52px] px-1 py-0.5 font-semibold"
        />
        <span className="text-[12px] text-muted">%</span>
      </Chip>

      <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)} title="Display currency">
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
    </div>
  );
}
