import { useCallback, useEffect, useMemo, useState } from 'react';
import { plaidApi, type PlaidAccount, type PlaidStatus, type PlaidTransaction } from '../api/client';
import { formatMoney } from '../lib/format';

const DAY_OPTIONS = [30, 90, 180, 365];

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
  const [days, setDays] = useState(90);
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

  // Group transactions by date for a Rocket-Money-style sectioned list.
  const groups = useMemo(() => {
    const map = new Map<string, PlaidTransaction[]>();
    for (const t of txns) {
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date)!.push(t);
    }
    return [...map.entries()];
  }, [txns]);

  const card: React.CSSProperties = {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)', padding: 20,
  };

  if (status && (!status.configured || status.items.length === 0)) {
    return (
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Transactions</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 6 }}>
          Link a bank under <strong>Account</strong> (Connect a bank) to see transaction history here.
        </p>
      </div>
    );
  }

  const selectStyle: React.CSSProperties = {
    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', padding: '6px 10px', fontSize: 13, fontWeight: 600,
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Transactions</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 2 }}>
            Recent activity pulled live from Plaid.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={accountId ?? ''} onChange={(e) => setAccountId(e.target.value || null)} style={selectStyle}>
            {accounts.map((a) => (
              <option key={a.account_id} value={a.account_id}>
                {a.name}{a.mask ? ` ••${a.mask}` : ''}{a.type === 'credit' ? ' (card)' : ''}
              </option>
            ))}
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={selectStyle}>
            {DAY_OPTIONS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button onClick={refresh} disabled={syncing || loading} title="Pull the latest from Plaid" style={{ ...selectStyle, cursor: 'pointer' }}>
            {syncing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Summary */}
      {!loading && !error && txns.length > 0 && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
          <Summary label="Spent" value={formatMoney(spend)} color="var(--color-expense)" />
          <Summary label="Payments / refunds" value={formatMoney(refunds)} color="var(--color-income)" />
          <Summary label="Transactions" value={String(txns.length)} color="var(--color-text)" />
        </div>
      )}

      {loading && <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading transactions…</p>}
      {error && (
        <div style={{ background: '#3b2f12', border: '1px solid #854d0e', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fde68a' }}>
          ⚠ {error}
          {/PRODUCT_NOT_READY/.test(error) && <> — Plaid is still preparing this item’s transactions. Try again in a moment.</>}
        </div>
      )}
      {!loading && !error && txns.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No transactions in this window.</p>
      )}

      {!loading && !error && groups.map(([date, items]) => (
        <div key={date} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: 6 }}>
            {fmtDate(date)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.map((t) => {
              const isRefund = t.amount < 0; // negative Plaid amount = money in
              return (
                <div key={t.transaction_id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px',
                  background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                }}>
                  <Avatar name={t.name} logo={t.logo_url} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.name}{t.pending && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 12 }}> · pending</span>}
                    </div>
                    {t.category && <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{titleCase(t.category)}</div>}
                  </div>
                  <div style={{ fontWeight: 600, color: isRefund ? 'var(--color-income)' : 'var(--color-text)' }}>
                    {isRefund ? '+' : '−'}{formatMoney(Math.abs(t.amount))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Summary({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Avatar({ name, logo }: { name: string; logo: string | null }) {
  if (logo) {
    return <img src={logo} alt="" width={28} height={28} style={{ borderRadius: 6, objectFit: 'contain', background: '#fff', flexShrink: 0 }} />;
  }
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div style={{
      width: 28, height: 28, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 700,
    }}>
      {initial}
    </div>
  );
}
