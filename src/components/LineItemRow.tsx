import { useState } from 'react';
import type { AllocationSourceType, ExpenseAllocation, Frequency, FundingRule, IncomeOccurrenceStatus, ItemFormData, LineItem, LineItemGroup } from '../types';
import { FREQUENCIES, FREQUENCY_LABELS, INCOME_FREQUENCIES } from '../lib/forecast';
import { formatMoney } from '../lib/format';
import Modal from './Modal';
import ConfirmButton from './ConfirmButton';
import FundingPlanModal, { summarizeFundingPlan } from './FundingPlanModal';
import { Check, X } from 'lucide-react';
import {
  ACCENTS, Button, Field, FieldError, ModalActions, MoneyInput, PaidToggle, Pill, cx, type Accent,
} from '../ui';

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

// "from Jun 12, 2026", "until Dec 1, 2026", or "Jun 12, 2026 → Dec 1, 2026".
function rangeLabel(start: string | null, end: string | null): string | null {
  const from = formatDate(start);
  const to = formatDate(end);
  if (from && to) return `${from} → ${to}`;
  if (from) return `from ${from}`;
  if (to) return `until ${to}`;
  return null;
}

interface Props {
  item: LineItem;
  onUpdate: (id: number, data: ItemFormData) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  accent: Accent;
  showFrequency?: boolean;
  showAccount?: boolean;   // "lands in account" selector (income)
  showFunding?: boolean;   // expense split-funding editor
  groups?: LineItemGroup[];
  accounts?: AccountOpt[];
  debts?: NamedSource[];
  paid?: boolean;
  onTogglePaid?: () => void;
  onUpdateOccurrence?: (scheduledDate: string, occurrenceDate: string, status: 'expected' | 'received' | 'skipped') => Promise<void>;
  onResetOccurrence?: (scheduledDate: string) => Promise<void>;
  drag?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  dragging?: boolean;
}

