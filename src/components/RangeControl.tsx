interface Props {
  months: number;
  onMonthsChange: (m: number) => void;
}

const PRESETS = [
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
  { label: '3Y', months: 36 },
  { label: '5Y', months: 60 },
];

function endLabel(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + months - 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Friendlier date-range picker: quick presets + a fine slider + a readable end-date.
export default function RangeControl({ months, onMonthsChange }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 300 }}>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {PRESETS.map((p) => {
          const active = months === p.months;
          return (
            <button
              key={p.months}
              onClick={() => onMonthsChange(p.months)}
              style={{
                background: active ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: active ? '#fff' : 'var(--color-text-muted)',
                border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: 6, padding: '3px 11px', fontSize: 12, fontWeight: 600,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range"
          min={1}
          max={60}
          value={months}
          onChange={(e) => onMonthsChange(Number(e.target.value))}
          aria-label="Forecast length in months"
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', minWidth: 168, textAlign: 'right' }}>
          <strong style={{ color: 'var(--color-text)' }}>{months} mo</strong> · through {endLabel(months)}
        </span>
      </div>
    </div>
  );
}
