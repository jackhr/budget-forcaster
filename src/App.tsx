import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import type { Account, Debt, Expense, GroupKind, IncomeSource, ItemFormData, LineItemGroup, ScheduledPayment } from './types';
import {
  accountsApi, dataApi, debtsApi, expensesApi, groupsApi, incomeApi, scenariosApi, scheduledApi, settingsApi,
  type Scenario,
} from './api/client';
import { buildForecast, buildSavings, buildNetWorth, buildDebtCharges, buildExpensePlan, buildDebtPaymentSchedule, buildIncomeBreakdown, buildExpenseBreakdown, buildFutureExpenseBreakdown, buildAccountSeries, buildScheduledOutByAccount, buildDebtOutByAccount, buildAccountActivity, buildDebtActivity, buildAccountSavings, type Breakdown } from './lib/forecast';
import { buildMonthBreakdown } from './lib/monthlyBreakdown';
import { simulateDebtPlan, debtPaidDefault, type DebtStrategy } from './lib/debt';
import { setCurrency, formatMoney } from './lib/format';
import { useToast } from './components/Toast';
import SummaryCards from './components/SummaryCards';
import LineItemTable from './components/LineItemTable';
import SavingsSummary from './components/SavingsSummary';
import ScheduledPayments, { fundingLabel } from './components/ScheduledPayments';
import Debts from './components/Debts';
import Accounts from './components/Accounts';
import PlaidConnect from './components/PlaidConnect';
import HeaderControls from './components/HeaderControls';
import Toolbar from './components/Toolbar';
import NavMenu from './components/NavMenu';
import type { PayoffMarker } from './components/NetWorthChart';

// Charts pull in Recharts (~the bulk of the bundle) — load them on demand.
const ForecastChart = lazy(() => import('./components/ForecastChart'));
const SavingsChart = lazy(() => import('./components/SavingsChart'));
const NetWorthChart = lazy(() => import('./components/NetWorthChart'));
const BreakdownChart = lazy(() => import('./components/BreakdownChart'));
const MonthlyBreakdown = lazy(() => import('./components/MonthlyBreakdown'));
const OverviewChart = lazy(() => import('./components/OverviewChart'));
const AccountActivity = lazy(() => import('./components/AccountActivity'));
const AccountOutflows = lazy(() => import('./components/AccountOutflows'));
const Transactions = lazy(() => import('./components/Transactions'));

type Tab = 'forecast' | 'savings' | 'networth' | 'breakdown' | 'overview' | 'account' | 'outflows' | 'transactions';

const TABS: [Tab, string][] = [
  ['forecast', 'Forecast'],
  ['savings', 'Savings'],
  ['networth', 'Net Worth'],
  ['breakdown', 'Breakdown'],
  ['overview', 'Overview'],
  ['account', 'Activity'],
  ['outflows', 'Outflows'],
  ['transactions', 'Transactions'],
];
type BreakdownSection = 'account' | 'income' | 'expense' | 'future' | 'debt';
type BreakdownMode = 'range' | 'month';

function reorderBy<T extends { id: number }>(arr: T[], ids: number[]): T[] {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return [...arr].sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

interface Snapshot {
  income_sources?: IncomeSource[];
  expenses?: Expense[];
  scheduled_payments?: ScheduledPayment[];
  debts?: Debt[];
  accounts?: Account[];
  app_settings?: { key: string; value: string }[];
}

function scenarioSeries(snap: Snapshot, months: number) {
  const s: Record<string, string> = {};
  for (const r of snap.app_settings ?? []) s[r.key] = r.value;
  // Prefer accounts sum; fall back to the legacy single starting_balance.
  const start = (snap.accounts && snap.accounts.length)
    ? snap.accounts.reduce((sum, a) => sum + a.balance, 0)
    : (parseFloat(s.starting_balance ?? '0') || 0);
  const infl = parseFloat(s.inflation_rate ?? '0') || 0;
  const extra = parseFloat(s.debt_extra ?? '0') || 0;
  const strat = (s.debt_strategy as DebtStrategy) ?? 'none';
  const inc = snap.income_sources ?? [];
  const exp = snap.expenses ?? [];
  const pay = snap.scheduled_payments ?? [];
  const debts = snap.debts ?? [];
  const accts = snap.accounts ?? [];
  const ep = buildExpensePlan(exp, accts, debts, months, infl);
  const charges = [...buildDebtCharges(pay, months), ...ep.charges];
  const plan = simulateDebtPlan(debts, strat === 'none' ? 0 : extra, strat, months, charges, buildDebtPaymentSchedule(debts, months));
  const cashOut = plan.outflow.map((v) => Math.round(v * 100) / 100);
  const fc = buildForecast(inc, ep.ongoingCashOut, pay, cashOut, months);
  const sv = buildSavings(inc, ep.ongoingCashOut, pay, cashOut, months, start);
  const nw = buildNetWorth(sv, plan.remaining);
  return { forecast: fc.map((p) => p.net), savings: sv.map((p) => p.balance), networth: nw.map((p) => p.netWorth) };
}

function ChartFallback() {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
      Loading chart…
    </div>
  );
}

