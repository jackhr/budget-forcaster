import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import type { Debt, Expense, GroupKind, IncomeSource, ItemFormData, LineItemGroup, ScheduledPayment } from './types';
import {
  dataApi, debtsApi, expensesApi, groupsApi, incomeApi, scenariosApi, scheduledApi, settingsApi,
  type Scenario,
} from './api/client';
import { buildForecast, buildSavings, buildNetWorth, buildDebtCharges } from './lib/forecast';
import { simulateDebtPlan, type DebtStrategy } from './lib/debt';
import { setCurrency, formatMoney } from './lib/format';
import { useToast } from './components/Toast';
import SummaryCards from './components/SummaryCards';
import LineItemTable from './components/LineItemTable';
import SavingsSummary from './components/SavingsSummary';
import ScheduledPayments from './components/ScheduledPayments';
import Debts from './components/Debts';
import HeaderControls from './components/HeaderControls';
import Toolbar from './components/Toolbar';
import type { PayoffMarker } from './components/NetWorthChart';

// Charts pull in Recharts (~the bulk of the bundle) — load them on demand.
const ForecastChart = lazy(() => import('./components/ForecastChart'));
const SavingsChart = lazy(() => import('./components/SavingsChart'));
const NetWorthChart = lazy(() => import('./components/NetWorthChart'));

type Tab = 'forecast' | 'savings' | 'networth';

