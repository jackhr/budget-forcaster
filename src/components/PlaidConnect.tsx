import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { plaidApi, type PlaidAccount, type PlaidStatus } from '../api/client';
import { formatMoney } from '../lib/format';
import { useToast } from './Toast';
import ConfirmButton from './ConfirmButton';

interface Props {
  onImported: () => void; // reload app accounts after import
}

export default function PlaidConnect({ onImported }: Props) {
  const toast = useToast();
  const [status, setStatus] = useState<PlaidStatus | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // null = idle, '__all__' = syncing everything, otherwise the item_id being synced.
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Only not-yet-imported, selected accounts can be imported.
  const importCount = accounts.filter((a) => selected.has(a.account_id) && !a.imported).length;

  const refreshStatus = useCallback(async () => {
    try { setStatus(await plaidApi.status()); } catch (e) { console.error(e); }
  }, []);

  const refreshAccounts = useCallback(async () => {
    try {
      const a = await plaidApi.accounts();
      setAccounts(a);
      // Pre-select everything that hasn't been imported yet (imported rows resync, not re-import).
      setSelected(new Set(a.filter((x) => !x.imported).map((x) => x.account_id)));
    } catch (e) {
      toast.error(`Could not load Plaid balances: ${e instanceof Error ? e.message : 'error'}`);
    }
  }, [toast]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);
  useEffect(() => { if (status?.items.length) refreshAccounts(); }, [status, refreshAccounts]);

  const onSuccess = useCallback(async (publicToken: string) => {
    setBusy(true);
    try {
      const r = await plaidApi.exchange(publicToken);
      toast.success(`Linked ${r.institution_name ?? 'bank'}`);
      await refreshStatus();
    } catch (e) {
      toast.error(`Link failed: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setBusy(false);
      setLinkToken(null);
    }
  }, [toast, refreshStatus]);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  useEffect(() => { if (linkToken && ready) open(); }, [linkToken, ready, open]);

  async function connect() {
    setBusy(true);
    try {
      const { link_token } = await plaidApi.createLinkToken();
      setLinkToken(link_token);
    } catch (e) {
      toast.error(`Could not start Plaid: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setBusy(false);
    }
  }

  async function importSelected() {
    // Only ever import accounts that aren't already imported.
    const chosen = accounts.filter((a) => selected.has(a.account_id) && !a.imported);
    if (chosen.length === 0) return;
    await toastGuard(toast, async () => {
      const r = await plaidApi.importAccounts(chosen.map((a) => ({
        account_id: a.account_id,
        name: `${a.name}${a.mask ? ` ••${a.mask}` : ''}`,
        balance: a.current ?? 0,
        type: a.type,
        mask: a.mask,
        credit_limit: a.limit,
      })));
      const parts = [
        r.accountsCreated ? `${r.accountsCreated} account${r.accountsCreated !== 1 ? 's' : ''}` : '',
        r.debtsCreated ? `${r.debtsCreated} debt${r.debtsCreated !== 1 ? 's' : ''}` : '',
      ].filter(Boolean);
      toast.success(parts.length ? `Imported ${parts.join(' & ')}` : 'Nothing new to import');
      onImported();
      await refreshAccounts(); // imported rows now show as imported
    });
  }

  async function resync(itemId?: string) {
    setSyncingId(itemId ?? '__all__');
    try {
      await toastGuard(toast, async () => {
        const r = await plaidApi.resync(itemId);
        toast.success(`Resynced ${r.updated} balance${r.updated !== 1 ? 's' : ''}`);
        onImported();
        await refreshAccounts();
      });
    } finally {
      setSyncingId(null);
    }
  }

  async function removeItem(id: number) {
    await toastGuard(toast, async () => {
      await plaidApi.removeItem(id);
      setAccounts((prev) => prev.filter((a) => status?.items.find((i) => i.id === id)?.item_id !== a.item_id));
      await refreshStatus();
    });
  }

  const card: React.CSSProperties = {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)', padding: 20,
  };

  const env = status?.env ?? 'sandbox';
  const isProd = env === 'production';
  const secretVar = isProd ? 'PLAID_PROD_SECRET' : 'PLAID_SANDBOX_SECRET';

  if (status && !status.configured) {
    return (
      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Connect a bank <Badge>Plaid {env}</Badge></h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 6 }}>
          Plaid isn’t configured for the <code>{env}</code> environment. Add <code>PLAID_CLIENT_ID</code> and <code>{secretVar}</code> to <code>.env</code> and restart the server.
        </p>
      </div>
    );
  }

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Connect a bank <Badge>Plaid {env}</Badge></h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 2 }}>
            {isProd
              ? 'Pull live balances from your real bank and import them as accounts.'
              : <>Pull real (sandbox) balances and import them as accounts. Use Plaid’s test login (e.g. <code>user_good</code> / <code>pass_good</code>).</>}
          </p>
        </div>
        <button onClick={connect} disabled={busy} style={{ background: 'var(--color-primary)', color: '#fff', padding: '8px 16px', fontSize: 13, fontWeight: 600 }}>
          {busy ? '…' : '+ Connect bank'}
        </button>
      </div>

      {status?.items.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {status.items.map((it) => {
            const itemAccounts = accounts.filter((a) => a.item_id === it.item_id);
            const hasImported = itemAccounts.some((a) => a.imported);
            return (
              <div key={it.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, background: 'var(--color-surface-2)', padding: '8px 12px' }}>
                  <span style={{ fontWeight: 600 }}>🏦 {it.institution_name ?? 'Linked institution'}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {hasImported && (
                      <button onClick={() => resync(it.item_id)} disabled={syncingId != null} title="Update this bank's imported balances" style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '3px 10px', fontSize: 12 }}>
                        {syncingId === it.item_id ? 'Syncing…' : '↻ Sync'}
                      </button>
                    )}
                    <ConfirmButton onConfirm={() => removeItem(it.id)} title={`Unlink ${it.institution_name ?? 'institution'}`} triggerStyle={{ background: 'transparent', color: 'var(--color-expense)', padding: '4px 8px', fontSize: 12 }}>Unlink</ConfirmButton>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
                  {itemAccounts.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 12.5, padding: '4px 6px' }}>No accounts found for this login.</p>
                  ) : (
                    itemAccounts.map((a) => (
                      <AccountRow key={a.account_id} a={a} selected={selected.has(a.account_id)} onToggle={() => toggle(a.account_id)} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {accounts.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          {accounts.some((a) => a.imported) && (
            <button onClick={() => resync()} disabled={syncingId != null} title="Update every imported balance from Plaid" style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', padding: '8px 16px', fontSize: 13, fontWeight: 600 }}>
              {syncingId === '__all__' ? 'Syncing all…' : '↻ Sync all'}
            </button>
          )}
          <button onClick={importSelected} disabled={importCount === 0} style={{ background: 'var(--color-income)', color: '#04210f', padding: '8px 16px', fontSize: 13, fontWeight: 700 }}>
            Import {importCount} item{importCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}

function AccountRow({ a, selected, onToggle }: { a: PlaidAccount; selected: boolean; onToggle: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--radius-sm)', cursor: a.imported ? 'default' : 'pointer', opacity: a.imported ? 0.6 : 1 }}>
      <input type="checkbox" checked={selected && !a.imported} disabled={a.imported} onChange={onToggle} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 500 }}>{a.name}</span>
        {a.mask && <span style={{ color: 'var(--color-text-muted)' }}> ••{a.mask}</span>}
        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}> · {a.subtype ?? a.type}</span>
        {a.imported ? <ImportedBadge /> : <DestBadge type={a.type} />}
      </span>
      <span style={{ fontWeight: 600, color: isDebtType(a.type) ? 'var(--color-net-neg)' : 'var(--color-net-pos)' }}>{formatMoney(a.current ?? 0)}</span>
    </label>
  );
}

// Plaid credit/loan accounts become debts; everything else becomes a cash account.
function isDebtType(type: string): boolean {
  return type === 'credit' || type === 'loan';
}

function DestBadge({ type }: { type: string }) {
  const debt = isDebtType(type);
  const label = type === 'credit' ? '→ Credit card' : type === 'loan' ? '→ Loan' : '→ Account';
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, marginLeft: 8, padding: '1px 6px', borderRadius: 5,
      color: debt ? 'var(--color-net-neg)' : 'var(--color-net-pos)',
      background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
    }}>
      {label}
    </span>
  );
}

function ImportedBadge() {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, marginLeft: 8, padding: '1px 6px', borderRadius: 5,
      color: 'var(--color-text-muted)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
    }}>
      ✓ Imported
    </span>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 5, padding: '1px 6px', marginLeft: 6 }}>
      {children}
    </span>
  );
}

async function toastGuard(toast: ReturnType<typeof useToast>, fn: () => Promise<void>) {
  try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Something went wrong'); }
}