export default function App() {
  const toast = useToast();
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<ScheduledPayment[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<LineItemGroup[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [currency, setCurrencyState] = useState('USD');
  const [inflation, setInflation] = useState(0);
  const [debtExtra, setDebtExtra] = useState(0);
  const [debtStrategy, setDebtStrategy] = useState<DebtStrategy>('none');
  const [months, setMonths] = useState(() => Number(localStorage.getItem('bf.months')) || 12);
  const [startMonth, setStartMonth] = useState(() => Number(localStorage.getItem('bf.startMonth')) || 0);
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('bf.tab') as Tab) || 'forecast');
  const [compareId, setCompareId] = useState<number | null>(null);
  const [breakdownSection, setBreakdownSection] = useState<BreakdownSection>(() => (localStorage.getItem('bf.breakdown') as BreakdownSection) || 'debt');
  const [breakdownIncludeFuture, setBreakdownIncludeFuture] = useState(() => localStorage.getItem('bf.breakdownFuture') !== '0');
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>(() => (localStorage.getItem('bf.breakdownMode') as BreakdownMode) || 'range');
  const [breakdownMonth, setBreakdownMonth] = useState(() => Number(localStorage.getItem('bf.breakdownMonth')) || 0);
  const [activeEntity, setActiveEntity] = useState<string>(''); // 'account:id' | 'debt:id' for the Activity tab
  const [activityMonth, setActivityMonth] = useState(() => Number(localStorage.getItem('bf.activityMonth')) || 0);
  const [savingsAccountId, setSavingsAccountId] = useState<number | null>(null); // null = all accounts
  // Per-debt "paid this month" overrides, keyed by debt id -> "YYYY-MM:1" | "YYYY-MM:0".
  const [paidOverrides, setPaidOverrides] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem('bf.debtPaid') || '{}'); } catch { return {}; }
  });
  const [expensePaidOverrides, setExpensePaidOverrides] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem('bf.expensePaid') || '{}'); } catch { return {}; }
  });
  const [dupDismissed, setDupDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { localStorage.setItem('bf.months', String(months)); }, [months]);
  useEffect(() => { localStorage.setItem('bf.startMonth', String(startMonth)); }, [startMonth]);
  useEffect(() => { localStorage.setItem('bf.tab', tab); }, [tab]);
  useEffect(() => { localStorage.setItem('bf.breakdown', breakdownSection); }, [breakdownSection]);
  useEffect(() => { localStorage.setItem('bf.breakdownFuture', breakdownIncludeFuture ? '1' : '0'); }, [breakdownIncludeFuture]);
  useEffect(() => { localStorage.setItem('bf.breakdownMode', breakdownMode); }, [breakdownMode]);
  useEffect(() => { localStorage.setItem('bf.breakdownMonth', String(breakdownMonth)); }, [breakdownMonth]);
  useEffect(() => { localStorage.setItem('bf.activityMonth', String(activityMonth)); }, [activityMonth]);
  useEffect(() => { localStorage.setItem('bf.debtPaid', JSON.stringify(paidOverrides)); }, [paidOverrides]);
  useEffect(() => { localStorage.setItem('bf.expensePaid', JSON.stringify(expensePaidOverrides)); }, [expensePaidOverrides]);
  useEffect(() => { if (startMonth >= months) setStartMonth(Math.max(0, months - 1)); }, [startMonth, months]);

  const changeStartMonth = (value: number) => setStartMonth(Math.max(0, Math.min(value, months - 1)));
  const changeEndMonth = (value: number) => setMonths(Math.max(startMonth + 1, Math.min(120, value)));

  const load = useCallback(async () => {
    try {
      const [inc, exp, sched, dbts, accts, grps, scen, settings] = await Promise.all([
        incomeApi.getAll(), expensesApi.getAll(), scheduledApi.getAll(),
        debtsApi.getAll(), accountsApi.getAll(), groupsApi.getAll(), scenariosApi.getAll(), settingsApi.getAll(),
      ]);
      setIncomeSources(inc); setExpenses(exp); setPayments(sched); setDebts(dbts);
      setAccounts(accts); setGroups(grps); setScenarios(scen);
      setInflation(parseFloat(settings.inflation_rate ?? '0') || 0);
      setDebtExtra(parseFloat(settings.debt_extra ?? '0') || 0);
      setDebtStrategy((settings.debt_strategy as DebtStrategy) || 'none');
      const cur = settings.currency || 'USD';
      setCurrency(cur); setCurrencyState(cur);
      setError(null);
    } catch (e) {
      setError('Cannot connect to the API server. Make sure the backend is running on port 3001.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const guard = useCallback(async (fn: () => Promise<void>, errMsg: string) => {
    try { await fn(); } catch (e) {
      console.error(e);
      toast.error(`${errMsg}: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }, [toast]);

  // --- Derived series ---
  const totalCash = accounts.reduce((sum, a) => sum + a.balance, 0);
  // Split-funded expenses: cash portions reduce accounts; credit-line portions charge cards.
  const monthKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const isExpensePaidThisMonth = (e: Expense): boolean => expensePaidOverrides[e.id] === `${monthKey}:1`;
  const toggleExpensePaid = (e: Expense) => setExpensePaidOverrides((prev) => ({ ...prev, [e.id]: `${monthKey}:${isExpensePaidThisMonth(e) ? 0 : 1}` }));
  const expensesPaidThisMonth = new Set(expenses.filter(isExpensePaidThisMonth).map((e) => e.id));
  const expensePlan = buildExpensePlan(expenses, accounts, debts, months, inflation, new Date(), expensesPaidThisMonth);
  // Future expenses charged to a card + expense card-portions both bill the debt over time.
  const debtCharges = [...buildDebtCharges(payments, months), ...expensePlan.charges];
  // Any active debt funding-plan amount overrides its monthly payment per month.
  const debtPayments = buildDebtPaymentSchedule(debts, months);
  // "Paid this month": user override for the current month, else the autopay-day default.
  const isPaidThisMonth = (d: Debt): boolean => {
    const ov = paidOverrides[d.id];
    if (ov && ov.startsWith(`${monthKey}:`)) return ov.endsWith(':1');
    return debtPaidDefault(d);
  };
  const togglePaid = (d: Debt) => setPaidOverrides((prev) => ({ ...prev, [d.id]: `${monthKey}:${isPaidThisMonth(d) ? 0 : 1}` }));
  const paidThisMonth = new Set(debts.filter(isPaidThisMonth).map((d) => d.id));
  const plan = simulateDebtPlan(debts, debtStrategy === 'none' ? 0 : debtExtra, debtStrategy, months, debtCharges, debtPayments, paidThisMonth);
  const basePlan = simulateDebtPlan(debts, 0, 'none', months, debtCharges, debtPayments, paidThisMonth);
  // Cash out for debts = the actual payments. Charge overflow (the part of a card
  // charge that exceeds its available credit, or a loan/unknown target) is NOT paid
  // from cash — it's left uncovered and flagged below.
  const debtCashOut = plan.outflow.map((v) => Math.round(v * 100) / 100);
  const forecast = buildForecast(incomeSources, expensePlan.ongoingCashOut, payments, debtCashOut, months);
  const savings = buildSavings(incomeSources, expensePlan.ongoingCashOut, payments, debtCashOut, months, totalCash);
  const netWorth = buildNetWorth(savings, plan.remaining);

  // Payoff markers (one debt name per month it clears).
  const payoffMarkers: PayoffMarker[] = [];
  const byMonth = new Map<number, string[]>();
  for (const d of debts) {
    const mi = plan.payoffMonthByDebt.get(d.id);
    if (mi != null && mi < savings.length) {
      if (!byMonth.has(mi)) byMonth.set(mi, []);
      byMonth.get(mi)!.push(d.name);
    }
  }
  for (const [mi, names] of byMonth) payoffMarkers.push({ label: savings[mi].label, name: names.join(', ') });

  // Shared per-account outflow maps (used by Savings switcher, Account tab, Breakdown).
  const primaryAccountId = (accounts.find((a) => a.is_primary) ?? accounts[0])?.id ?? null;
  const scheduledOutByAccount = buildScheduledOutByAccount(payments, accounts, months);
  const debtOutByAccount = buildDebtOutByAccount(debts, plan, accounts);
  // Uncovered funding (the over-limit card excess) is not paid from any account, so
  // nothing is attributed here — it shows up as a flag, not as cash leaving.

  // Combined overview series: monthly flows, balances, and future-expense totals.
  const futureBd = buildFutureExpenseBreakdown(payments, months);
  const futureTotals = futureBd.total;
  // Future-expense bars for the Accounts chart. Bars use the *total* expense
  // amount (so card-funded ones still show, not just cash draws), with the
  // names + funding source(s) shown in the tooltip.
  const cardOpts = debts.filter((d) => d.debt_type === 'credit_card').map((d) => ({ id: d.id, name: d.name, group_id: d.group_id }));
  const acctOpts = accounts.map((a) => ({ id: a.id, name: a.name, is_primary: a.is_primary }));
  const futureExpenseBars = futureBd.labels.map((_, i) => {
    const active = futureBd.series.filter((s) => (s.values[i] ?? 0) > 0);
    const froms = active.map((s) => {
      const p = payments.find((pp) => pp.id === s.id);
      return p ? fundingLabel(p, acctOpts, cardOpts) : '';
    }).filter(Boolean);
    return {
      value: futureTotals[i] ?? 0,
      label: active.map((s) => s.name).join(', '),
      from: [...new Set(froms)].join(', '),
    };
  });
  const overviewData = savings.map((s, i) => ({
    label: s.label,
    income: s.income,
    expenses: s.expenses,
    future: futureTotals[i] ?? 0,
    cash: s.balance,
    debt: plan.remaining[i] ?? 0,
  }));

  // Per-item breakdown for the selected section.
  let breakdown: Breakdown;
  let breakdownTitle: string;
  let breakdownSubtitle: string;
  if (breakdownSection === 'account') {
    let sav = savings, sched = scheduledOutByAccount, debtOut = debtOutByAccount;
    if (!breakdownIncludeFuture) {
      // Re-run the cash pipeline with no future expenses (drops their cash draws
      // and any card charges they'd add to the debt plan).
      const planNF = simulateDebtPlan(debts, debtStrategy === 'none' ? 0 : debtExtra, debtStrategy, months, expensePlan.charges, debtPayments, paidThisMonth);
      const debtCashOutNF = planNF.outflow.map((v) => Math.round(v * 100) / 100);
      sav = buildSavings(incomeSources, expensePlan.ongoingCashOut, [], debtCashOutNF, months, totalCash);
      sched = buildScheduledOutByAccount([], accounts, months);
      debtOut = buildDebtOutByAccount(debts, planNF, accounts);
    }
    breakdown = buildAccountSeries(accounts, incomeSources, sav, expensePlan.outByAccount, sched, debtOut);
    breakdownTitle = 'Accounts Over Time';
    breakdownSubtitle = breakdownIncludeFuture
      ? 'Balance of each account/savings pile over time, alongside total cash'
      : 'Balance of each account/savings pile over time — future expenses excluded';
  } else if (breakdownSection === 'income') {
    breakdown = buildIncomeBreakdown(incomeSources, months);
    breakdownTitle = 'Income Breakdown';
    breakdownSubtitle = 'Each income source per month, alongside the combined total';
  } else if (breakdownSection === 'expense') {
    breakdown = buildExpenseBreakdown(expenses, months, inflation, new Date(), expensesPaidThisMonth);
    breakdownTitle = 'Expense Breakdown';
    breakdownSubtitle = 'Each expense per month (inflation-adjusted), alongside the combined total';
  } else if (breakdownSection === 'future') {
    breakdown = buildFutureExpenseBreakdown(payments, months);
    breakdownTitle = 'Future Expense Breakdown';
    breakdownSubtitle = 'Each future expense per month, alongside the combined total';
  } else {
    breakdown = {
      labels: savings.map((s) => s.label),
      total: plan.remaining,
      series: debts.map((d) => ({ id: d.id, name: d.name, values: plan.remainingByDebt.get(d.id) ?? [] })),
    };
    breakdownTitle = 'Debt Breakdown';
    breakdownSubtitle = 'Remaining balance of each debt over time, alongside total debt';
  }

  // Per-debt, per-month detail for the Debt Breakdown tooltip: which expenses /
  // future expenses were charged that month, and the payment applied.
  let debtMonthInfo: Map<number, { charges: { label: string; amount: number; kind: string }[]; payment: number }[]> | undefined;
  if (breakdownSection === 'debt') {
    debtMonthInfo = new Map();
    for (const d of debts) {
      const arr = Array.from({ length: months }, () => ({ charges: [] as { label: string; amount: number; kind: string }[], payment: 0 }));
      const pay = plan.outflowByDebt.get(d.id);
      if (pay) for (let m = 0; m < months; m++) arr[m].payment = pay[m] ?? 0;
      debtMonthInfo.set(d.id, arr);
    }
    for (const c of debtCharges) {
      const arr = debtMonthInfo.get(c.debtId);
      if (arr && c.monthIndex >= 0 && c.monthIndex < months) {
        arr[c.monthIndex].charges.push({ label: c.label ?? 'Charge', amount: c.amount, kind: c.kind ?? 'future' });
      }
    }
  }

  // Compare overlay from a saved scenario.
  const compareScenario = scenarios.find((s) => s.id === compareId) ?? null;
  const compareSeries = compareScenario ? scenarioSeries(compareScenario.snapshot as Snapshot, months) : null;
  const visible = <T,>(values: T[]) => values.slice(startMonth, months);
  const visibleBreakdown: Breakdown = {
    labels: visible(breakdown.labels),
    total: visible(breakdown.total),
    series: breakdown.series.map((s) => ({ ...s, values: visible(s.values) })),
  };
  const visibleDebtMonthInfo = debtMonthInfo
    ? new Map([...debtMonthInfo].map(([id, values]) => [id, visible(values)]))
    : undefined;
  const visibleCompare = compareSeries
    ? {
        forecast: visible(compareSeries.forecast),
        savings: visible(compareSeries.savings),
        networth: visible(compareSeries.networth),
      }
    : null;
  const visibleMap = (map: Map<number, number[]>) =>
    new Map([...map].map(([id, values]) => [id, visible(values)]));
  const monthlyBreakdown = buildMonthBreakdown(
    incomeSources, expenses, payments, debts, accounts, breakdownMonth, new Date(), paidThisMonth, expensesPaidThisMonth,
  );

  // This month's outflow breakdown.
  const m0 = savings[0];
  const moneyOut = m0 ? m0.expenses + m0.scheduledOut + m0.debtOut : 0;

  // Uncovered funding: card charges that exceed available credit aren't paid from
  // anywhere — they're left floating until the user assigns a source.
  const uncoveredThisMonth = plan.chargeOverflow[0] ?? 0;
  const uncoveredMonths = plan.chargeOverflow.filter((v) => v > 0.005).length;
  const uncoveredAny = uncoveredMonths > 0;

  // Duplicate-name detection across expense-like things.
  const nameCounts = new Map<string, number>();
  for (const x of [...expenses, ...payments, ...debts]) {
    const k = x.name.trim().toLowerCase();
    nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
  }
  const duplicates = [...nameCounts.entries()].filter(([, c]) => c > 1).map(([k]) => k);

  // --- Mutations ---
  const addIncome = (data: ItemFormData) => guard(async () => {
    const item = await incomeApi.create({ frequency: 'monthly', start_date: null, account_id: null, ...data, group_id: data.group_id ?? null });
    setIncomeSources((prev) => [...prev, item]);
  }, 'Could not add income');
  const updateIncome = (id: number, data: ItemFormData) => guard(async () => {
    const item = await incomeApi.update(id, data);
    setIncomeSources((prev) => prev.map((i) => (i.id === id ? item : i)));
  }, 'Could not update income');
  const deleteIncome = (id: number) => guard(async () => {
    await incomeApi.delete(id);
    setIncomeSources((prev) => prev.filter((i) => i.id !== id));
  }, 'Could not delete income');
  const reorderIncome = (ids: number[]) => guard(async () => {
    setIncomeSources((prev) => reorderBy(prev, ids));
    await incomeApi.reorder(ids);
  }, 'Could not reorder income');

  const addExpense = (data: ItemFormData) => guard(async () => {
    const item = await expensesApi.create({
      name: data.name, monthly_amount: data.monthly_amount,
      frequency: data.frequency ?? 'monthly', start_date: data.start_date ?? null, end_date: null,
      group_id: data.group_id ?? null, funding_allocations: data.funding_allocations ?? [], funding_rules: data.funding_rules ?? [],
    });
    setExpenses((prev) => [...prev, item]);
  }, 'Could not add expense');
  const updateExpense = (id: number, data: ItemFormData) => guard(async () => {
    const item = await expensesApi.update(id, { ...data, end_date: null });
    setExpenses((prev) => prev.map((i) => (i.id === id ? item : i)));
  }, 'Could not update expense');
  const deleteExpense = (id: number) => guard(async () => {
    await expensesApi.delete(id);
    setExpenses((prev) => prev.filter((i) => i.id !== id));
  }, 'Could not delete expense');
  const reorderExpenses = (ids: number[]) => guard(async () => {
    setExpenses((prev) => reorderBy(prev, ids));
    await expensesApi.reorder(ids);
  }, 'Could not reorder expenses');

  type PaymentInput = Omit<ScheduledPayment, 'id' | 'created_at' | 'updated_at'>;
  const addPayment = (data: PaymentInput) => guard(async () => {
    const item = await scheduledApi.create(data);
    setPayments((prev) => [...prev, item]);
  }, 'Could not add future expense');
  const updatePayment = (id: number, data: PaymentInput) => guard(async () => {
    const item = await scheduledApi.update(id, data);
    setPayments((prev) => prev.map((p) => (p.id === id ? item : p)));
  }, 'Could not update future expense');
  const deletePayment = (id: number) => guard(async () => {
    await scheduledApi.delete(id);
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, 'Could not delete future expense');

  type DebtInput = Omit<Debt, 'id' | 'created_at' | 'updated_at'>;
  const addDebt = (data: DebtInput) => guard(async () => {
    const item = await debtsApi.create(data);
    setDebts((prev) => [...prev, item]);
  }, 'Could not add debt');
  const updateDebt = (id: number, data: DebtInput) => guard(async () => {
    const item = await debtsApi.update(id, data);
    setDebts((prev) => prev.map((d) => (d.id === id ? item : d)));
  }, 'Could not update debt');
  const deleteDebt = (id: number) => guard(async () => {
    await debtsApi.delete(id);
    setDebts((prev) => prev.filter((d) => d.id !== id));
  }, 'Could not delete debt');
  const reorderDebts = (ids: number[]) => guard(async () => {
    setDebts((prev) => reorderBy(prev, ids));
    await debtsApi.reorder(ids);
  }, 'Could not reorder debts');

  // Account handlers
  type AccountInput = { name: string; balance: number; is_primary?: 0 | 1 };
  const addAccount = (data: AccountInput) => guard(async () => {
    const acct = await accountsApi.create(data);
    setAccounts((prev) => [...prev, acct]);
  }, 'Could not add account');
  const updateAccount = (id: number, data: AccountInput) => guard(async () => {
    await accountsApi.update(id, data);
    setAccounts(await accountsApi.getAll()); // refresh (primary flag may have moved)
  }, 'Could not update account');
  const deleteAccount = (id: number) => guard(async () => {
    await accountsApi.delete(id);
    const [accts, inc] = await Promise.all([accountsApi.getAll(), incomeApi.getAll()]);
    setAccounts(accts); setIncomeSources(inc); // income may have been reassigned to primary
  }, 'Could not delete account');
  const makePrimary = (id: number) => guard(async () => {
    await accountsApi.update(id, { is_primary: 1 });
    setAccounts(await accountsApi.getAll());
  }, 'Could not set primary account');
  const reorderAccounts = (ids: number[]) => guard(async () => {
    setAccounts((prev) => reorderBy(prev, ids));
    await accountsApi.reorder(ids);
  }, 'Could not reorder accounts');

  const changeCurrency = (code: string) => guard(async () => {
    setCurrency(code); setCurrencyState(code); await settingsApi.set('currency', code);
  }, 'Could not save currency');
  const changeInflation = (value: number) => guard(async () => {
    setInflation(value); await settingsApi.set('inflation_rate', value);
  }, 'Could not save inflation');
  const changeDebtExtra = (value: number) => guard(async () => {
    setDebtExtra(value); await settingsApi.set('debt_extra', value);
  }, 'Could not save extra payment');
  const changeDebtStrategy = (value: DebtStrategy) => guard(async () => {
    setDebtStrategy(value); await settingsApi.set('debt_strategy', value);
  }, 'Could not save strategy');

  const addGroup = (name: string, kind: GroupKind) => guard(async () => {
    const group = await groupsApi.create({ name, kind });
    setGroups((prev) => [...prev, group]);
  }, 'Could not create group');
  const renameGroup = (id: number, name: string) => guard(async () => {
    const group = await groupsApi.update(id, { name });
    setGroups((prev) => prev.map((g) => (g.id === id ? group : g)));
  }, 'Could not rename group');
  const deleteGroup = (id: number) => guard(async () => {
    await groupsApi.delete(id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setIncomeSources((prev) => prev.map((i) => (i.group_id === id ? { ...i, group_id: null } : i)));
    setExpenses((prev) => prev.map((e) => (e.group_id === id ? { ...e, group_id: null } : e)));
    setDebts((prev) => prev.map((d) => (d.group_id === id ? { ...d, group_id: null } : d)));
  }, 'Could not remove group');
  const reorderGroups = (ids: number[]) => guard(async () => {
    setGroups((prev) => reorderBy(prev, ids));
    await groupsApi.reorder(ids);
  }, 'Could not reorder groups');

  // Scenarios + backup
  const saveScenario = (name: string) => guard(async () => {
    const s = await scenariosApi.save(name);
    setScenarios((prev) => [s, ...prev]);
    toast.success(`Saved scenario "${name}"`);
  }, 'Could not save scenario');
  const restoreScenario = (id: number) => guard(async () => {
    await scenariosApi.restore(id);
    await load();
    toast.success('Scenario loaded');
  }, 'Could not load scenario');
  const deleteScenario = (id: number) => guard(async () => {
    await scenariosApi.delete(id);
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    if (compareId === id) setCompareId(null);
  }, 'Could not delete scenario');
  const onExport = () => guard(async () => {
    const res = await dataApi.export();
    const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'Export failed');
  const onImport = (file: File) => guard(async () => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    await dataApi.import(parsed.data ?? parsed);
    await load();
    toast.success('Backup imported');
  }, 'Import failed');

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--color-border)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Scenarios + export/import live inside the navigation drawer.
  const toolbar = (
    <Toolbar
      scenarios={scenarios}
      compareId={compareId}
      onSave={saveScenario}
      onRestore={restoreScenario}
      onDelete={deleteScenario}
      onCompareChange={setCompareId}
      onExport={onExport}
      onImport={onImport}
    />
  );

  return (
    <div style={{ minHeight: '100vh', padding: '0 0 60px' }}>
      <header style={{
        background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)',
        padding: '10px 84px 10px 24px', minHeight: 60, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--color-primary), var(--color-income))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📈</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Budget Forecaster</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Personal Finance Planner</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <HeaderControls
            totalCash={totalCash}
            currency={currency}
            onCurrencyChange={changeCurrency}
            inflation={inflation}
            onInflationChange={changeInflation}
          />
        </div>
        <div style={{ position: 'absolute', top: 12, right: 24 }}>
          <NavMenu
            tabs={TABS.map(([id, label]) => ({ id, label }))}
            current={tab}
            onSelect={(id) => setTab(id as Tab)}
            open={menuOpen}
            onOpenChange={setMenuOpen}
          >
            {toolbar}
          </NavMenu>
        </div>

        {error && (
          <div style={{ background: '#7f1d1d', border: '1px solid #991b1b', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#fca5a5', flexBasis: '100%' }}>
            ⚠ {error}
          </div>
        )}
        {!error && duplicates.length > 0 && !dupDismissed && (
          <div style={{ background: '#3b2f12', border: '1px solid #854d0e', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#fde68a', flexBasis: '100%', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>⚠ Possible double-counting — the name{duplicates.length > 1 ? 's' : ''} “{duplicates.join('”, “')}” appear in more than one of Expenses / Future Expenses / Debts.</span>
            <button onClick={() => setDupDismissed(true)} style={{ background: 'transparent', color: '#fde68a' }}>dismiss</button>
          </div>
        )}
        {!error && uncoveredAny && (
          <div style={{ background: '#7f1d1d', border: '1px solid #991b1b', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#fca5a5', flexBasis: '100%' }}>
            ⚠ Uncovered funding — {uncoveredThisMonth > 0.005 ? <><strong>{formatMoney(uncoveredThisMonth)}</strong> this month{uncoveredMonths > 1 ? ` (and ${uncoveredMonths - 1} more month${uncoveredMonths - 1 !== 1 ? 's' : ''})` : ''}</> : <><strong>{uncoveredMonths}</strong> month{uncoveredMonths !== 1 ? 's' : ''}</>} of card charges exceed available credit and aren't paid from anywhere. Lower the charge or assign another funding source.
          </div>
        )}
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {tab === 'forecast' && (
          <>
            <SummaryCards data={forecast} />
            <Suspense fallback={<ChartFallback />}>
              <ForecastChart data={visible(forecast)} startMonth={startMonth} months={months} onStartMonthChange={changeStartMonth} onMonthsChange={changeEndMonth} compareData={visibleCompare?.forecast} compareName={compareScenario?.name} />
            </Suspense>
          </>
        )}
        {tab === 'savings' && (() => {
          const selectedId = (savingsAccountId != null && accounts.some((a) => a.id === savingsAccountId)) ? savingsAccountId : null;
          const acct = selectedId != null ? accounts.find((a) => a.id === selectedId) : undefined;
          const fullData = selectedId != null
            ? buildAccountSavings(selectedId, accounts, incomeSources, payments, expensePlan.outByAccount, scheduledOutByAccount, debtOutByAccount, months)
            : savings;
          const data = visible(fullData);
          const currentBalance = selectedId != null ? (acct?.balance ?? 0) : totalCash;
          const startBal = startMonth > 0 ? (fullData[startMonth - 1]?.balance ?? currentBalance) : currentBalance;
          // Payoff markers only for debts paid from the selected account.
          const markers = selectedId == null ? payoffMarkers : (() => {
            const byM = new Map<number, string[]>();
            for (const d of debts) {
              const acctId = (d.account_id != null && accounts.some((a) => a.id === d.account_id)) ? d.account_id : primaryAccountId;
              if (acctId !== selectedId) continue;
              const mi = plan.payoffMonthByDebt.get(d.id);
              if (mi != null && mi < savings.length) { if (!byM.has(mi)) byM.set(mi, []); byM.get(mi)!.push(d.name); }
            }
            return [...byM].map(([mi, names]) => ({ label: savings[mi].label, name: names.join(', ') }));
          })();
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-muted)' }}>
                Showing
                <select
                  value={selectedId ?? ''}
                  onChange={(e) => setSavingsAccountId(e.target.value ? Number(e.target.value) : null)}
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', padding: '6px 10px', fontSize: 13, fontWeight: 600 }}
                >
                  <option value="">All accounts (total cash)</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.is_primary ? ' ★' : ''}</option>)}
                </select>
              </div>
              <SavingsSummary data={data} startingBalance={startBal} />
              <Suspense fallback={<ChartFallback />}>
                <SavingsChart data={data} startMonth={startMonth} months={months} onStartMonthChange={changeStartMonth} onMonthsChange={changeEndMonth} payoffMarkers={markers} compareData={selectedId == null ? visibleCompare?.savings : undefined} compareName={selectedId == null ? compareScenario?.name : undefined} />
              </Suspense>
            </>
          );
        })()}
        {tab === 'networth' && (
          <Suspense fallback={<ChartFallback />}>
            <NetWorthChart data={visible(netWorth)} startMonth={startMonth} months={months} onStartMonthChange={changeStartMonth} onMonthsChange={changeEndMonth} payoffMarkers={payoffMarkers} compareData={visibleCompare?.networth} compareName={compareScenario?.name} />
          </Suspense>
        )}
        {tab === 'overview' && (
          <Suspense fallback={<ChartFallback />}>
            <OverviewChart data={visible(overviewData)} startMonth={startMonth} months={months} onStartMonthChange={changeStartMonth} onMonthsChange={changeEndMonth} payoffMarkers={payoffMarkers} />
          </Suspense>
        )}
        {tab === 'account' && (() => {
          const entities = [
            ...accounts.map((a) => ({ id: a.id, name: a.name, kind: 'account' as const, isPrimary: !!a.is_primary })),
            ...debts.map((d) => ({ id: d.id, name: d.name, kind: 'debt' as const })),
          ];
          if (entities.length === 0) {
            return <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 24, color: 'var(--color-text-muted)' }}>Add an account or debt to see its activity.</div>;
          }
          const valid = (v: string) => {
            const [k, idS] = v.split(':'); const id = Number(idS);
            return (k === 'account' && accounts.some((a) => a.id === id)) || (k === 'debt' && debts.some((d) => d.id === id));
          };
          const primary = accounts.find((a) => a.is_primary) ?? accounts[0];
          const sel = activeEntity && valid(activeEntity)
            ? activeEntity
            : (primary ? `account:${primary.id}` : `debt:${debts[0].id}`);
          const [kind, idS] = sel.split(':');
          const id = Number(idS);
          const activityHorizon = activityMonth + 1;
          const activityExpensePlan = buildExpensePlan(expenses, accounts, debts, activityHorizon, inflation, new Date(), expensesPaidThisMonth);
          const activityCharges = [...buildDebtCharges(payments, activityHorizon), ...activityExpensePlan.charges];
          const activityPayments = buildDebtPaymentSchedule(debts, activityHorizon);
          const activityPlan = simulateDebtPlan(debts, debtStrategy === 'none' ? 0 : debtExtra, debtStrategy, activityHorizon, activityCharges, activityPayments);
          // "Paid this month" only applies when the activity is showing the current month.
          const activityPaid = activityMonth === 0 ? paidThisMonth : undefined;
          const shared = {
            entities, selected: sel, onSelect: setActiveEntity,
            month: activityMonth, onMonthChange: (value: number) => setActivityMonth(Math.max(0, Math.min(119, value))),
            paidIds: paidThisMonth,
          };
          if (kind === 'debt') {
            const debt = debts.find((d) => d.id === id)!;
            const activity = buildDebtActivity(debt, activityPlan, activityCharges, accounts, activityHorizon, new Date(), activityMonth);
            const sub = `${debt.apr}% APR${debt.credit_limit != null ? ` · ${formatMoney(debt.credit_limit, { whole: true })} limit` : ''}`;
            return (
              <Suspense fallback={<ChartFallback />}>
                <AccountActivity {...shared} entityKind="debt" balance={debt.balance} balanceSub={sub} activity={activity} paid={isPaidThisMonth(debt)} onTogglePaid={() => togglePaid(debt)} />
              </Suspense>
            );
          }
          const acct = accounts.find((a) => a.id === id)!;
          const activityExpensePaid = activityMonth === 0 ? expensesPaidThisMonth : undefined;
          const activity = buildAccountActivity(id, accounts, incomeSources, expenses, payments, debts, activityPlan, activityHorizon, inflation, new Date(), activityMonth, activityPaid, activityExpensePaid);
          return (
            <Suspense fallback={<ChartFallback />}>
              <AccountActivity {...shared} entityKind="account" balance={acct.balance} balanceSub={acct.is_primary ? '★ primary — pays the bills' : 'savings pile'} activity={activity} />
            </Suspense>
          );
        })()}
        {tab === 'breakdown' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, background: 'var(--color-bg)', padding: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', width: 'fit-content' }}>
                {([['range', 'Range'], ['month', 'Month']] as [BreakdownMode, string][]).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setBreakdownMode(id)}
                    style={{
                      background: breakdownMode === id ? 'var(--color-primary)' : 'transparent',
                      color: breakdownMode === id ? '#fff' : 'var(--color-text-muted)',
                      border: 'none', padding: '6px 16px', fontWeight: 600, fontSize: 13,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {breakdownMode === 'range' && (
                <div style={{ display: 'flex', gap: 6, background: 'var(--color-bg)', padding: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', width: 'fit-content' }}>
                  {([['account', 'Accounts'], ['income', 'Income'], ['expense', 'Expenses'], ['future', 'Future'], ['debt', 'Debts']] as [BreakdownSection, string][]).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setBreakdownSection(id)}
                      style={{
                        background: breakdownSection === id ? 'var(--color-surface-2)' : 'transparent',
                        color: breakdownSection === id ? 'var(--color-text)' : 'var(--color-text-muted)',
                        border: `1px solid ${breakdownSection === id ? 'var(--color-border)' : 'transparent'}`,
                        padding: '6px 16px', fontWeight: 600, fontSize: 13,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {breakdownMode === 'range' && breakdownSection === 'account' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-muted)', cursor: 'pointer', width: 'fit-content' }}>
                <input type="checkbox" checked={breakdownIncludeFuture} onChange={(e) => setBreakdownIncludeFuture(e.target.checked)} />
                Include future expenses
              </label>
            )}
            {breakdownMode === 'range' ? (
              <Suspense fallback={<ChartFallback />}>
                <BreakdownChart
                  title={breakdownTitle} subtitle={breakdownSubtitle} breakdown={visibleBreakdown}
                  startMonth={startMonth} months={months} onStartMonthChange={changeStartMonth} onMonthsChange={changeEndMonth}
                  futureBars={breakdownSection === 'account' ? visible(futureExpenseBars) : undefined}
                  futureBarsActive={breakdownIncludeFuture}
                  debtMonthInfo={breakdownSection === 'debt' ? visibleDebtMonthInfo : undefined}
                  creditLimits={breakdownSection === 'debt'
                    ? new Map(debts.filter((d) => d.debt_type !== 'loan' && d.credit_limit != null).map((d) => [d.id, d.credit_limit as number]))
                    : undefined}
                  paidIds={breakdownSection === 'debt' ? paidThisMonth : undefined}
                />
              </Suspense>
            ) : (
              <Suspense fallback={<ChartFallback />}>
                <MonthlyBreakdown breakdown={monthlyBreakdown} month={breakdownMonth} onMonthChange={setBreakdownMonth} initialView="daily" />
              </Suspense>
            )}
          </>
        )}
        {tab === 'outflows' && (
          <Suspense fallback={<ChartFallback />}>
            <AccountOutflows
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, is_primary: a.is_primary }))}
              labels={visible(savings.map((s) => s.label))}
              expenseOut={visibleMap(expensePlan.outByAccount)}
              scheduledOut={visibleMap(scheduledOutByAccount)}
              debtOut={visibleMap(debtOutByAccount)}
              startMonth={startMonth}
              months={months}
              onStartMonthChange={changeStartMonth}
              onMonthsChange={changeEndMonth}
            />
          </Suspense>
        )}
        {tab === 'transactions' && (
          <Suspense fallback={<ChartFallback />}>
            <Transactions />
          </Suspense>
        )}

        {/* Budget data & editors — shown on every tab except the standalone Transactions page. */}
        {tab !== 'transactions' && <>
        {/* This month's money out */}
        {m0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '12px 18px', fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>This month out</span>
            <span>Expenses <strong style={{ color: 'var(--color-expense)' }}>{formatMoney(m0.expenses, { whole: true })}</strong></span>
            <span>Future <strong style={{ color: 'var(--color-net-neg)' }}>{formatMoney(m0.scheduledOut, { whole: true })}</strong></span>
            <span>Debt <strong style={{ color: 'var(--color-net-neg)' }}>{formatMoney(m0.debtOut, { whole: true })}</strong></span>
            <span style={{ marginLeft: 'auto' }}>Total out <strong>{formatMoney(moneyOut, { whole: true })}</strong> · Net <strong style={{ color: m0.net >= 0 ? 'var(--color-income)' : 'var(--color-expense)' }}>{formatMoney(m0.net, { whole: true })}</strong></span>
          </div>
        )}

        {/* Shared data — drives all views, always editable */}
        <Accounts
          accounts={accounts}
          onAdd={addAccount} onUpdate={updateAccount} onDelete={deleteAccount}
          onMakePrimary={makePrimary} onReorder={reorderAccounts}
        />
        <PlaidConnect onImported={load} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 20 }}>
          <LineItemTable
            title="Income Sources" description="Money coming in, by pay frequency"
            items={incomeSources} accentColor="var(--color-income)" totalLabel="Total Per Payment"
            kind="income" groups={groups} showFrequency showAccount
            accounts={accounts.map((a) => ({ id: a.id, name: a.name, is_primary: a.is_primary }))}
            onAdd={addIncome} onUpdate={updateIncome} onDelete={deleteIncome}
            onAddGroup={(name) => addGroup(name, 'income')} onRenameGroup={renameGroup} onDeleteGroup={deleteGroup}
            onReorder={reorderIncome} onReorderGroup={reorderGroups}
          />
          <LineItemTable
            title="Expenses" description="Ongoing costs by frequency — split across cash & credit via Edit"
            items={expenses} accentColor="var(--color-expense)" totalLabel="Total Per Payment"
            kind="expense" groups={groups} showFrequency showFunding
            isPaidThisMonth={(item) => isExpensePaidThisMonth(item as Expense)}
            onTogglePaid={(item) => toggleExpensePaid(item as Expense)}
            accounts={accounts.map((a) => ({ id: a.id, name: a.name, is_primary: a.is_primary }))}
            debts={debts.filter((d) => d.debt_type === 'credit_card').map((d) => ({ id: d.id, name: d.name, available: d.credit_limit != null ? Math.max(0, d.credit_limit - d.balance) : null, overLimit: d.credit_limit != null && d.balance > d.credit_limit + 0.005 }))}
            onAdd={addExpense} onUpdate={updateExpense} onDelete={deleteExpense}
            onAddGroup={(name) => addGroup(name, 'expense')} onRenameGroup={renameGroup} onDeleteGroup={deleteGroup}
            onReorder={reorderExpenses} onReorderGroup={reorderGroups}
          />
        </div>
        <ScheduledPayments
          payments={payments}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, is_primary: a.is_primary }))}
          debts={debts.filter((d) => d.debt_type === 'credit_card').map((d) => ({ id: d.id, name: d.name, group_id: d.group_id, available: d.credit_limit != null ? Math.max(0, d.credit_limit - d.balance) : null, overLimit: d.credit_limit != null && d.balance > d.credit_limit + 0.005 }))}
          onAdd={addPayment} onUpdate={updatePayment} onDelete={deletePayment}
        />
        <Debts
          debts={debts} groups={groups}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, is_primary: a.is_primary }))}
          onAdd={addDebt} onUpdate={updateDebt} onDelete={deleteDebt}
          onAddGroup={(name) => addGroup(name, 'debt')} onRenameGroup={renameGroup} onDeleteGroup={deleteGroup}
          onReorder={reorderDebts} onReorderGroup={reorderGroups}
          plan={plan} basePlan={basePlan} extra={debtExtra} strategy={debtStrategy}
          onExtraChange={changeDebtExtra} onStrategyChange={changeDebtStrategy}
          isPaidThisMonth={isPaidThisMonth} onTogglePaid={togglePaid}
        />
        </>}
      </main>
    </div>
  );
}
