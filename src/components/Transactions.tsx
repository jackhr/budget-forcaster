import { useCallback, useEffect, useMemo, useState } from 'react';
import { plaidApi, type PlaidAccount, type PlaidStatus, type PlaidTransaction } from '../api/client';
import { formatMoney } from '../lib/format';
import { RefreshCw } from 'lucide-react';
import { Banner, Button, EmptyState, Panel, cx } from '../ui';

const DAY_OPTIONS: (number | 'all')[] = ['all', 30, 90, 180, 365, 730];

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Transactions() {
  const [status, setStatus] = useState<PlaidStatus | null>(null);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [days, setDays] = useState<number | 'all'>('all');
  const [txns, setTxns] = useState<PlaidTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load linked accounts once; default to the first credit card.
  useEffect(() => {
    (async () => {
      try {
        const s = await plaidApi.status();
        setStatus(s);
        if (s.configured && s.items.length) {
          const a = await plaidApi.accounts();
          setAccounts(a);
          const firstCredit = a.find((x) => x.type === 'credit') ?? a[0];
          setAccountId(firstCredit?.account_id ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load accounts');
      }
    })();
  }, []);

  const loadTxns = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      setTxns(await plaidApi.transactions(accountId, days));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load transactions');
      setTxns([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, days]);

  useEffect(() => { loadTxns(); }, [loadTxns]);

  const refresh = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      await plaidApi.syncTransactions();
      await loadTxns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh from Plaid');
    } finally {
      setSyncing(false);
    }
  }, [loadTxns]);

  const { spend, refunds } = useMemo(() => {
    let spend = 0, refunds = 0;
    for (const t of txns) { if (t.amount > 0) spend += t.amount; else refunds += -t.amount; }
    return { spend, refunds };
  }, [txns]);

  // Group transactions by date for a sectioned list.
  const groups = useMemo(() => {
    const map = new Map<string, PlaidTransaction[]>();
    for (const t of txns) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date)!.push(t);
    }
    return [...map.entries()];
  }, [txns]);

  if (status && (!status.configured || status.items.length === 0)) {
    return (
      <Panel>
        <h2 className="text-base font-semibold tracking-tight">Transactions</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          Link a bank under <strong>Account</strong> (Connect a bank) to see transaction history here.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Transactions</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Available activity cached from Plaid.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={accountId ?? ''}
            onChange={(e) => setAccountId(e.target.value || null)}
            className="font-semibold"
          >
            {accounts.map((a) => (
              <option key={a.account_id} value={a.account_id}>
                {a.name}{a.mask ? ` ••${a.mask}` : ''}{a.type === 'credit' ? ' (card)' : ''}
              </option>
            ))}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="font-semibold"
          >
            {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d === 'all' ? 'All available' : `Last ${d} days`}</option>)}
          </select>
          <Button onClick={refresh} disabled={syncing || loading} title="Pull the latest from Plaid" className="font-semibold">
            {syncing ? 'Refreshing…' : <><RefreshCw size={13} strokeWidth={2.1} aria-hidden="true" />Refresh</>}
          </Button>
        </div>
      </div>

      {/* Summary */}
      {!loading && !error && txns.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-6">
          <Summary label="Spent" value={formatMoney(spend)} className="text-expense" />
          <Summary label="Payments / refunds" value={formatMoney(refunds)} className="text-income" />
          <Summary label="Transactions" value={String(txns.length)} className="text-text" />
        </div>
      )}

      {loading && <p className="text-[13px] text-muted">Loading transactions…</p>}
      {error && (
        <Banner tone="warning">
          {error}
          {/PRODUCT_NOT_READY/.test(error) && <> — Plaid is still preparing this item’s transactions. Try again in a moment.</>}
        </Banner>
      )}
      {!loading && !error && txns.length === 0 && <EmptyState>No transactions in this window.</EmptyState>}

      {!loading && !error && groups.map(([date, items]) => (
        <div key={date} className="mb-3.5">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">{fmtDate(date)}</div>
          <div className="flex flex-col gap-1">
            {items.map((t) => {
              const isRefund = t.amount < 0; // negative Plaid amount = money in
              return (
                <div
                  key={t.transaction_id}
                  className="flex items-center gap-3 rounded-control border border-border bg-surface-2 px-2.5 py-2"
                >
                  <Avatar name={t.name} logo={t.logo_url} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {t.name}
                      {t.pending && <span className="text-[12px] font-normal text-muted"> · pending</span>}
                    </div>
                    {t.category && <div className="text-[12px] text-muted">{titleCase(t.category)}</div>}
                  </div>
                  <div className={cx('shrink-0 font-semibold tabular-nums', isRefund ? 'text-income' : 'text-text')}>
                    {isRefund ? '+' : '−'}{formatMoney(Math.abs(t.amount))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Panel>
  );
}

function Summary({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={cx('text-xl font-bold tabular-nums', className)}>{value}</div>
    </div>
  );
}

function Avatar({ name, logo }: { name: string; logo: string | null }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 shrink-0 rounded-md bg-white object-contain"
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-bg text-[13px] font-bold text-muted">
      {initial}
    </div>
  );
}