function reorderBy<T extends { id: number }>(arr: T[], ids: number[]): T[] {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return [...arr].sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

interface Snapshot {
  income_sources?: IncomeSource[];
  expenses?: Expense[];
  scheduled_payments?: ScheduledPayment[];
  debts?: Debt[];
  app_settings?: { key: string; value: string }[];
}

function scenarioSeries(snap: Snapshot, months: number) {
  const s: Record<string, string> = {};
  for (const r of snap.app_settings ?? []) s[r.key] = r.value;
  const start = parseFloat(s.starting_balance ?? '0') || 0;
  const infl = parseFloat(s.inflation_rate ?? '0') || 0;
  const extra = parseFloat(s.debt_extra ?? '0') || 0;
  const strat = (s.debt_strategy as DebtStrategy) ?? 'none';
  const inc = snap.income_sources ?? [];
  const exp = snap.expenses ?? [];
  const pay = snap.scheduled_payments ?? [];
  const debts = snap.debts ?? [];
  const charges = buildDebtCharges(pay, months);
  const plan = simulateDebtPlan(debts, strat === 'none' ? 0 : extra, strat, months, charges);
  const fc = buildForecast(inc, exp, pay, plan.outflow, months, infl);
  const sv = buildSavings(inc, exp, pay, plan.outflow, months, start, infl);
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
  const [groups, setGroups] = useState<LineItemGroup[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [startingBalance, setStartingBalance] = useState(0);
  const [currency, setCurrencyState] = useState('USD');
  const [inflation, setInflation] = useState(0);
  const [debtExtra, setDebtExtra] = useState(0);
  const [debtStrategy, setDebtStrategy] = useState<DebtStrategy>('none');
  const [months, setMonths] = useState(() => Number(localStorage.getItem('bf.months')) || 12);
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('bf.tab') as Tab) || 'forecast');
  const [compareId, setCompareId] = useState<number | null>(null);
  const [dupDismissed, setDupDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem('bf.months', String(months)); }, [months]);
  useEffect(() => { localStorage.setItem('bf.tab', tab); }, [tab]);

  const load = useCallback(async () => {
    try {
      const [inc, exp, sched, dbts, grps, scen, settings] = await Promise.all([
        incomeApi.getAll(), expensesApi.getAll(), scheduledApi.getAll(),
        debtsApi.getAll(), groupsApi.getAll(), scenariosApi.getAll(), settingsApi.getAll(),
      ]);
      setIncomeSources(inc); setExpenses(exp); setPayments(sched); setDebts(dbts);
      setGroups(grps); setScenarios(scen);
      setStartingBalance(parseFloat(settings.starting_balance ?? '0') || 0);
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
  // Future expenses charged to a card add to that debt's balance over time.
  const debtCharges = buildDebtCharges(payments, months);
  const plan = simulateDebtPlan(debts, debtStrategy === 'none' ? 0 : debtExtra, debtStrategy, months, debtCharges);
  const basePlan = simulateDebtPlan(debts, 0, 'none', months, debtCharges);
  const forecast = buildForecast(incomeSources, expenses, payments, plan.outflow, months, inflation);
  const savings = buildSavings(incomeSources, expenses, payments, plan.outflow, months, startingBalance, inflation);
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

  // Compare overlay from a saved scenario.
  const compareScenario = scenarios.find((s) => s.id === compareId) ?? null;
  const compareSeries = compareScenario ? scenarioSeries(compareScenario.snapshot as Snapshot, months) : null;

  // This month's outflow breakdown.
  const m0 = savings[0];
  const moneyOut = m0 ? m0.expenses + m0.scheduledOut + m0.debtOut : 0;

  // Duplicate-name detection across expense-like things.
  const nameCounts = new Map<string, number>();
  for (const x of [...expenses, ...payments, ...debts]) {
    const k = x.name.trim().toLowerCase();
    nameCounts.set(k, (nameCounts.get(k) ?? 0) + 1);
  }
  const duplicates = [...nameCounts.entries()].filter(([, c]) => c > 1).map(([k]) => k);

  // --- Mutations ---
  const addIncome = (data: ItemFormData) => guard(async () => {
    const item = await incomeApi.create({ frequency: 'monthly', ...data, group_id: data.group_id ?? null });
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
    const item = await expensesApi.create({ name: data.name, monthly_amount: data.monthly_amount, group_id: data.group_id ?? null });
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

  const changeStartingBalance = (value: number) => guard(async () => {
    setStartingBalance(value); await settingsApi.set('starting_balance', value);
  }, 'Could not save current cash');
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

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      style={{
        background: tab === id ? 'var(--color-surface-2)' : 'transparent',
        color: tab === id ? 'var(--color-text)' : 'var(--color-text-muted)',
        border: `1px solid ${tab === id ? 'var(--color-border)' : 'transparent'}`,
        padding: '7px 14px', fontWeight: 600, fontSize: 13,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', padding: '0 0 60px' }}>
      <header style={{
        background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)',
        padding: '10px 24px', minHeight: 60, display: 'flex', alignItems: 'center',
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
            startingBalance={startingBalance}
            onStartingBalanceChange={changeStartingBalance}
            currency={currency}
            onCurrencyChange={changeCurrency}
            inflation={inflation}
            onInflationChange={changeInflation}
          />
          <div style={{ display: 'flex', gap: 6, background: 'var(--color-bg)', padding: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
            {tabBtn('forecast', 'Forecast')}
            {tabBtn('savings', 'Savings')}
            {tabBtn('networth', 'Net Worth')}
          </div>
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
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 24 }}>
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

        {tab === 'forecast' && (
          <>
            <SummaryCards data={forecast} />
            <Suspense fallback={<ChartFallback />}>
              <ForecastChart data={forecast} months={months} onMonthsChange={setMonths} compareData={compareSeries?.forecast} compareName={compareScenario?.name} />
            </Suspense>
          </>
        )}
        {tab === 'savings' && (
          <>
            <SavingsSummary data={savings} startingBalance={startingBalance} />
            <Suspense fallback={<ChartFallback />}>
              <SavingsChart data={savings} months={months} onMonthsChange={setMonths} payoffMarkers={payoffMarkers} compareData={compareSeries?.savings} compareName={compareScenario?.name} />
            </Suspense>
          </>
        )}
        {tab === 'networth' && (
          <Suspense fallback={<ChartFallback />}>
            <NetWorthChart data={netWorth} months={months} onMonthsChange={setMonths} payoffMarkers={payoffMarkers} compareData={compareSeries?.networth} compareName={compareScenario?.name} />
          </Suspense>
        )}

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 20 }}>
          <LineItemTable
            title="Income Sources" description="Money coming in, by pay frequency"
            items={incomeSources} accentColor="var(--color-income)" totalLabel="Total Per Payment"
            kind="income" groups={groups} showFrequency
            onAdd={addIncome} onUpdate={updateIncome} onDelete={deleteIncome}
            onAddGroup={(name) => addGroup(name, 'income')} onRenameGroup={renameGroup} onDeleteGroup={deleteGroup}
            onReorder={reorderIncome} onReorderGroup={reorderGroups}
          />
          <LineItemTable
            title="Expenses" description="Recurring costs happening now, every month"
            items={expenses} accentColor="var(--color-expense)" totalLabel="Total Monthly Expenses"
            kind="expense" groups={groups}
            onAdd={addExpense} onUpdate={updateExpense} onDelete={deleteExpense}
            onAddGroup={(name) => addGroup(name, 'expense')} onRenameGroup={renameGroup} onDeleteGroup={deleteGroup}
            onReorder={reorderExpenses} onReorderGroup={reorderGroups}
          />
        </div>
        <ScheduledPayments
          payments={payments}
          incomes={incomeSources.map((i) => ({ id: i.id, name: i.name }))}
          debts={debts.map((d) => ({ id: d.id, name: d.name }))}
          onAdd={addPayment} onUpdate={updatePayment} onDelete={deletePayment}
        />
        <Debts
          debts={debts} groups={groups}
          onAdd={addDebt} onUpdate={updateDebt} onDelete={deleteDebt}
          onAddGroup={(name) => addGroup(name, 'debt')} onRenameGroup={renameGroup} onDeleteGroup={deleteGroup}
          onReorder={reorderDebts} onReorderGroup={reorderGroups}
          plan={plan} basePlan={basePlan} extra={debtExtra} strategy={debtStrategy}
          onExtraChange={changeDebtExtra} onStrategyChange={changeDebtStrategy}
        />
      </main>
    </div>
  );
}
