import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import type { Account, Bucket, BudgetCategory, Debt, Expense, Goal, GroupKind, IncomeSource, ItemFormData, LineItemGroup, PaidStatus } from './types';
import {
  accountsApi, bucketsApi, dataApi, debtsApi, expensesApi, goalsApi, groupsApi, incomeApi, paidApi, scenariosApi, settingsApi,
  type BucketInput, type Scenario,
} from './api/client';
import { buildForecast, buildSavings, buildNetWorth, buildExpensePlan, buildDebtPaymentSchedule, buildIncomeBreakdown, buildExpenseBreakdown, buildAccountSeries, buildDebtOutByAccount, buildAccountActivity, buildDebtActivity, buildAccountSavings, type Breakdown } from './lib/forecast';
import { buildMonthBreakdown } from './lib/monthlyBreakdown';
import { pickStored, resolveTab } from './lib/viewPrefs';
import { simulateDebtPlan, debtPaidDefault, type DebtStrategy } from './lib/debt';
import { setCurrency, formatMoney } from './lib/format';
import { useToast } from './components/Toast';
import SummaryCards from './components/SummaryCards';
import LineItemTable from './components/LineItemTable';
import SavingsSummary from './components/SavingsSummary';
import Debts from './components/Debts';
import Accounts from './components/Accounts';
import AccountSettings from './components/AccountSettings';
import Goals, { type GoalInput } from './components/Goals';
import { BucketsPanel, BudgetsPanel } from './components/Budgets';
import { buildBucketPlan } from './lib/buckets';
import AppShell from './components/AppShell';
import { DEFAULT_HOME_LAYOUT, resolveHomeLayout, type HomeLayout } from './lib/homeLayout';
import {
  BREAKDOWN_MODES, BREAKDOWN_VIEWS, NAV, PAGE_META, PROJECTION_VIEWS, PROJECTION_IDS, TAB_IDS,
  type BreakdownMode, type ProjectionView, type Tab,
} from './lib/nav';
import Home from './components/Home';
import { Banner, Panel, Segmented } from './ui';
import Toolbar from './components/Toolbar';
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

const BREAKDOWN_SECTIONS: BreakdownSection[] = ['account', 'income', 'expense', 'debt'];
type BreakdownSection = 'account' | 'income' | 'expense' | 'debt';

