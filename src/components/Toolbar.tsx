import { useRef, useState } from 'react';
import type { Scenario } from '../api/client';
import ConfirmButton from './ConfirmButton';

interface Props {
  scenarios: Scenario[];
  compareId: number | null;
  onSave: (name: string) => Promise<void>;
  onRestore: (id: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onCompareChange: (id: number | null) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

const btn: React.CSSProperties = {
  background: 'var(--color-surface-2)', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', padding: '6px 12px', fontSize: 13,
};

export default function Toolbar({ scenarios, compareId, onSave, onRestore, onDelete, onCompareChange, onExport, onImport }: Props) {
  const [savingOpen, setSavingOpen] = useState(false);
  const [name, setName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await onSave(name.trim());
    setName('');
    setSavingOpen(false);
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Scenarios
      </span>

      {savingOpen ? (
        <form onSubmit={save} style={{ display: 'flex', gap: 6 }}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name" autoFocus style={{ width: 160 }} required />
          <button type="submit" style={{ background: 'var(--color-primary)', color: '#fff', padding: '6px 12px' }}>Save</button>
          <button type="button" onClick={() => setSavingOpen(false)} style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '6px 10px' }}>✕</button>
        </form>
      ) : (
        <button onClick={() => setSavingOpen(true)} style={btn}>💾 Save current</button>
      )}

      {scenarios.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-muted)' }}>
          Compare:
          <select
            value={compareId ?? ''}
            onChange={(e) => onCompareChange(e.target.value ? Number(e.target.value) : null)}
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', padding: '6px 8px', fontSize: 13 }}
          >
            <option value="">None</option>
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}

      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <button onClick={onExport} style={btn} title="Download a JSON backup">⤓ Export</button>
        <button onClick={() => fileRef.current?.click()} style={btn} title="Restore from a JSON backup">⤒ Import</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
        />
      </div>

      {scenarios.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexBasis: '100%' }}>
          {scenarios.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 12.5 }}>
              <span style={{ fontWeight: 500 }}>{s.name}</span>
              <ConfirmButton
                onConfirm={() => onRestore(s.id)}
                title={`Replace all current data with "${s.name}"`}
                confirmLabel="Load?"
                triggerStyle={{ background: 'transparent', color: 'var(--color-primary)', padding: '2px 6px', fontSize: 12 }}
              >
                Load
              </ConfirmButton>
              <ConfirmButton
                onConfirm={() => onDelete(s.id)}
                title={`Delete scenario "${s.name}"`}
                triggerStyle={{ background: 'transparent', color: 'var(--color-expense)', padding: '2px 6px', fontSize: 12 }}
              >
                ✕
              </ConfirmButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
