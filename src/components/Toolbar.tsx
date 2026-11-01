import { useRef, useState } from 'react';
import type { Scenario } from '../api/client';
import ConfirmButton from './ConfirmButton';
import { Download, Save, Upload, X } from 'lucide-react';
import { Button, IconButton, Panel } from '../ui';

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
    <Panel className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">Scenarios</span>

      {savingOpen ? (
        <form onSubmit={save} className="flex gap-1.5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Scenario name"
            autoFocus
            required
            className="w-40"
          />
          <Button type="submit" variant="primary" size="sm">Save</Button>
          <IconButton tone="neutral" size="sm" onClick={() => setSavingOpen(false)} aria-label="Cancel">
            <X size={14} strokeWidth={2.2} aria-hidden="true" />
          </IconButton>
        </form>
      ) : (
        <Button size="sm" onClick={() => setSavingOpen(true)}>
          <Save size={14} strokeWidth={1.9} aria-hidden="true" />Save current
        </Button>
      )}

      {scenarios.length > 0 && (
        <label className="flex items-center gap-1.5 text-[13px] text-muted">
          Compare:
          <select
            value={compareId ?? ''}
            onChange={(e) => onCompareChange(e.target.value ? Number(e.target.value) : null)}
            className="min-h-0 py-1.5"
          >
            <option value="">None</option>
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}

      <div className="ml-auto flex gap-1.5">
        <Button size="sm" onClick={onExport} title="Download a JSON backup">
          <Download size={14} strokeWidth={1.9} aria-hidden="true" />Export
        </Button>
        <Button size="sm" onClick={() => fileRef.current?.click()} title="Restore from a JSON backup">
          <Upload size={14} strokeWidth={1.9} aria-hidden="true" />Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
        />
      </div>

      {scenarios.length > 0 && (
        <div className="flex basis-full flex-wrap gap-2">
          {scenarios.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1.5 rounded-control border border-border bg-bg px-2 py-1 text-[12.5px]"
            >
              <span className="font-medium">{s.name}</span>
              <ConfirmButton
                onConfirm={() => onRestore(s.id)}
                title={`Replace all current data with "${s.name}"`}
                confirmLabel="Load?"
                tone="primary"
              >
                Load
              </ConfirmButton>
              <ConfirmButton onConfirm={() => onDelete(s.id)} title={`Delete scenario "${s.name}"`}>
                <X size={14} strokeWidth={2.2} aria-hidden="true" />
              </ConfirmButton>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
