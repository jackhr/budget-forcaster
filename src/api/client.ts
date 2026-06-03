import type { Debt, Expense, GroupKind, IncomeSource, LineItemGroup, ScheduledPayment } from '../types';

const BASE = '/api';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

type IncomeInput = Omit<IncomeSource, 'id' | 'created_at' | 'updated_at'>;
type ExpenseInput = Omit<Expense, 'id' | 'created_at' | 'updated_at'>;
type ScheduledInput = Omit<ScheduledPayment, 'id' | 'created_at' | 'updated_at'>;

export const incomeApi = {
  getAll: () => req<IncomeSource[]>('/income'),
  create: (data: IncomeInput) =>
    req<IncomeSource>('/income', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<IncomeInput>) =>
    req<IncomeSource>(`/income/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<void>(`/income/${id}`, { method: 'DELETE' }),
};

export const expensesApi = {
  getAll: () => req<Expense[]>('/expenses'),
  create: (data: ExpenseInput) =>
    req<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ExpenseInput>) =>
    req<Expense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<void>(`/expenses/${id}`, { method: 'DELETE' }),
};

export const scheduledApi = {
  getAll: () => req<ScheduledPayment[]>('/scheduled'),
  create: (data: ScheduledInput) =>
    req<ScheduledPayment>('/scheduled', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ScheduledInput>) =>
    req<ScheduledPayment>(`/scheduled/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<void>(`/scheduled/${id}`, { method: 'DELETE' }),
};

export const groupsApi = {
  getAll: () => req<LineItemGroup[]>('/groups'),
  create: (data: { name: string; kind: GroupKind }) =>
    req<LineItemGroup>('/groups', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { name: string }) =>
    req<LineItemGroup>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<void>(`/groups/${id}`, { method: 'DELETE' }),
};

type DebtInput = Omit<Debt, 'id' | 'created_at' | 'updated_at'>;

export const debtsApi = {
  getAll: () => req<Debt[]>('/debts'),
  create: (data: DebtInput) =>
    req<Debt>('/debts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<DebtInput>) =>
    req<Debt>(`/debts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => req<void>(`/debts/${id}`, { method: 'DELETE' }),
};

export const settingsApi = {
  getAll: () => req<Record<string, string>>('/settings'),
  set: (key: string, value: string | number) =>
    req<{ key: string; value: string }>(`/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
};
