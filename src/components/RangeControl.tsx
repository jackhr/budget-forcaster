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

// Quick duration presets plus independent controls for each date boundary.
export default function RangeControl({ startMonth, endMonth, onStartMonthChange, onEndMonthChange }: Props) {
  const duration = endMonth - startMonth;
  const setDuration = (months: number) => onEndMonthChange(Math.min(MAX_END_MONTH, startMonth + months));

  const arrowStyle: React.CSSProperties = {
    background: 'var(--color-surface-2)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    width: 34,
    height: 30,
    padding: 0,
    fontSize: 17,
    fontWeight: 700,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 300 }}>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {PRESETS.map((p) => {
          const active = duration === p.months;
          return (
            <button
              key={p.months}
              onClick={() => setDuration(p.months)}
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" onClick={() => onStartMonthChange(startMonth - 1)} disabled={startMonth <= 0} aria-label="Move start one month earlier" title="Start one month earlier" style={arrowStyle}>←</button>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', minWidth: 78, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Start</span>
            <strong style={{ color: 'var(--color-text)' }}>{monthLabel(startMonth)}</strong>
          </span>
          <button type="button" onClick={() => onStartMonthChange(startMonth + 1)} disabled={startMonth >= endMonth - 1} aria-label="Move start one month later" title="Start one month later" style={arrowStyle}>→</button>
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{duration} mo</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" onClick={() => onEndMonthChange(endMonth - 1)} disabled={endMonth <= startMonth + 1} aria-label="Move end one month earlier" title="End one month earlier" style={arrowStyle}>←</button>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', minWidth: 78, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>End</span>
            <strong style={{ color: 'var(--color-text)' }}>{monthLabel(endMonth - 1)}</strong>
          </span>
          <button type="button" onClick={() => onEndMonthChange(endMonth + 1)} disabled={endMonth >= MAX_END_MONTH} aria-label="Move end one month later" title="End one month later" style={arrowStyle}>→</button>
        </div>
      </div>
    </div>
  );
}
