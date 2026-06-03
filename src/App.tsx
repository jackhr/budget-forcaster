import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import type { Debt, Expense, GroupKind, IncomeSource, ItemFormData, LineItemGroup, ScheduledPayment } from './types';
import { debtsApi, expensesApi, groupsApi, incomeApi, scheduledApi, settingsApi } from './api/client';
import { buildForecast, buildSavings } from './lib/forecast';
import { setCurrency } from './lib/format';
import { useToast } from './components/Toast';
import SummaryCards from './components/SummaryCards';
import LineItemTable from './components/LineItemTable';
import SavingsSummary from './components/SavingsSummary';
import ScheduledPayments from './components/ScheduledPayments';
import Debts from './components/Debts';
import HeaderControls from './components/HeaderControls';

// Charts pull in Recharts (~the bulk of the bundle) — load them on demand.
const ForecastChart = lazy(() => import('./components/ForecastChart'));
const SavingsChart = lazy(() => import('./components/SavingsChart'));

type Tab = 'forecast' | 'savings';

function ChartFallback() {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius)',
      height: 420,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--color-text-muted)',
      fontSize: 13,
    }}>
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
  const [startingBalance, setStartingBalance] = useState(0);
  const [currency, setCurrencyState] = useState('USD');
  const [months, setMonths] = useState(12);
  const [tab, setTab] = useState<Tab>('forecast');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [inc, exp, sched, dbts, grps, settings] = await Promise.all([
        incomeApi.getAll(),
        expensesApi.getAll(),
        scheduledApi.getAll(),
        debtsApi.getAll(),
        groupsApi.getAll(),
        settingsApi.getAll(),
      ]);
      setIncomeSources(inc);
      setExpenses(exp);
      setPayments(sched);
      setDebts(dbts);
      setGroups(grps);
      setStartingBalance(parseFloat(settings.starting_balance ?? '0') || 0);
      const cur = settings.currency || 'USD';
      setCurrency(cur);
      setCurrencyState(cur);
      setError(null);
    } catch (e) {
      setError('Cannot connect to the API server. Make sure the backend is running on port 3001.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Wraps a mutation so any failure surfaces as a toast instead of an unhandled rejection.
  const guard = useCallback(async (fn: () => Promise<void>, errMsg: string) => {
    try {
      await fn();
    } catch (e) {
      console.error(e);
      const detail = e instanceof Error ? e.message : 'unknown error';
      toast.error(`${errMsg}: ${detail}`);
    }
  }, [toast]);

  const forecast = buildForecast(incomeSources, expenses, payments, debts, months);
  const savings = buildSavings(incomeSources, expenses, payments, debts, months, startingBalance);

  // Income handlers
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

  // Expense handlers
  const addExpense = (data: ItemFormData) => guard(async () => {
    const item = await expensesApi.create({
      name: data.name,
      monthly_amount: data.monthly_amount,
      group_id: data.group_id ?? null,
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

  // Scheduled payment handlers
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

  // Debt handlers
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

  const changeStartingBalance = (value: number) => guard(async () => {
    setStartingBalance(value);
    await settingsApi.set('starting_balance', value);
  }, 'Could not save current cash');

  const changeCurrency = (code: string) => guard(async () => {
    setCurrency(code);
    setCurrencyState(code);
    await settingsApi.set('currency', code);
  }, 'Could not save currency');

  // Group handlers
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
    // Items were ungrouped server-side; mirror that locally.
    setIncomeSources((prev) => prev.map((i) => (i.group_id === id ? { ...i, group_id: null } : i)));
    setExpenses((prev) => prev.map((e) => (e.group_id === id ? { ...e, group_id: null } : e)));
  }, 'Could not remove group');

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
        padding: '7px 16px',
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', padding: '0 0 60px' }}>
      <header style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '10px 24px',
        minHeight: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-income))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>
            📈
          </div>
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
          />
          <div style={{ display: 'flex', gap: 6, background: 'var(--color-bg)', padding: 4, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
            {tabBtn('forecast', 'Forecast')}
            {tabBtn('savings', 'Savings')}
          </div>
        </div>

        {error && (
          <div style={{ background: '#7f1d1d', border: '1px solid #991b1b', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: '#fca5a5', flexBasis: '100%' }}>
            ⚠ {error}
          </div>
        )}
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* The tab only switches the chart view — the data below is shared by both. */}
        {tab === 'forecast' ? (
          <>
            <SummaryCards data={forecast} />
            <Suspense fallback={<ChartFallback />}>
              <ForecastChart data={forecast} months={months} onMonthsChange={setMonths} />
            </Suspense>
          </>
        ) : (
          <>
            <SavingsSummary data={savings} startingBalance={startingBalance} />
            <Suspense fallback={<ChartFallback />}>
              <SavingsChart data={savings} months={months} onMonthsChange={setMonths} />
            </Suspense>
          </>
        )}

        {/* Shared data — drives both views, always editable */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 20 }}>
          <LineItemTable
            title="Income Sources"
            description="Money coming in, by pay frequency"
            items={incomeSources}
            accentColor="var(--color-income)"
            totalLabel="Total Per Payment"
            kind="income"
            groups={groups}
            showFrequency
            onAdd={addIncome}
            onUpdate={updateIncome}
            onDelete={deleteIncome}
            onAddGroup={(name) => addGroup(name, 'income')}
            onRenameGroup={renameGroup}
            onDeleteGroup={deleteGroup}
          />
          <LineItemTable
            title="Expenses"
            description="Recurring costs happening now, every month"
            items={expenses}
            accentColor="var(--color-expense)"
            totalLabel="Total Monthly Expenses"
            kind="expense"
            groups={groups}
            onAdd={addExpense}
            onUpdate={updateExpense}
            onDelete={deleteExpense}
            onAddGroup={(name) => addGroup(name, 'expense')}
            onRenameGroup={renameGroup}
            onDeleteGroup={deleteGroup}
          />
        </div>
        <ScheduledPayments
          payments={payments}
          onAdd={addPayment}
          onUpdate={updatePayment}
          onDelete={deletePayment}
        />
        <Debts
          debts={debts}
          onAdd={addDebt}
          onUpdate={updateDebt}
          onDelete={deleteDebt}
        />
      </main>
    </div>
  );
}
