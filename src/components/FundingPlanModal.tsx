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
  // Per-occurrence dollars that would put a selected card over its limit.
  const cardSpill = draft.reduce((sum, r) => {
    const av = cardAvailable(r);
    return av == null ? sum : sum + Math.max(0, ruleDollar(r) - av);
  }, 0);

  // Day-level dates (YYYY-MM-DD); native pickers guarantee the format, so we only
  // guard that a recurring rule's end isn't before its start.
  const dateInvalid = draft.some((r) => r.frequency !== 'one-time' && !!r.start_date && !!r.end_date && r.end_date < r.start_date);
  const percentInvalid = draft.some((r) => r.alloc_type === 'percent' && r.value > 100);

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
  };

  function update(index: number, patch: Partial<FundingRule>) {
    setDraft((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (dateInvalid || percentInvalid) return;
    setSaving(true);
    onSave(draft
      .filter((r) => r.source_id != null && r.value > 0)
      .map((r) => ({
        ...r,
        start_date: r.start_date || null,
        end_date: r.frequency === 'one-time' ? null : (r.end_date || null), // one-time has no end
      })));
  }

  return (
    <Modal title={title} onClose={onCancel} maxWidth={720}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {draft.map((rule, idx) => (
          <div key={idx} className="funding-rule-card">
            <div className="funding-rule-main">
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
                  type="number" min={0} max={rule.alloc_type === 'percent' ? 100 : undefined} step="any"
                  value={rule.value || ''}
                  onChange={(e) => update(idx, { value: parseFloat(e.target.value) || 0 })}
                  style={inputStyle}
                />
              </label>
              <button
                type="button"
                className="funding-rule-remove"
                aria-label="Remove funding rule"
                title="Remove funding rule"
                onClick={() => setDraft((prev) => prev.filter((_, i) => i !== idx))}
              >
                ✕
              </button>
            </div>

            {cardAvailable(rule) != null && (
              <p style={{ fontSize: 12, color: overLimit(rule) ? 'var(--color-expense)' : 'var(--color-text-muted)', margin: 0 }}>
                {overLimit(rule)
                  ? cardAlreadyOverLimit(rule)
                    ? `⚠ Card is already over its limit — this rule adds another ${formatMoney(ruleDollar(rule))}.`
                    : `⚠ Card has ${formatMoney(cardAvailable(rule)!)} available — this rule would put it ${formatMoney(ruleDollar(rule) - cardAvailable(rule)!)} over its limit.`
                  : `${formatMoney(cardAvailable(rule)!)} available on this card.`}
              </p>
            )}

            <div className={`funding-rule-schedule${rule.frequency === 'one-time' ? ' is-one-time' : ''}`}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Frequency</span>
                <select
                  value={rule.frequency}
                  onChange={(e) => {
                    const f = e.target.value as Frequency;
                    update(idx, f === 'one-time' ? { frequency: f, end_date: null } : { frequency: f });
                  }}
                  style={inputStyle}
                >
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>{rule.frequency === 'one-time' ? 'Payment date' : 'Starts'}</span>
                <input
                  type="date"
                  value={rule.start_date ?? ''}
                  onChange={(e) => update(idx, { start_date: e.target.value || null })}
                  style={inputStyle}
                />
              </label>
              {rule.frequency !== 'one-time' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={labelStyle}>Ends <span style={{ textTransform: 'none', letterSpacing: 0, opacity: 0.75 }}>(optional)</span></span>
                  <input
                    type="date"
                    value={rule.end_date ?? ''}
                    min={rule.start_date ?? undefined}
                    onChange={(e) => update(idx, { end_date: e.target.value || null })}
                    style={inputStyle}
                  />
                </label>
              )}
            </div>
          </div>
        ))}

        <button type="button" onClick={() => setDraft((prev) => [...prev, defaultRule(accounts)])} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', alignSelf: 'flex-start' }}>
          + Add rule
        </button>
        {allowDebt ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Any unallocated remainder is paid from the primary account. Current simple remainder: {formatMoney(remainderAmt, { whole: true })}.
          </p>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            These rules are the complete payment plan. Active rules combine, and months without an active rule make no payment.
          </p>
        )}
        {dateInvalid && <p style={{ fontSize: 12, color: 'var(--color-expense)' }}>Make sure the end date is not before the start date.</p>}
        {percentInvalid && <p style={{ fontSize: 12, color: 'var(--color-expense)' }}>A percentage rule cannot exceed 100%. Add separate rules when multiple payments should accumulate.</p>}
        {cardSpill > 0.005 && (
          <p style={{ fontSize: 12, color: 'var(--color-expense)' }}>
            ⚠ Selected card rules would exceed available credit by {formatMoney(cardSpill)} per occurrence and put those cards over limit.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '9px 16px' }}>Cancel</button>
          <button type="submit" disabled={saving || dateInvalid || percentInvalid} style={{ background: 'var(--color-primary)', color: '#fff', padding: '9px 18px' }}>{saving ? 'Saving...' : 'Save Plan'}</button>
        </div>
      </form>
    </Modal>
  );
}
