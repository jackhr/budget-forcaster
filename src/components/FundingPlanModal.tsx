import { useState } from 'react';
import type { AllocationSourceType, AllocationType, ExpenseAllocation, Frequency, FundingRule } from '../types';
import { FREQUENCIES, FREQUENCY_LABELS } from '../lib/forecast';
import { formatMoney } from '../lib/format';
import Modal from './Modal';

interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }
interface DebtOpt { id: number; name: string; group_id?: number | null; available?: number | null; overLimit?: boolean } // available credit (limit − balance); null = no limit

interface Props {
  title: string;
  amount: number;
  accounts?: AccountOpt[];
  debts?: DebtOpt[];
  allowDebt?: boolean;
  rules: FundingRule[];
  legacyAllocations?: ExpenseAllocation[];
  onCancel: () => void;
  onSave: (rules: FundingRule[]) => void;
}

function encodeSource(type: AllocationSourceType, id: number): string {
  return `${type}:${id}`;
}

function defaultRule(accounts?: AccountOpt[]): FundingRule {
  return {
    source_type: 'account',
    source_id: accounts?.find((a) => a.is_primary)?.id ?? accounts?.[0]?.id ?? null,
    alloc_type: 'percent',
    value: 0,
    frequency: 'monthly',
    start_date: null,
    end_date: null,
  };
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function monthDraft(value: string | null): string {
  if (!value) return '';
  return value.length >= 7 ? value.slice(0, 7) : value;
}

function cleanMonthInput(value: string): string {
  return value.replace(/[^\d-]/g, '').slice(0, 7);
}

function monthToDate(value: string | null): string | null {
  const draft = monthDraft(value);
  return draft ? `${draft}-01` : null;
}

export function rulesFromLegacy(allocations?: ExpenseAllocation[]): FundingRule[] {
  return (allocations ?? []).map((a) => ({
    source_type: a.source_type,
    source_id: a.source_id,
    alloc_type: a.alloc_type,
    value: a.value,
    frequency: 'monthly',
    start_date: null,
    end_date: null,
  }));
}

export function summarizeFundingPlan(rules?: FundingRule[], allocations?: ExpenseAllocation[]): string {
  const active = rules?.length ? rules : rulesFromLegacy(allocations);
  if (!active.length) return 'Primary account';
  const withDates = active.filter((r) => r.start_date || r.end_date || r.frequency !== 'monthly').length;
  const sources = new Set(active.map((r) => `${r.source_type}:${r.source_id}`));
  if (withDates > 0) return `${active.length} scheduled rule${active.length !== 1 ? 's' : ''}`;
  if (sources.size > 1) return `${sources.size} sources`;
  return active[0].source_type === 'debt' ? 'Card funded' : 'Account funded';
}

export default function FundingPlanModal({ title, amount, accounts = [], debts = [], allowDebt = true, rules, legacyAllocations, onCancel, onSave }: Props) {
  const [draft, setDraft] = useState<FundingRule[]>(rules.length ? rules : rulesFromLegacy(legacyAllocations));
  const [saving, setSaving] = useState(false);

  const fixedSum = draft.filter((r) => r.alloc_type === 'fixed').reduce((s, r) => s + (r.value || 0), 0);
  const pctSum = draft.filter((r) => r.alloc_type === 'percent').reduce((s, r) => s + (r.value || 0), 0);
  const remainderAmt = Math.max(0, (amount || 0) - fixedSum - (amount || 0) * pctSum / 100);

  // Available credit on the card a rule draws from (null = account, or no limit set).
  function cardAvailable(rule: FundingRule): number | null {
    if (rule.source_type !== 'debt' || rule.source_id == null) return null;
    return debts.find((d) => d.id === rule.source_id)?.available ?? null;
  }
  function cardAlreadyOverLimit(rule: FundingRule): boolean {
    if (rule.source_type !== 'debt' || rule.source_id == null) return false;
    return debts.find((d) => d.id === rule.source_id)?.overLimit ?? false;
  }
  // The dollar amount a rule charges per occurrence.
  function ruleDollar(rule: FundingRule): number {
    return rule.alloc_type === 'fixed' ? (rule.value || 0) : (amount || 0) * (rule.value || 0) / 100;
  }
  // A rule that puts more on a card than it has left is allowed, but flagged.
  function overLimit(rule: FundingRule): boolean {
    const av = cardAvailable(rule);
    return cardAlreadyOverLimit(rule) || (av != null && ruleDollar(rule) > av + 0.005);
  }
  const anyOverLimit = draft.some(overLimit);

  const dateInvalid = draft.some((r) => {
    const start = monthDraft(r.start_date);
    const end = monthDraft(r.end_date);
    return (!!start && !MONTH_PATTERN.test(start)) ||
      (!!end && !MONTH_PATTERN.test(end)) ||
      (!!start && !!end && MONTH_PATTERN.test(start) && MONTH_PATTERN.test(end) && end < start);
  });

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text)',
    padding: '8px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    colorScheme: 'dark',
    width: '100%',
  };

  function update(index: number, patch: Partial<FundingRule>) {
    setDraft((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (dateInvalid) return;
    setSaving(true);
    onSave(draft
      .filter((r) => r.source_id != null && r.value > 0)
      .map((r) => ({
        ...r,
        start_date: monthToDate(r.start_date),
        end_date: monthToDate(r.end_date),
      })));
  }

  return (
    <Modal title={title} onClose={onCancel} maxWidth={720}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {draft.map((rule, idx) => (
          <div key={idx} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 86px 110px 32px', gap: 8, alignItems: 'end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Source</span>
                <select
                  value={rule.source_id == null ? '' : encodeSource(rule.source_type, rule.source_id)}
                  onChange={(e) => {
                    const [sourceType, sourceId] = e.target.value.split(':');
                    update(idx, { source_type: sourceType as AllocationSourceType, source_id: Number(sourceId) });
                  }}
                  style={inputStyle}
                >
                  <option value="" disabled>Choose source...</option>
                  {accounts.length > 0 && (
                    <optgroup label="Accounts">
                      {accounts.map((a) => <option key={`a${a.id}`} value={encodeSource('account', a.id)}>{a.name}{a.is_primary ? ' *' : ''}</option>)}
                    </optgroup>
                  )}
                  {allowDebt && debts.length > 0 && (
                    <optgroup label="Credit cards">
                      {debts.map((d) => <option key={`d${d.id}`} value={encodeSource('debt', d.id)}>{d.name}{d.overLimit ? ' (over limit)' : ''}</option>)}
                    </optgroup>
                  )}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Type</span>
                <select value={rule.alloc_type} onChange={(e) => update(idx, { alloc_type: e.target.value as AllocationType })} style={inputStyle}>
                  <option value="percent">%</option>
                  <option value="fixed">$</option>
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Amount</span>
                <input
                  type="number" min={0} step="any"
                  value={rule.value || ''}
                  onChange={(e) => update(idx, { value: parseFloat(e.target.value) || 0 })}
                  style={inputStyle}
                />
              </label>
              <button type="button" onClick={() => setDraft((prev) => prev.filter((_, i) => i !== idx))} style={{ background: 'transparent', color: 'var(--color-expense)', padding: '8px 0' }}>x</button>
            </div>

            {cardAvailable(rule) != null && (
              <p style={{ fontSize: 12, color: overLimit(rule) ? 'var(--color-expense)' : 'var(--color-text-muted)', margin: 0 }}>
                {overLimit(rule)
                  ? cardAlreadyOverLimit(rule)
                    ? `⚠ This card is already over its limit. This rule adds ${formatMoney(ruleDollar(rule))} per occurrence.`
                    : `⚠ Puts this card over its limit — ${formatMoney(ruleDollar(rule))} charged, ${formatMoney(cardAvailable(rule)!)} available.`
                  : `${formatMoney(cardAvailable(rule)!)} available on this card.`}
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Frequency</span>
                <select value={rule.frequency} onChange={(e) => update(idx, { frequency: e.target.value as Frequency })} style={inputStyle}>
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Starts <span style={{ textTransform: 'none', letterSpacing: 0, opacity: 0.75 }}>(YYYY-MM)</span></span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="YYYY-MM"
                  value={monthDraft(rule.start_date)}
                  onChange={(e) => update(idx, { start_date: cleanMonthInput(e.target.value) || null })}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Ends <span style={{ textTransform: 'none', letterSpacing: 0, opacity: 0.75 }}>(YYYY-MM)</span></span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="YYYY-MM"
                  value={monthDraft(rule.end_date)}
                  onChange={(e) => update(idx, { end_date: cleanMonthInput(e.target.value) || null })}
                  style={inputStyle}
                />
              </label>
            </div>
          </div>
        ))}

        <button type="button" onClick={() => setDraft((prev) => [...prev, defaultRule(accounts)])} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', alignSelf: 'flex-start' }}>
          + Add rule
        </button>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          Remainder for uncovered periods is paid from the primary account. Current simple remainder: {formatMoney(remainderAmt, { whole: true })}.
        </p>
        {dateInvalid && <p style={{ fontSize: 12, color: 'var(--color-expense)' }}>Use YYYY-MM, and make sure end is not before start.</p>}
        {anyOverLimit && <p style={{ fontSize: 12, color: 'var(--color-expense)' }}>⚠ A selected card is or will be over its limit. This is allowed, and the card will show a warning.</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '9px 16px' }}>Cancel</button>
          <button type="submit" disabled={saving || dateInvalid} style={{ background: 'var(--color-primary)', color: '#fff', padding: '9px 18px' }}>{saving ? 'Saving...' : 'Save Plan'}</button>
        </div>
      </form>
    </Modal>
  );
}