function reorderBy<T extends { id: number }>(arr: T[], ids: number[]): T[] {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return [...arr].sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

interface Snapshot {
  income_sources?: IncomeSource[];
  expenses?: Expense[];
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
  const debts = snap.debts ?? [];
  const accts = snap.accounts ?? [];
  const ep = buildExpensePlan(exp, accts, months, infl);
  const plan = simulateDebtPlan(debts, strat === 'none' ? 0 : extra, strat, months, ep.charges, buildDebtPaymentSchedule(debts, months));
  const cashOut = plan.outflow.map((v) => Math.round(v * 100) / 100);
  const fc = buildForecast(inc, ep.ongoingCashOut, cashOut, months);
  const sv = buildSavings(inc, ep.ongoingCashOut, cashOut, months, start);
  const nw = buildNetWorth(sv, plan.remaining);
  return { forecast: fc.map((p) => p.net), savings: sv.map((p) => p.balance), networth: nw.map((p) => p.netWorth) };
}

// One-time move of the old browser-only "paid this month" flags (localStorage
// bf.debtPaid / bf.expensePaid, values "YYYY-MM:1|0") to the server. Only the
// current month matters; anything already saved on the server wins.
async function migrateLocalPaidFlags(status: PaidStatus): Promise<PaidStatus> {
  let next = status;
  for (const [key, type, list] of [['bf.debtPaid', 'debt', status.debts], ['bf.expensePaid', 'expense', status.expenses]] as const) {
    let flags: Record<string, string>;
    try { flags = JSON.parse(localStorage.getItem(key) || '{}'); } catch { flags = {}; }
    for (const [id, value] of Object.entries(flags)) {
      if (!value.startsWith(`${status.month}:`) || list.some((entry) => entry.id === Number(id) && entry.source === 'manual')) continue;
      try { next = await paidApi.set(type, Number(id), value.endsWith(':1')); } catch { /* entity deleted; drop the flag */ }
    }
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
  return next;
}

function ChartFallback() {
  return (
    <div className="grid h-[420px] place-items-center rounded-card border border-border bg-surface text-[13px] text-muted">
      Loading chart…
    </div>
  );
}

export default function App() {
  const toast = useToast();
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [groups, setGroups] = useState<LineItemGroup[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [currency, setCurrencyState] = useState('USD');
  const [inflation, setInflation] = useState(0);
  const [debtExtra, setDebtExtra] = useState(0);
  const [debtStrategy, setDebtStrategy] = useState<DebtStrategy>('none');
  const [homeLayout, setHomeLayout] = useState<HomeLayout>(DEFAULT_HOME_LAYOUT);
  const [months, setMonths] = useState(() => Number(localStorage.getItem('bf.months')) || 12);
  const [startMonth, setStartMonth] = useState(() => Number(localStorage.getItem('bf.startMonth')) || 0);
  // Stored ids come from whatever build the user last ran, so they're resolved
  // against the ids that exist now; a retired tab maps forward where it can.
  const [storedTab] = useState(() => resolveTab(localStorage.getItem('bf.tab'), TAB_IDS, 'home'));
  const [tab, setTab] = useState<Tab>(storedTab.tab as Tab);
  const [projectionView, setProjectionView] = useState<ProjectionView>(() =>
    (storedTab.tab === 'projections' && storedTab.view as ProjectionView)
      || pickStored(localStorage.getItem('bf.projection'), PROJECTION_IDS, 'cashflow'));
  const [compareId, setCompareId] = useState<number | null>(null);
  const [breakdownSection, setBreakdownSection] = useState<BreakdownSection>(
    () => pickStored(localStorage.getItem('bf.breakdown'), BREAKDOWN_SECTIONS, 'debt'),
  );
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>(() =>
    (storedTab.tab === 'breakdown' && storedTab.view as BreakdownMode)
      || pickStored(localStorage.getItem('bf.breakdownMode'), BREAKDOWN_MODES, 'range'));
  const [breakdownMonth, setBreakdownMonth] = useState(() => Number(localStorage.getItem('bf.breakdownMonth')) || 0);
  const [activeEntity, setActiveEntity] = useState<string>(''); // 'account:id' | 'debt:id' for Breakdown › One account
  const [activityMonth, setActivityMonth] = useState(() => Number(localStorage.getItem('bf.activityMonth')) || 0);
  const [savingsAccountId, setSavingsAccountId] = useState<number | null>(null); // null = all accounts
  // "Paid this month" for debts and expenses: manual overrides + Plaid detection, from the server.
  const [paidStatus, setPaidStatus] = useState<PaidStatus | null>(null);
  const [dupDismissed, setDupDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem('bf.months', String(months)); }, [months]);
  useEffect(() => { localStorage.setItem('bf.startMonth', String(startMonth)); }, [startMonth]);
  useEffect(() => { localStorage.setItem('bf.tab', tab); }, [tab]);
  useEffect(() => { localStorage.setItem('bf.projection', projectionView); }, [projectionView]);
  useEffect(() => { localStorage.setItem('bf.breakdown', breakdownSection); }, [breakdownSection]);
  useEffect(() => { localStorage.setItem('bf.breakdownMode', breakdownMode); }, [breakdownMode]);
  useEffect(() => { localStorage.setItem('bf.breakdownMonth', String(breakdownMonth)); }, [breakdownMonth]);
  useEffect(() => { localStorage.setItem('bf.activityMonth', String(activityMonth)); }, [activityMonth]);
  useEffect(() => { if (startMonth >= months) setStartMonth(Math.max(0, months - 1)); }, [startMonth, months]);

  const changeStartMonth = (value: number) => setStartMonth(Math.max(0, Math.min(value, months - 1)));
  const changeEndMonth = (value: number) => setMonths(Math.max(startMonth + 1, Math.min(120, value)));

  const load = useCallback(async () => {
    try {
      const [inc, exp, dbts, accts, grps, scen, settings, paid, gls, bkts, cats] = await Promise.all([
        incomeApi.getAll(), expensesApi.getAll(),
        debtsApi.getAll(), accountsApi.getAll(), groupsApi.getAll(), scenariosApi.getAll(), settingsApi.getAll(),
        paidApi.get(), goalsApi.getAll(), bucketsApi.getAll(),
        // Only a picker's suggestions; the app works without them.
        expensesApi.budgetCategories().catch(() => [] as BudgetCategory[]),
      ]);
      setIncomeSources(inc); setExpenses(exp); setDebts(dbts);
      setAccounts(accts); setGroups(grps); setScenarios(scen); setGoals(gls);
      setBuckets(bkts); setBudgetCategories(cats);
      setPaidStatus(await migrateLocalPaidFlags(paid));
      setInflation(parseFloat(settings.inflation_rate ?? '0') || 0);
      setDebtExtra(parseFloat(settings.debt_extra ?? '0') || 0);
      setDebtStrategy((settings.debt_strategy as DebtStrategy) || 'none');
      setHomeLayout(resolveHomeLayout(settings.home_layout));
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
  // Ignore a status fetched in a previous month (app left open across month end).
  const currentPaid = paidStatus?.month === monthKey ? paidStatus : null;
  const debtPaidEntry = (d: Debt) => currentPaid?.debts.find((entry) => entry.id === d.id);
  const isExpensePaidThisMonth = (e: Expense): boolean => !!currentPaid?.expenses.find((entry) => entry.id === e.id)?.paid;
  const toggleExpensePaid = (e: Expense) => guard(async () => {
    setPaidStatus(await paidApi.set('expense', e.id, !isExpensePaidThisMonth(e)));
  }, 'Could not update paid status');
  const expensesPaidThisMonth = new Set(expenses.filter(isExpensePaidThisMonth).map((e) => e.id));
  const expensePlan = buildExpensePlan(expenses, accounts, months, inflation, new Date(), expensesPaidThisMonth);
  // Expense card-portions bill the debt over time.
  const debtCharges = expensePlan.charges;
  // Any active debt funding-plan amount overrides its monthly payment per month.
  const debtPayments = buildDebtPaymentSchedule(debts, months);
  // "Paid this month": manual override, then Plaid detection (both from the server), else the autopay-day default.
  const isPaidThisMonth = (d: Debt): boolean => debtPaidEntry(d)?.paid ?? debtPaidDefault(d);
  const paidDetailOf = (d: Debt): string | null => {
    const entry = debtPaidEntry(d);
    if (entry?.source === 'detected') return entry.detail;
    if (entry?.source === 'manual') return 'Set manually';
    return d.payment_day != null ? `Default from autopay day ${d.payment_day}` : null;
  };
  const togglePaid = (d: Debt) => guard(async () => {
    setPaidStatus(await paidApi.set('debt', d.id, !isPaidThisMonth(d)));
  }, 'Could not update paid status');
  const paidThisMonth = new Set(debts.filter(isPaidThisMonth).map((d) => d.id));
  const plan = simulateDebtPlan(debts, debtStrategy === 'none' ? 0 : debtExtra, debtStrategy, months, debtCharges, debtPayments, paidThisMonth);
  const basePlan = simulateDebtPlan(debts, 0, 'none', months, debtCharges, debtPayments, paidThisMonth);
  // Cash out for debts = the actual payments. Charges aimed at a loan/unknown
  // target are not paid from cash; valid cards accept charges even over limit.
  const debtCashOut = plan.outflow.map((v) => Math.round(v * 100) / 100);
  const forecast = buildForecast(incomeSources, expensePlan.ongoingCashOut, debtCashOut, months);
  const savings = buildSavings(incomeSources, expensePlan.ongoingCashOut, debtCashOut, months, totalCash);
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
  const debtOutByAccount = buildDebtOutByAccount(debts, plan, accounts);
  // Uncovered funding (the over-limit card excess) is not paid from any account, so
  // nothing is attributed here — it shows up as a flag, not as cash leaving.

  // Combined overview series: monthly flows and balances.
  const overviewData = savings.map((s, i) => ({
    label: s.label,
    income: s.income,
    expenses: s.expenses,
    cash: s.balance,
    debt: plan.remaining[i] ?? 0,
  }));

  // Per-item breakdown for the selected section.
  // Per-account balances drive Home's runway warning, so build them always.
  const accountSeries = buildAccountSeries(accounts, incomeSources, savings, expensePlan.outByAccount, debtOutByAccount);

  // Buckets sit on top of the per-account projection: they never move cash,
  // they only say how much of each account is spoken for.
  const bucketPlan = buildBucketPlan(buckets, accounts, accountSeries, months);

  // What a goal is measured against: today's balances for where it stands, and
  // the projections for when the plan gets there.
  const goalInputs = {
    buckets,
    bucketSeries: bucketPlan.series,
    accountSeries,
    netWorth,
    remainingByDebt: plan.remainingByDebt,
    debtRemaining: plan.remaining,
    accounts,
    debts,
    totalCash,
  };

  let breakdown: Breakdown;
  let breakdownTitle: string;
  let breakdownSubtitle: string;
  if (breakdownSection === 'account') {
    breakdown = accountSeries;
    breakdownTitle = 'Accounts Over Time';
    breakdownSubtitle = 'Balance of each account/savings pile over time, alongside total cash';
  } else if (breakdownSection === 'income') {
    breakdown = buildIncomeBreakdown(incomeSources, months);
    breakdownTitle = 'Income Breakdown';
    breakdownSubtitle = 'Each income source per month, alongside the combined total';
  } else if (breakdownSection === 'expense') {
    breakdown = buildExpenseBreakdown(expenses, months, inflation, new Date(), expensesPaidThisMonth);
    breakdownTitle = 'Expense Breakdown';
    breakdownSubtitle = 'Each expense per month (inflation-adjusted), alongside the combined total';
  } else {
    breakdown = {
      labels: savings.map((s) => s.label),
      total: plan.remaining,
      series: debts.map((d) => ({ id: d.id, name: d.name, values: plan.remainingByDebt.get(d.id) ?? [] })),
    };
    breakdownTitle = 'Debt Breakdown';
    breakdownSubtitle = 'Remaining balance of each debt over time, alongside total debt';
  }

  // Per-debt, per-month detail for the Debt Breakdown tooltip: which expenses
  // were charged that month, and the payment applied.
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
        arr[c.monthIndex].charges.push({ label: c.label ?? 'Charge', amount: c.amount, kind: c.kind ?? 'expense' });
      }
    }
  }

  // Debt Breakdown legend: bucket the chips into dropdowns by line-item group,
  // in group order, with any ungrouped debts last. Empty groups are omitted.
  const debtChipGroups = groups
    .filter((g) => g.kind === 'debt')
    .map((g) => ({ id: `g${g.id}`, name: g.name, seriesIds: debts.filter((d) => d.group_id === g.id).map((d) => d.id) }))
    .filter((grp) => grp.seriesIds.length > 0);
  const ungroupedDebtIds = debts.filter((d) => d.group_id == null).map((d) => d.id);
  if (ungroupedDebtIds.length) debtChipGroups.push({ id: 'ungrouped', name: 'Ungrouped', seriesIds: ungroupedDebtIds });

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
  const thisMonth = buildMonthBreakdown(
    incomeSources, expenses, debts, accounts, 0, new Date(), paidThisMonth, expensesPaidThisMonth,
  );
  // Home's "next 30 days" list crosses the month boundary.
  const nextMonth = buildMonthBreakdown(incomeSources, expenses, debts, accounts, 1, new Date());
  let monthlyBreakdown = thisMonth;
  for (let monthIndex = 1; monthIndex <= breakdownMonth; monthIndex++) {
    const priorEndingLiquidity = new Map(monthlyBreakdown.liquidity
      .filter((series) => series.kind === 'account' || series.kind === 'card')
      .map((series) => [series.key, series.values[series.values.length - 1] ?? 0]));
    monthlyBreakdown = buildMonthBreakdown(
      incomeSources, expenses, debts, accounts, monthIndex, new Date(), undefined, undefined, priorEndingLiquidity,
    );
  }


  // Uncovered funding: charges aimed at a loan or missing debt target aren't paid
  // from anywhere. Valid cards accept the full charge and surface over-limit state.
  const uncoveredThisMonth = plan.chargeOverflow[0] ?? 0;
  const uncoveredMonths = plan.chargeOverflow.filter((v) => v > 0.005).length;
  const uncoveredAny = uncoveredMonths > 0;

  // Duplicate-name detection across expense-like things.
  const nameCounts = new Map<string, number>();
  for (const x of [...expenses, ...debts]) {
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
  const updateIncomeOccurrence = async (income: IncomeSource, scheduledDate: string, occurrenceDate: string, status: 'expected' | 'received' | 'skipped') => {
    await guard(async () => {
      const item = await incomeApi.updateOccurrence(income.id, scheduledDate, { occurrence_date: occurrenceDate, status });
      setIncomeSources((prev) => prev.map((candidate) => candidate.id === item.id ? item : candidate));
    }, 'Could not update income payment');
  };
  const resetIncomeOccurrence = async (income: IncomeSource, scheduledDate: string) => {
    await guard(async () => {
      const item = await incomeApi.resetOccurrence(income.id, scheduledDate);
      setIncomeSources((prev) => prev.map((candidate) => candidate.id === item.id ? item : candidate));
    }, 'Could not reset income payment');
  };
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
      frequency: data.frequency ?? 'monthly', start_date: data.start_date ?? null, end_date: data.end_date ?? null,
      group_id: data.group_id ?? null, funding_allocations: data.funding_allocations ?? [], funding_rules: data.funding_rules ?? [],
    });
    setExpenses((prev) => [...prev, item]);
  }, 'Could not add expense');
  const updateExpense = (id: number, data: ItemFormData) => guard(async () => {
    const item = await expensesApi.update(id, data);
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
    const [accts, inc, bkts] = await Promise.all([accountsApi.getAll(), incomeApi.getAll(), bucketsApi.getAll()]);
    // Income and buckets in that account fall back to the primary.
    setAccounts(accts); setIncomeSources(inc); setBuckets(bkts);
  }, 'Could not delete account');
  const makePrimary = (id: number) => guard(async () => {
    await accountsApi.update(id, { is_primary: 1 });
    setAccounts(await accountsApi.getAll());
  }, 'Could not set primary account');
  const reorderAccounts = (ids: number[]) => guard(async () => {
    setAccounts((prev) => reorderBy(prev, ids));
    await accountsApi.reorder(ids);
  }, 'Could not reorder accounts');

  const addGoal = (data: GoalInput) => guard(async () => {
    const goal = await goalsApi.create(data);
    setGoals((prev) => [...prev, goal]);
  }, 'Could not create goal');
  const updateGoal = (id: number, data: GoalInput) => guard(async () => {
    const goal = await goalsApi.update(id, data);
    setGoals((prev) => prev.map((g) => (g.id === id ? goal : g)));
  }, 'Could not update goal');
  const deleteGoal = (id: number) => guard(async () => {
    await goalsApi.delete(id);
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, 'Could not delete goal');
  const reorderGoals = (ids: number[]) => guard(async () => {
    setGoals((prev) => reorderBy(prev, ids));
    await goalsApi.reorder(ids);
  }, 'Could not reorder goals');

  const addBucket = (data: BucketInput) => guard(async () => {
    const bucket = await bucketsApi.create(data);
    setBuckets((prev) => [...prev, bucket]);
  }, 'Could not add bucket');
  const updateBucket = (id: number, data: BucketInput) => guard(async () => {
    const bucket = await bucketsApi.update(id, data);
    setBuckets((prev) => prev.map((b) => (b.id === id ? bucket : b)));
  }, 'Could not update bucket');
  const deleteBucket = (id: number) => guard(async () => {
    await bucketsApi.delete(id);
    setBuckets((prev) => prev.filter((b) => b.id !== id));
  }, 'Could not delete bucket');
  const reorderBuckets = (ids: number[]) => guard(async () => {
    setBuckets((prev) => reorderBy(prev, ids));
    await bucketsApi.reorder(ids);
  }, 'Could not reorder buckets');

  // A budget is an expense; these only add the budget fields.
  const addBudget = (data: ItemFormData) => guard(async () => {
    const item = await expensesApi.create({
      name: data.name, monthly_amount: data.monthly_amount, frequency: 'monthly',
      start_date: data.start_date ?? null, end_date: data.end_date ?? null, group_id: data.group_id ?? null,
      funding_allocations: data.funding_allocations ?? [], funding_rules: data.funding_rules ?? [],
      is_budget: 1, budget_categories: data.budget_categories ?? [],
    });
    setExpenses((prev) => [...prev, item]);
  }, 'Could not add budget');

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
  const changeHomeLayout = (value: HomeLayout) => guard(async () => {
    setHomeLayout(value); await settingsApi.set('home_layout', value);
  }, 'Could not save home layout');

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
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin-slow rounded-full border-[3px] border-border border-t-primary" />
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  // Scenarios + export/import are managed on the Account page. Projections
  // gets the compare picker on its own, since that's a viewing choice rather
  // than a management one.
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

  const banners = (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      {!error && duplicates.length > 0 && !dupDismissed && (
        <Banner onDismiss={() => setDupDismissed(true)}>
          Possible double-counting — the name{duplicates.length > 1 ? 's' : ''} “{duplicates.join('”, “')}”
          {' '}appear in both Expenses and Debts.
        </Banner>
      )}
      {!error && bucketPlan.shortfalls.map((short) => {
        const account = accounts.find((a) => a.id === short.accountId);
        return (
          <Banner key={short.accountId} tone="danger">
            {account?.name ?? 'An account'} can't cover its buckets{' '}
            {short.monthIndex < 0 ? 'today' : <>from <strong>{savings[short.monthIndex]?.label}</strong></>}
            {' '}— it's <strong>{formatMoney(short.shortBy, { whole: true })}</strong> short. The plan is setting aside money it doesn't have.
          </Banner>
        );
      })}
      {!error && uncoveredAny && (
        <Banner tone="danger">
          Invalid funding target — {uncoveredThisMonth > 0.005
            ? <><strong>{formatMoney(uncoveredThisMonth)}</strong> this month{uncoveredMonths > 1 ? ` (and ${uncoveredMonths - 1} more month${uncoveredMonths - 1 !== 1 ? 's' : ''})` : ''}</>
            : <><strong>{uncoveredMonths}</strong> month{uncoveredMonths !== 1 ? 's' : ''}</>}
          {' '}of charges point to a loan or missing debt and aren't funded. Assign a valid account or credit card.
        </Banner>
      )}
    </>
  );

  const page = PAGE_META[tab] ?? PAGE_META.home;

  return (
    <AppShell
      groups={NAV}
      current={tab}
      onSelect={(id) => setTab(id as Tab)}
      title={page.title}
      subtitle={page.subtitle}
      banners={banners}
      onGoToAccount={() => setTab('settings')}
      actions={
        <div
          title="Total across all accounts — edit balances under Plan › Accounts"
          className="flex items-center gap-2 rounded-control border border-border bg-bg px-2.5 py-1"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Total Cash</span>
          <span className="text-[15px] font-bold tabular-nums text-primary">
            {formatMoney(totalCash, { whole: true })}
          </span>
        </div>
      }
    >
        {tab === 'home' && (
          <Home
            layout={homeLayout}
            onLayoutChange={changeHomeLayout}
            totalCash={totalCash}
            netWorth={netWorth}
            accountSeries={accountSeries}
            accounts={accounts}
            debts={debts}
            debtPlan={plan}
            goals={goals}
            goalInputs={goalInputs}
            onGoToGoals={() => setTab('goals')}
            monthBreakdowns={[thisMonth, nextMonth]}
            onGoToPlan={() => setTab('expenses')}
            onGoToProjections={() => setTab('projections')}
            onGoToAccounts={() => setTab('accounts')}
            onGoToDebts={() => setTab('debts')}
          />
        )}

        {tab === 'goals' && (
          <Goals
            goals={goals}
            accounts={accounts}
            debts={debts}
            buckets={buckets}
            inputs={goalInputs}
            onAdd={addGoal}
            onUpdate={updateGoal}
            onDelete={deleteGoal}
            onReorder={reorderGoals}
          />
        )}

        {tab === 'settings' && (
          <AccountSettings
            currency={currency}
            onCurrencyChange={changeCurrency}
            inflation={inflation}
            onInflationChange={changeInflation}
            homeLayout={homeLayout}
            onHomeLayoutChange={changeHomeLayout}
            dataTools={toolbar}
            onPlaidImported={load}
          />
        )}

        {tab === 'projections' && (
          <Segmented
            ariaLabel="Projection"
            options={PROJECTION_VIEWS.map(([id, label]) => ({ id, label }))}
            value={projectionView}
            onChange={setProjectionView}
          />
        )}

        {tab === 'projections' && projectionView === 'cashflow' && (
          <>
            <SummaryCards data={forecast} />
            <Suspense fallback={<ChartFallback />}>
              <ForecastChart data={visible(forecast)} startMonth={startMonth} months={months} onStartMonthChange={changeStartMonth} onMonthsChange={changeEndMonth} compareData={visibleCompare?.forecast} compareName={compareScenario?.name} />
            </Suspense>
          </>
        )}
        {tab === 'projections' && projectionView === 'savings' && (() => {
          const selectedId = (savingsAccountId != null && accounts.some((a) => a.id === savingsAccountId)) ? savingsAccountId : null;
          const acct = selectedId != null ? accounts.find((a) => a.id === selectedId) : undefined;
          const fullData = selectedId != null
            ? buildAccountSavings(selectedId, accounts, incomeSources, expensePlan.outByAccount, debtOutByAccount, months)
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
              <div className="flex items-center gap-2 text-[13px] text-muted">
                Showing
                <select
                  value={selectedId ?? ''}
                  onChange={(e) => setSavingsAccountId(e.target.value ? Number(e.target.value) : null)}
                  className="font-semibold"
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
        {tab === 'projections' && projectionView === 'networth' && (
          <Suspense fallback={<ChartFallback />}>
            <NetWorthChart data={visible(netWorth)} startMonth={startMonth} months={months} onStartMonthChange={changeStartMonth} onMonthsChange={changeEndMonth} payoffMarkers={payoffMarkers} compareData={visibleCompare?.networth} compareName={compareScenario?.name} />
          </Suspense>
        )}
        {tab === 'projections' && projectionView === 'overview' && (
          <Suspense fallback={<ChartFallback />}>
            <OverviewChart data={visible(overviewData)} startMonth={startMonth} months={months} onStartMonthChange={changeStartMonth} onMonthsChange={changeEndMonth} payoffMarkers={payoffMarkers} />
          </Suspense>
        )}
        {tab === 'breakdown' && breakdownMode === 'account' && (() => {
          const entities = [
            ...accounts.map((a) => ({ id: a.id, name: a.name, kind: 'account' as const, isPrimary: !!a.is_primary })),
            ...debts.map((d) => ({ id: d.id, name: d.name, kind: 'debt' as const })),
          ];
          if (entities.length === 0) {
            return <Panel className="p-6 text-muted">Add an account or debt to see its activity.</Panel>;
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
          const activityExpensePlan = buildExpensePlan(expenses, accounts, activityHorizon, inflation, new Date(), expensesPaidThisMonth);
          const activityCharges = activityExpensePlan.charges;
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
          const activity = buildAccountActivity(id, accounts, incomeSources, expenses, debts, activityPlan, activityHorizon, inflation, new Date(), activityMonth, activityPaid, activityExpensePaid);
          return (
            <Suspense fallback={<ChartFallback />}>
              <AccountActivity {...shared} entityKind="account" balance={acct.balance} balanceSub={acct.is_primary ? 'Primary — pays the bills' : 'Savings pile'} activity={activity} />
            </Suspense>
          );
        })()}
        {tab === 'breakdown' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <Segmented
                ariaLabel="Breakdown mode"
                options={BREAKDOWN_VIEWS.map(([id, label]) => ({ id, label }))}
                value={breakdownMode}
                onChange={setBreakdownMode}
              />
              {breakdownMode === 'range' && (
                <Segmented
                  ariaLabel="Breakdown section"
                  options={[
                    { id: 'account', label: 'Accounts' },
                    { id: 'income', label: 'Income' },
                    { id: 'expense', label: 'Expenses' },
                    { id: 'debt', label: 'Debts' },
                  ]}
                  value={breakdownSection}
                  onChange={setBreakdownSection}
                />
              )}
            </div>
            {breakdownMode === 'range' && (
              <Suspense fallback={<ChartFallback />}>
                <BreakdownChart
                  title={breakdownTitle} subtitle={breakdownSubtitle} breakdown={visibleBreakdown}
                  startMonth={startMonth} months={months} onStartMonthChange={changeStartMonth} onMonthsChange={changeEndMonth}
                  debtMonthInfo={breakdownSection === 'debt' ? visibleDebtMonthInfo : undefined}
                  creditLimits={breakdownSection === 'debt'
                    ? new Map(debts.filter((d) => d.debt_type !== 'loan' && d.credit_limit != null).map((d) => [d.id, d.credit_limit as number]))
                    : undefined}
                  paidIds={breakdownSection === 'debt' ? paidThisMonth : undefined}
                  chipGroups={breakdownSection === 'debt' ? debtChipGroups : undefined}
                />
              </Suspense>
            )}
            {breakdownMode === 'month' && (
              <Suspense fallback={<ChartFallback />}>
                <MonthlyBreakdown breakdown={monthlyBreakdown} month={breakdownMonth} onMonthChange={setBreakdownMonth} initialView="daily" />
              </Suspense>
            )}
          </>
        )}
        {tab === 'breakdown' && breakdownMode === 'outflows' && (
          <Suspense fallback={<ChartFallback />}>
            <AccountOutflows
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, is_primary: a.is_primary }))}
              labels={visible(savings.map((s) => s.label))}
              expenseOut={visibleMap(expensePlan.outByAccount)}
              debtOut={visibleMap(debtOutByAccount)}
              startMonth={startMonth}
              months={months}
              onStartMonthChange={changeStartMonth}
              onMonthsChange={changeEndMonth}
            />
          </Suspense>
        )}
        {tab === 'projections' && scenarios.length > 0 && (
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Compare against
            <select
              value={compareId ?? ''}
              onChange={(e) => setCompareId(e.target.value ? Number(e.target.value) : null)}
              className="font-semibold"
            >
              <option value="">Nothing</option>
              {scenarios.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
            </select>
            <span className="text-[12px] text-faint">Saved scenarios live under Account.</span>
          </label>
        )}

        {tab === 'transactions' && (
          <Suspense fallback={<ChartFallback />}>
            <Transactions />
          </Suspense>
        )}

        {/* The Plan pages: the only place anything is edited. */}
        {tab === 'accounts' && (
          <>
            <Accounts
              accounts={accounts}
              onAdd={addAccount} onUpdate={updateAccount} onDelete={deleteAccount}
              onMakePrimary={makePrimary} onReorder={reorderAccounts}
            />
            <BucketsPanel
              buckets={buckets}
              accounts={accounts}
              bucketPlan={bucketPlan}
              labels={savings.map((s) => s.label)}
              onAdd={addBucket}
              onUpdate={updateBucket}
              onDelete={deleteBucket}
              onReorder={reorderBuckets}
            />
          </>
        )}

        {tab === 'income' && (
          <LineItemTable
          title="Income Sources" description="Money coming in, by pay frequency"
          items={incomeSources} accent="income" totalLabel="Total Per Payment"
          kind="income" groups={groups} showFrequency showAccount
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, is_primary: a.is_primary }))}
          onAdd={addIncome} onUpdate={updateIncome} onDelete={deleteIncome}
          onUpdateOccurrence={(item, scheduledDate, occurrenceDate, status) => updateIncomeOccurrence(item as IncomeSource, scheduledDate, occurrenceDate, status)}
          onResetOccurrence={(item, scheduledDate) => resetIncomeOccurrence(item as IncomeSource, scheduledDate)}
          onAddGroup={(name) => addGroup(name, 'income')} onRenameGroup={renameGroup} onDeleteGroup={deleteGroup}
          onReorder={reorderIncome} onReorderGroup={reorderGroups}
        />
        )}

        {tab === 'expenses' && (
          <>
          <LineItemTable
          title="Bills & costs" description="Fixed costs by frequency — split across cash & credit via Edit"
          items={expenses.filter((e) => !e.is_budget)} accent="expense" totalLabel="Total Per Payment"
          kind="expense" groups={groups} showFrequency showFunding
          isPaidThisMonth={(item) => isExpensePaidThisMonth(item as Expense)}
          onTogglePaid={(item) => toggleExpensePaid(item as Expense)}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, is_primary: a.is_primary }))}
          debts={debts.filter((d) => d.debt_type === 'credit_card').map((d) => ({ id: d.id, name: d.name, available: d.credit_limit != null ? Math.max(0, d.credit_limit - d.balance) : null, overLimit: d.credit_limit != null && d.balance > d.credit_limit + 0.005 }))}
          onAdd={addExpense} onUpdate={updateExpense} onDelete={deleteExpense}
          onAddGroup={(name) => addGroup(name, 'expense')} onRenameGroup={renameGroup} onDeleteGroup={deleteGroup}
          onReorder={reorderExpenses} onReorderGroup={reorderGroups}
        />
          <BudgetsPanel
            budgets={expenses.filter((e) => e.is_budget)}
            accounts={accounts}
            cards={debts.filter((d) => d.debt_type === 'credit_card').map((d) => ({ id: d.id, name: d.name }))}
            categories={budgetCategories}
            onAdd={addBudget}
            onUpdate={updateExpense}
            onDelete={deleteExpense}
          />
          </>
        )}

        {tab === 'debts' && (
          <Debts
        debts={debts} groups={groups}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, is_primary: a.is_primary }))}
        onAdd={addDebt} onUpdate={updateDebt} onDelete={deleteDebt}
        onAddGroup={(name) => addGroup(name, 'debt')} onRenameGroup={renameGroup} onDeleteGroup={deleteGroup}
        onReorder={reorderDebts} onReorderGroup={reorderGroups}
        plan={plan} basePlan={basePlan} extra={debtExtra} strategy={debtStrategy}
        onExtraChange={changeDebtExtra} onStrategyChange={changeDebtStrategy}
        isPaidThisMonth={isPaidThisMonth} paidDetail={paidDetailOf} onTogglePaid={togglePaid}
      />
        )}
    </AppShell>
  );
}
