interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  emptyLabel: string;
  chooseLabel: string;
  clearLabel: string;
  min?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function OptionalMonthField({ label, value, onChange, emptyLabel, chooseLabel, clearLabel, min }: Props) {
  const selected = value || min || currentMonth();
  const selectedYear = Number(selected.slice(0, 4));
  const selectedMonth = Number(selected.slice(5, 7));
  const currentYear = new Date().getFullYear();
  const minYear = min ? Number(min.slice(0, 4)) : currentYear - 10;
  const firstYear = Math.min(minYear, selectedYear, currentYear - 10);
  const lastYear = Math.max(selectedYear, currentYear + 20);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

  const update = (year: number, month: number) => {
    const next = `${year}-${String(month).padStart(2, '0')}`;
    onChange(min && next < min ? min : next);
  };

  const selectStyle: React.CSSProperties = {
    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
    padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 220 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      {value ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 6 }}>
            <select value={selectedMonth} onChange={(e) => update(selectedYear, Number(e.target.value))} style={selectStyle}>
              {MONTHS.map((month, i) => {
                const candidate = `${selectedYear}-${String(i + 1).padStart(2, '0')}`;
                return <option key={month} value={i + 1} disabled={!!min && candidate < min}>{month}</option>;
              })}
            </select>
            <select value={selectedYear} onChange={(e) => update(Number(e.target.value), selectedMonth)} style={selectStyle}>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => onChange('')} style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--color-text-muted)', padding: '2px 0', fontSize: 11.5 }}>
            {clearLabel}
          </button>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '9px 10px' }}>
          <strong style={{ fontSize: 13 }}>{emptyLabel}</strong>
          <button type="button" onClick={() => onChange(selected)} style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--color-primary)', padding: 0, fontSize: 11.5 }}>
            {chooseLabel}
          </button>
        </div>
      )}
    </div>
  );
}