export default function LineItemRow({ item, onUpdate, onDelete, accent, showFrequency, showAccount, showFunding, groups, accounts, debts, paid, onTogglePaid, onUpdateOccurrence, onResetOccurrence, drag, dragging }: Props) {
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
  const [payday1, setPayday1] = useState('payday_1' in item ? item.payday_1 ?? 15 : 15);
  const [payday2, setPayday2] = useState('payday_2' in item ? item.payday_2 ?? 31 : 31);
  const [start, setStart] = useState('start_date' in item && item.start_date ? item.start_date : today());
  const [end, setEnd] = useState('end_date' in item ? item.end_date ?? '' : '');
  const [groupId, setGroupId] = useState<number | null>(item.group_id);
  const [account, setAccount] = useState<number | null>(itemAccount);
  const [allocations, setAllocations] = useState<ExpenseAllocation[]>(itemAllocations);
  const [fundingRules, setFundingRules] = useState<FundingRule[]>(itemRules);
  const [saving, setSaving] = useState(false);

  function openEditor() {
    setName(item.name);
    setAmount(String(item.monthly_amount));
    setFrequency(itemFreq);
    setPayday1('payday_1' in item ? item.payday_1 ?? 15 : 15);
    setPayday2('payday_2' in item ? item.payday_2 ?? 31 : 31);
    setStart('start_date' in item && item.start_date ? item.start_date : today());
    setEnd('end_date' in item ? item.end_date ?? '' : '');
    setGroupId(item.group_id);
    setAccount(itemAccount);
    setAllocations(itemAllocations);
    setFundingRules(itemRules);
    setEditing(true);
  }

  const amtNum = parseFloat(amount);
  const nameValid = name.trim().length > 0;
  const amountValid = amtNum > 0;
  const startValid = !showFunding || !!start;
  // An end before the first occurrence would bill nothing at all.
  const rangeValid = !end || !start || end >= start;
  const valid = nameValid && amountValid && startValid && rangeValid;
  const dateLabel = showFunding && 'start_date' in item
    ? rangeLabel(item.start_date, 'end_date' in item ? item.end_date : null)
    : null;
  // An expense whose first occurrence hasn't arrived yet: it's in the forecast but not billing now.
  const notStarted = showFunding && 'start_date' in item && !!item.start_date && item.start_date > today();

  // "Paid from" is simple (one account/card, or the primary account) unless
  // there's a scheduled plan or a split — then show the funding-plan summary.
  const advancedFunding = fundingRules.length > 0
    || allocations.length > 1
    || allocations.some((a) => a.alloc_type !== 'percent' || a.value !== 100);
  const singleSource = allocations.length === 1 ? allocations[0] : null;
  const payFromValue = singleSource && singleSource.source_id != null ? `${singleSource.source_type}:${singleSource.source_id}` : '';
  // When paying from a card, show its available credit and projected overage.
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
      ...(showAccount && frequency === 'semimonthly' ? { payday_1: payday1, payday_2: payday2 } : {}),
      ...(showAccount ? { start_date: start } : {}),
      ...(showFunding ? { start_date: start, end_date: frequency === 'one-time' ? null : (end || null) } : {}),
      ...(showAccount ? { account_id: account } : {}),
      ...(showFunding ? { funding_allocations: allocations.filter((a) => a.source_id != null && a.value > 0) } : {}),
      ...(showFunding ? { funding_rules: fundingRules.filter((r) => r.source_id != null && r.value > 0) } : {}),
    });
    setSaving(false);
    setEditing(false);
  }

  const incomeOccurrences = (() => {
    if (!showAccount || itemFreq !== 'semimonthly' || !('occurrences' in item)) return [];
    const now = new Date();
    const days = [item.payday_1 ?? 15, item.payday_2 ?? 31];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const scheduled = [...new Set(days.map((day) => {
      const date = new Date(now.getFullYear(), now.getMonth(), Math.min(day, lastDay));
      if (date.getDay() === 6) date.setDate(date.getDate() - 1);
      if (date.getDay() === 0) date.setDate(date.getDate() - 2);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }))];
    return scheduled.map((scheduledDate) => {
      const occurrence = item.occurrences?.find((candidate) => candidate.scheduled_date === scheduledDate);
      return {
        scheduledDate,
        date: occurrence?.occurrence_date ?? scheduledDate,
        status: (occurrence?.status ?? 'expected') as IncomeOccurrenceStatus,
        transactionName: occurrence?.transaction_name,
      };
    });
  })();
  const receivedCount = incomeOccurrences.filter((occurrence) => occurrence.status === 'received' || occurrence.status === 'detected').length;
  const allReceived = incomeOccurrences.length > 0 && receivedCount === incomeOccurrences.length;
  const isBudget = 'is_budget' in item && !!item.is_budget;
  const hasTags = (showFrequency && itemFreq !== 'monthly') || dateLabel || notStarted || isBudget || !!onTogglePaid;

  return (
    <>
      <div
        {...drag}
        className={cx(
          'grid grid-cols-[minmax(0,1fr)_140px_96px] items-center gap-2 rounded-control px-3 py-2.5',
          'transition-colors hover:bg-surface-2',
          drag && 'cursor-grab',
          dragging && 'outline-2 outline-dashed outline-primary',
        )}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <div className={cx('mt-0.5 h-6 w-[3px] shrink-0 rounded-sm', ACCENTS[accent].bar)} aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-medium [overflow-wrap:anywhere]">{item.name}</span>
            {hasTags && (
              <div className="flex flex-wrap items-center gap-1.5">
                {showFrequency && itemFreq !== 'monthly' && (
                  <Pill tone={accent}>{FREQUENCY_LABELS[itemFreq]}</Pill>
                )}
                {incomeOccurrences.length > 0 && (
                  <span className={cx('text-[10px] font-bold', allReceived ? 'text-income' : 'text-muted')}>
                    {receivedCount} of {incomeOccurrences.length} received this month
                  </span>
                )}
                {isBudget && (
                  <Pill tone="primary" title="A spending limit — its categories and this month's spending are on the Budgets page.">
                    Budget
                  </Pill>
                )}
                {notStarted && (
                  <Pill tone="future" title="Hasn't started yet — it enters the forecast on its first occurrence.">
                    Future
                  </Pill>
                )}
                {dateLabel && <span className="text-[10px] font-semibold text-muted">{dateLabel}</span>}
                {onTogglePaid && <PaidToggle paid={!!paid} onToggle={onTogglePaid} noun="expense" />}
              </div>
            )}
          </div>
        </div>

        <span className={cx('font-semibold', ACCENTS[accent].text)}>{formatMoney(item.monthly_amount)}</span>

        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={openEditor}>Edit</Button>
          <ConfirmButton onConfirm={() => onDelete(item.id)} title={`Delete ${item.name}`}>
            <X size={14} strokeWidth={2.2} aria-hidden="true" />
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
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <Field label="Name">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus required />
            </Field>

            <Field label={showFrequency ? 'Amount Per Payment' : 'Monthly Amount'}>
              <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </Field>

            {showFrequency && (
              <Field label="Frequency">
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className="w-full">
                  {(showAccount ? INCOME_FREQUENCIES : FREQUENCIES).map((f) => (
                    <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>
                  ))}
                </select>
              </Field>
            )}

            {showAccount && frequency === 'semimonthly' && (
              <div className="flex flex-col gap-2.5 rounded-control border border-border bg-surface-2 p-3">
                <div>
                  <strong className="text-[13px]">Twice-monthly pay schedule</strong>
                  <p className="mt-0.5 text-[11.5px] text-muted">Day 31 automatically means the last day of shorter months.</p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="First payday">
                    <input type="number" min={1} max={31} value={payday1} onChange={(e) => setPayday1(Number(e.target.value))} />
                  </Field>
                  <Field label="Second payday">
                    <input type="number" min={1} max={31} value={payday2} onChange={(e) => setPayday2(Number(e.target.value))} />
                  </Field>
                </div>
              </div>
            )}

            {showAccount && frequency !== 'semimonthly' && (
              <Field label="First occurrence" hint="Anchors the recurring schedule.">
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full" />
              </Field>
            )}

            {showAccount && frequency === 'semimonthly' && incomeOccurrences.length > 0 && onUpdateOccurrence && (
              <div className="flex flex-col gap-2">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-muted">This month</span>
                {incomeOccurrences.map((occurrence, index) => {
                  const complete = occurrence.status === 'received' || occurrence.status === 'detected';
                  return (
                    <div
                      key={occurrence.scheduledDate}
                      className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-control border border-border bg-bg p-2.5"
                    >
                      <div className="flex flex-col gap-1">
                        <strong className="text-[12.5px]">Payment {index + 1}</strong>
                        <input
                          type="date"
                          value={occurrence.date}
                          onChange={(e) => onUpdateOccurrence(occurrence.scheduledDate, e.target.value, occurrence.status === 'detected' ? 'received' : occurrence.status as 'expected' | 'received' | 'skipped')}
                          className="w-full"
                        />
                        {occurrence.status === 'detected' && (
                          <span className="text-[10.5px] text-income">
                            Detected from {occurrence.transactionName ?? 'bank transactions'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-stretch gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => onUpdateOccurrence!(occurrence.scheduledDate, occurrence.date, complete ? 'expected' : 'received')}
                          variant={complete ? 'bare' : 'secondary'}
                          className={complete ? 'border-income/55 bg-income/12 text-income hover:bg-income/20' : undefined}
                        >
                          {complete ? <><Check size={12} strokeWidth={2.6} aria-hidden="true" /> Received</> : 'Mark received'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onUpdateOccurrence!(occurrence.scheduledDate, occurrence.date, 'skipped')}>
                          Skip
                        </Button>
                        {onResetOccurrence && occurrence.date !== occurrence.scheduledDate && (
                          <button
                            type="button"
                            onClick={() => onResetOccurrence(occurrence.scheduledDate)}
                            className="text-[10px] text-muted underline transition-colors hover:text-text"
                          >
                            Reset date
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {showFunding && (
              <Field label="When" hint="First occurrence; repeats according to the selected frequency.">
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required className="w-full" />
              </Field>
            )}

            {showFunding && frequency !== 'one-time' && (
              <Field label="Ends (optional)" hint="Last occurrence. Leave blank for an ongoing cost.">
                <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className="w-full" />
              </Field>
            )}

            {groups && (
              <Field label="Group">
                <select
                  value={groupId ?? ''}
                  onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full"
                >
                  <option value="">No group</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
            )}

            {showAccount && accounts && accounts.length > 0 && (
              <Field label="Lands in account">
                <select
                  value={account ?? primaryId ?? ''}
                  onChange={(e) => setAccount(e.target.value ? Number(e.target.value) : null)}
                  className="w-full"
                >
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
                </select>
              </Field>
            )}

            {showFunding && (accounts?.length || debts?.length) ? (
              <Field label="Paid from">
                {advancedFunding ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[13px] text-text">{summarizeFundingPlan(fundingRules, allocations)}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setEditingFunding(true)} className="border-dashed">
                        Edit funding plan
                      </Button>
                      <Button size="sm" onClick={() => { setFundingRules([]); setAllocations([]); }}>
                        Use one source
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <select
                      value={payFromValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) { setAllocations([]); return; }
                        const [t, id] = v.split(':');
                        setAllocations([{ source_type: t as AllocationSourceType, source_id: Number(id), alloc_type: 'percent', value: 100 }]);
                      }}
                      className="w-full"
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
                      cardSpill > 0.005 ? (
                        <FieldError>
                          {selectedCard.name} has {formatMoney(cardAvail)} available — this charge would put it {formatMoney(cardSpill)} over its limit.
                        </FieldError>
                      ) : (
                        <p className="text-[12px] text-muted">{formatMoney(cardAvail)} available on this card.</p>
                      )
                    )}
                    <Button size="sm" onClick={() => setEditingFunding(true)} className="self-start border-dashed">
                      Split or schedule…
                    </Button>
                  </div>
                )}
              </Field>
            ) : null}

            {!nameValid && <FieldError className="-mt-2">Enter a name.</FieldError>}
            {!amountValid && <FieldError className="-mt-2">Enter an amount greater than zero.</FieldError>}
            {!startValid && <FieldError className="-mt-2">Choose the first occurrence date.</FieldError>}
            {!rangeValid && <FieldError className="-mt-2">The end date must be on or after the first occurrence.</FieldError>}

            <ModalActions>
              <Button onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={saving || !valid}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </ModalActions>
          </form>
        </Modal>
      ))}
    </>
  );
}
