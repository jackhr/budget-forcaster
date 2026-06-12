import { useState } from 'react';
import type { AllocationSourceType, ExpenseAllocation, Frequency, FundingRule, ItemFormData, LineItem, LineItemGroup } from '../types';
import { FREQUENCIES, FREQUENCY_LABELS } from '../lib/forecast';
import { formatMoney } from '../lib/format';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';
import FundingPlanModal, { summarizeFundingPlan } from './FundingPlanModal';

interface AccountOpt { id: number; name: string; is_primary: 0 | 1 }
interface NamedSource { id: number; name: string; available?: number | null }

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(date: string | null): string | null {
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  item: LineItem;
  onUpdate: (id: number, data: ItemFormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  accentColor: string;
  showFrequency?: boolean;
  showAccount?: boolean;   // "lands in account" selector (income)
  showFunding?: boolean;   // expense split-funding editor
  groups?: LineItemGroup[];
  accounts?: AccountOpt[];
  debts?: NamedSource[];
  paid?: boolean;
  onTogglePaid?: () => void;
  drag?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  dragging?: boolean;
}

export default function LineItemRow({ item, onUpdate, onDelete, accentColor, showFrequency, showAccount, showFunding, groups, accounts, debts, paid, onTogglePaid, drag, dragging }: Props) {
  const itemFreq: Frequency = 'frequency' in item ? item.frequency : 'monthly';
  const itemAccount = 'account_id' in item ? item.account_id : null;
  const itemAllocations: ExpenseAllocation[] = 'funding_allocations' in item ? (item.funding_allocations ?? []) : [];
  const itemRules: FundingRule[] = 'funding_rules' in item ? (item.funding_rules ?? []) : [];
  const primaryId = accounts?.find((a) => a.is_primary)?.id ?? null;
  const [editing, setEditing] = useState(false);
  const [editingFunding, setEditingFunding] = useState(false);
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(String(item.monthly_amount));
  const [frequency, setFrequency] = useState<Frequency>(itemFreq);
  const [start, setStart] = useState('start_date' in item && item.start_date ? item.start_date : today());
  const [groupId, setGroupId] = useState<number | null>(item.group_id);
  const [account, setAccount] = useState<number | null>(itemAccount);
  const [allocations, setAllocations] = useState<ExpenseAllocation[]>(itemAllocations);
  const [fundingRules, setFundingRules] = useState<FundingRule[]>(itemRules);
  const [saving, setSaving] = useState(false);

  function openEditor() {
    setName(item.name);
    setAmount(String(item.monthly_amount));
    setFrequency(itemFreq);
    setStart('start_date' in item && item.start_date ? item.start_date : today());
    setGroupId(item.group_id);
    setAccount(itemAccount);
    setAllocations(itemAllocations);
    setFundingRules(itemRules);
    setEditing(true);
  }

  const amtNum = parseFloat(amount);
  const valid = name.trim().length > 0 && amtNum > 0 && (!showFunding || !!start);
  const startLabel = showFunding && 'start_date' in item ? formatDate(item.start_date) : null;

  // "Paid from" is simple (one account/card, or the primary account) unless
  // there's a scheduled plan or a split — then show the funding-plan summary.
  const advancedFunding = fundingRules.length > 0
    || allocations.length > 1
    || allocations.some((a) => a.alloc_type !== 'percent' || a.value !== 100);
  const singleSource = allocations.length === 1 ? allocations[0] : null;
  const payFromValue = singleSource && singleSource.source_id != null ? `${singleSource.source_type}:${singleSource.source_id}` : '';
  // When paying from a card, show its available credit and any spill to cash.
  const selectedCard = payFromValue.startsWith('debt:') ? debts?.find((d) => d.id === Number(payFromValue.slice(5))) : undefined;
  const cardAvail = selectedCard?.available ?? null;
  const cardSpill = cardAvail != null && amtNum > cardAvail ? amtNum - cardAvail : 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const amt = amtNum;
    setSaving(true);
    await onUpdate(item.id, {
      name: name.trim(),
      monthly_amount: amt,
      group_id: groupId,
      ...(showFrequency ? { frequency } : {}),
      ...(showFunding ? { start_date: start } : {}),
      ...(showAccount ? { account_id: account } : {}),
      ...(showFunding ? { funding_allocations: allocations.filter((a) => a.source_id != null && a.value > 0) } : {}),
      ...(showFunding ? { funding_rules: fundingRules.filter((r) => r.source_id != null && r.value > 0) } : {}),
    });
    setSaving(false);
    setEditing(false);
  }

  return (
    <>
      <div {...drag} style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 140px 96px',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-sm)',
        alignItems: 'center',
        transition: 'background 0.1s',
        cursor: drag ? 'grab' : undefined,
        outline: dragging ? '2px dashed var(--color-primary)' : undefined,
      }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-2)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
          <div style={{ width: 3, height: 24, marginTop: 1, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{item.name}</span>
            {(showFrequency && itemFreq !== 'monthly') || startLabel || onTogglePaid ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
                {showFrequency && itemFreq !== 'monthly' && (
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: accentColor,
                    background: `${accentColor}1f`,
                    border: `1px solid ${accentColor}40`,
                    borderRadius: 5,
                    padding: '1px 6px',
                  }}>
                    {FREQUENCY_LABELS[itemFreq]}
                  </span>
                )}
                {startLabel && (
                  <span style={{ color: 'var(--color-text-muted)', fontSize: 10, fontWeight: 600 }}>
                    from {startLabel}
                  </span>
                )}
                {onTogglePaid && (
                  <button
                    onClick={onTogglePaid}
                    title={paid ? 'Paid this month — this month’s expense is excluded from the forecast. Click to mark unpaid.' : 'Not paid this month — click to mark paid (skips this month’s expense in the forecast).'}
                    style={{
                      background: 'transparent',
                      color: paid ? 'var(--color-income)' : 'var(--color-text-muted)',
                      border: 0,
                      padding: 0,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {paid ? '✓ Paid this month' : 'Mark paid'}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <span style={{ fontWeight: 600, color: accentColor }}>
          {formatMoney(item.monthly_amount)}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={openEditor}
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', padding: '5px 10px', border: '1px solid var(--color-border)' }}
          >
            Edit
          </button>
          <ConfirmButton
            onConfirm={() => onDelete(item.id)}
            title={`Delete ${item.name}`}
            triggerStyle={{ background: 'transparent', color: 'var(--color-expense)', padding: '5px 10px', border: '1px solid transparent' }}
          >
            ✕
          </ConfirmButton>
        </div>
      </div>

      {editing && (editingFunding ? (
        <FundingPlanModal
          title={`Funding plan for ${item.name}`}
          amount={amtNum || item.monthly_amount}
          accounts={accounts}
          debts={debts}
          allowDebt
          rules={fundingRules}
          legacyAllocations={allocations}
          onCancel={() => setEditingFunding(false)}
          onSave={(rules) => { setFundingRules(rules); setEditingFunding(false); }}
        />
      ) : (
        <Modal title={`Edit ${item.name}`} onClose={() => setEditing(false)}>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                autoFocus
                required
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {showFrequency ? 'Amount Per Payment' : 'Monthly Amount'}
              </span>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={0}
                  step="any"
                  style={{ width: '100%', paddingLeft: 24 }}
                  required
                />
              </div>
            </label>

            {showFrequency && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Frequency
                </span>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as Frequency)}
                  style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text)',
                    padding: '8px 10px',
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
                  ))}
                </select>
              </label>
            )}

            {showFunding && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  When
                </span>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required style={{ colorScheme: 'dark' }} />
                <span style={{ color: 'var(--color-text-muted)', fontSize: 11.5 }}>
                  First occurrence; repeats according to the selected frequency.
                </span>
              </label>
            )}

            {groups && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Group
                </span>
                <select
                  value={groupId ?? ''}
                  onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text)',
                    padding: '8px 10px',
                    fontSize: 13,
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="">No group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>
            )}

            {showAccount && accounts && accounts.length > 0 && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Lands in account
                </span>
                <select
                  value={account ?? primaryId ?? ''}
                  onChange={(e) => setAccount(e.target.value ? Number(e.target.value) : null)}
                  style={{
                    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                    padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
                  }}
                >
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
                </select>
              </label>
            )}

            {showFunding && (accounts?.length || debts?.length) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Paid from
                </span>
                {advancedFunding ? (
                  <>
                    <p style={{ fontSize: 13, color: 'var(--color-text)' }}>{summarizeFundingPlan(fundingRules, allocations)}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setEditingFunding(true)} style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12.5 }}>
                        Edit funding plan
                      </button>
                      <button type="button" onClick={() => { setFundingRules([]); setAllocations([]); }} style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12.5 }}>
                        Use one source
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <select
                      value={payFromValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) { setAllocations([]); return; }
                        const [t, id] = v.split(':');
                        setAllocations([{ source_type: t as AllocationSourceType, source_id: Number(id), alloc_type: 'percent', value: 100 }]);
                      }}
                      style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }}
                    >
                      <option value="">Primary account</option>
                      {accounts && accounts.length > 0 && (
                        <optgroup label="Accounts">
                          {accounts.map((a) => <option key={`a${a.id}`} value={`account:${a.id}`}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
                        </optgroup>
                      )}
                      {debts && debts.length > 0 && (
                        <optgroup label="Credit cards">
                          {debts.map((d) => <option key={`d${d.id}`} value={`debt:${d.id}`}>{d.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                    {selectedCard && cardAvail != null && (
                      <p style={{ fontSize: 12, margin: 0, color: cardSpill > 0.005 ? 'var(--color-expense)' : 'var(--color-text-muted)' }}>
                        {cardSpill > 0.005
                          ? `⚠ ${selectedCard.name} has ${formatMoney(cardAvail)} left — ${formatMoney(cardSpill)} of this ${formatMoney(amtNum || 0)} is uncovered (no source). Use “Split or schedule” to assign it.`
                          : `${formatMoney(cardAvail)} available on this card.`}
                      </p>
                    )}
                    <button type="button" onClick={() => setEditingFunding(true)} style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12.5, alignSelf: 'flex-start' }}>
                      Split or schedule…
                    </button>
                  </>
                )}
              </div>
            ) : null}

            {!valid && (
              <p style={{ fontSize: 12, color: 'var(--color-expense)', marginTop: -6 }}>
                Enter a name and an amount greater than zero.
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setEditing(false)}
                style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '9px 16px' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !valid}
                style={{ background: 'var(--color-primary)', color: '#fff', padding: '9px 18px' }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      ))}
    </>
  );
}
