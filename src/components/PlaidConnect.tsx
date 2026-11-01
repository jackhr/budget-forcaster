import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { plaidApi, type PlaidAccount, type PlaidItem, type PlaidStatus } from '../api/client';
import { formatMoney } from '../lib/format';
import { useCollapsed } from '../lib/useCollapsed';
import { useToast } from './Toast';
import ConfirmButton from './ConfirmButton';
import { Check, Landmark, RefreshCw } from 'lucide-react';
import { Button, CollapseToggle, Panel, Pill, cx } from '../ui';

interface Props {
  onImported: () => void; // reload app accounts after import
}

export default function PlaidConnect({ onImported }: Props) {
  const toast = useToast();
  const [status, setStatus] = useState<PlaidStatus | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [liabilitiesItemId, setLiabilitiesItemId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // null = idle, '__all__' = syncing everything, otherwise the item_id being synced.
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const { collapsed: sectionCollapsed, toggle: toggleSection } = useCollapsed('connect-bank');

  // Only not-yet-imported, selected accounts can be imported.
  const importCount = accounts.filter((a) => selected.has(a.account_id) && !a.imported && !a.replaced).length;

  const refreshStatus = useCallback(async () => {
    try { setStatus(await plaidApi.status()); } catch (e) { console.error(e); }
  }, []);

  const refreshAccounts = useCallback(async () => {
    try {
      const a = await plaidApi.accounts();
      setAccounts(a);
      // Pre-select everything that hasn't been imported yet (imported rows resync, not re-import).
      setSelected(new Set(a.filter((x) => !x.imported && !x.replaced).map((x) => x.account_id)));
    } catch (e) {
      toast.error(`Could not load Plaid balances: ${e instanceof Error ? e.message : 'error'}`);
    }
  }, [toast]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);
  useEffect(() => { if (status?.items.length) refreshAccounts(); }, [status, refreshAccounts]);

  const onSuccess = useCallback(async (publicToken: string) => {
    setBusy(true);
    try {
      if (liabilitiesItemId) {
        const item = status?.items.find((i) => i.item_id === liabilitiesItemId);
        const r = await plaidApi.resync(liabilitiesItemId, true);
        const synced = `resynced ${r.updated} balance${r.updated !== 1 ? 's' : ''}`;
        const moved = r.reattached ? ` · ${r.reattached} replaced card${r.reattached !== 1 ? 's' : ''} now tracked under the new number` : '';
        toast.success(`${item?.error_code ? 'Reconnected' : `Updated ${item?.institution_name ?? 'bank'}`} and ${synced}${moved}`);
        onImported();
        await refreshAccounts();
      } else {
        const r = await plaidApi.exchange(publicToken);
        toast.success(`Linked ${r.institution_name ?? 'bank'}`);
      }
      await refreshStatus();
    } catch (e) {
      toast.error(`Link failed: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setBusy(false);
      setLinkToken(null);
      setLiabilitiesItemId(null);
    }
  }, [liabilitiesItemId, status, onImported, refreshAccounts, refreshStatus, toast]);

  const onExit = useCallback(() => {
    setLinkToken(null);
    setLiabilitiesItemId(null);
    setBusy(false);
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });

  useEffect(() => { if (linkToken && ready) open(); }, [linkToken, ready, open]);

  async function connect() {
    setBusy(true);
    try {
      setLiabilitiesItemId(null);
      const { link_token } = await plaidApi.createLinkToken();
      setLinkToken(link_token);
    } catch (e) {
      toast.error(`Could not start Plaid: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setBusy(false);
    }
  }

  async function enableLiabilities(item: PlaidItem) {
    setBusy(true);
    try {
      setLiabilitiesItemId(item.item_id);
      const { link_token } = await plaidApi.createLiabilitiesLinkToken(item.id);
      setLinkToken(link_token);
    } catch (e) {
      setLiabilitiesItemId(null);
      toast.error(`Could not enable card details: ${e instanceof Error ? e.message : 'error'}`);
    } finally {
      setBusy(false);
    }
  }

  async function importSelected() {
    // Only ever import accounts that aren't already imported.
    const chosen = accounts.filter((a) => selected.has(a.account_id) && !a.imported && !a.replaced);
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
        await refreshStatus();
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

  const env = status?.env ?? 'sandbox';
  const isProd = env === 'production';
  const secretVar = isProd ? 'PLAID_PROD_SECRET' : 'PLAID_SANDBOX_SECRET';

  if (status && !status.configured) {
    return (
      <Panel>
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight">
          Connect a bank <Pill tone="primary">Plaid {env}</Pill>
        </h2>
        <p className="mt-1.5 text-[13px] text-muted">
          Plaid isn’t configured for the <code>{env}</code> environment. Add <code>PLAID_CLIENT_ID</code> and <code>{secretVar}</code> to <code>.env</code> and restart the server.
        </p>
      </Panel>
    );
  }

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  return (
    <Panel>
      <div className={cx('flex flex-wrap items-start justify-between gap-3', sectionCollapsed ? 'mb-0' : 'mb-3')}>
        <div onClick={toggleSection} className="flex min-w-0 cursor-pointer items-start gap-1.5">
          <CollapseToggle collapsed={sectionCollapsed} onToggle={toggleSection} label="Connect a bank" />
          <div className="min-w-0 pt-1">
            <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight">
              Connect a bank <Pill tone="primary">Plaid {env}</Pill>
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {isProd
                ? 'Pull live balances from your real bank and import them as accounts.'
                : <>Pull real (sandbox) balances and import them as accounts. Use Plaid’s test login (e.g. <code>user_good</code> / <code>pass_good</code>).</>}
            </p>
          </div>
        </div>
        <Button variant="primary" onClick={connect} disabled={busy} className="font-semibold">
          {busy ? '…' : '+ Connect bank'}
        </Button>
      </div>

      {!sectionCollapsed && (<>
      {status?.items.length ? (
        <div className="flex flex-col gap-3">
          {status.items.map((it) => (
            <InstitutionBlock
              key={it.id}
              item={it}
              itemAccounts={accounts.filter((a) => a.item_id === it.item_id)}
              selected={selected}
              onToggleSelect={toggle}
              onResync={() => resync(it.item_id)}
              onEnableLiabilities={() => enableLiabilities(it)}
              onUnlink={() => removeItem(it.id)}
              syncing={syncingId === it.item_id}
              syncingAny={syncingId != null}
              enabling={liabilitiesItemId === it.item_id}
            />
          ))}
        </div>
      ) : null}

      {accounts.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {accounts.some((a) => a.imported) && (
            <Button onClick={() => resync()} disabled={syncingId != null} title="Update every imported balance from Plaid" className="font-semibold">
              {syncingId === '__all__' ? 'Syncing all…' : <><RefreshCw size={13} strokeWidth={2.1} aria-hidden="true" />Sync all</>}
            </Button>
          )}
          <Button
            variant="bare"
            onClick={importSelected}
            disabled={importCount === 0}
            className="bg-income font-bold text-[#04210f] hover:bg-income/90"
          >
            Import {importCount} item{importCount !== 1 ? 's' : ''}
          </Button>
        </div>
      )}
      </>)}
    </Panel>
  );
}

function InstitutionBlock({ item, itemAccounts, selected, onToggleSelect, onResync, onEnableLiabilities, onUnlink, syncing, syncingAny, enabling }: {
  item: PlaidItem;
  itemAccounts: PlaidAccount[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onResync: () => void;
  onEnableLiabilities: () => void;
  onUnlink: () => void;
  syncing: boolean;
  syncingAny: boolean;
  enabling: boolean;
}) {
  const { collapsed, toggle } = useCollapsed(`plaid-item-${item.item_id}`);
  const hasImported = itemAccounts.some((a) => a.imported);
  // One action, whose meaning depends on what the item needs: a fresh login, a
  // liabilities consent, or a chance to re-pick which accounts it shares.
  const needsReconnect = !!item.error_code;
  const needsLiabilities = !needsReconnect && (!item.liabilities_synced_at || item.liabilities_consent_required === 1);

  return (
    <div className="overflow-hidden rounded-control border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2 px-3 py-2 text-[13px]">
        <div onClick={toggle} className="flex min-w-0 cursor-pointer items-center gap-2">
          <CollapseToggle collapsed={collapsed} onToggle={toggle} label={item.institution_name ?? 'institution'} size="sm" />
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Landmark size={14} strokeWidth={1.9} aria-hidden="true" />
            {item.institution_name ?? 'Linked institution'}
          </span>
          <span className="text-muted">· {itemAccounts.length} account{itemAccounts.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          {needsReconnect ? (
            <Button
              size="sm"
              variant="primary"
              onClick={onEnableLiabilities}
              disabled={syncingAny || enabling}
              title={`Log in again (${item.error_code}). Also check any new or replacement cards so Plaid can see them.`}
            >
              {enabling ? 'Opening…' : 'Reconnect'}
            </Button>
          ) : needsLiabilities ? (
            <Button
              size="sm"
              onClick={onEnableLiabilities}
              disabled={syncingAny || enabling}
              title="Authorize minimum payment, APR, statement, and due-date details"
              className="text-primary"
            >
              {enabling ? 'Opening…' : 'Enable liabilities'}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onEnableLiabilities}
              disabled={syncingAny || enabling}
              title="Choose which accounts this login shares — use this when a card was reissued with a new number"
            >
              {enabling ? 'Opening…' : 'Update accounts'}
            </Button>
          )}
          {hasImported && (
            <Button size="sm" onClick={onResync} disabled={syncingAny} title="Update this bank's imported balances">
              {syncing ? 'Syncing…' : <><RefreshCw size={13} strokeWidth={2.1} aria-hidden="true" />Sync</>}
            </Button>
          )}
          <ConfirmButton onConfirm={onUnlink} title={`Unlink ${item.institution_name ?? 'institution'}`}>Unlink</ConfirmButton>
        </div>
      </div>
      {!collapsed && (
        <div className="flex flex-col gap-1 p-2">
          {itemAccounts.length === 0 ? (
            <p className={cx('px-1.5 py-1 text-[12.5px]', item.error_code ? 'text-expense' : 'text-muted')}>
              {item.error_code
                ? `${item.institution_name ?? 'This bank'} needs you to log in again before Plaid can load its accounts. Click Reconnect.`
                : 'No accounts found for this login.'}
            </p>
          ) : (
            itemAccounts.map((a) => (
              <AccountRow key={a.account_id} a={a} selected={selected.has(a.account_id)} onToggle={() => onToggleSelect(a.account_id)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AccountRow({ a, selected, onToggle }: { a: PlaidAccount; selected: boolean; onToggle: () => void }) {
  // An imported or replaced account can't be imported again; it resyncs instead.
  const locked = a.imported || a.replaced;
  return (
    <label className={cx(
      'flex items-center gap-2.5 rounded-control px-2.5 py-2 transition-colors',
      locked ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-surface-2',
    )}>
      <input type="checkbox" checked={selected && !locked} disabled={locked} onChange={onToggle} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <span className="font-medium">{a.name}</span>
          {a.mask && <span className="text-muted">••{a.mask}</span>}
          <span className="text-[12px] text-muted">· {a.subtype ?? a.type}</span>
          {a.replaced ? <ReplacedBadge /> : a.imported ? <ImportedBadge /> : <DestBadge type={a.type} />}
        </span>
        {(a.apr != null || a.minimum_payment_amount != null || a.next_payment_due_date) && (
          <span className="mt-0.5 block text-[11.5px] text-muted">
            {a.apr != null ? `${a.apr}% APR` : ''}
            {a.apr != null && a.minimum_payment_amount != null ? ' · ' : ''}
            {a.minimum_payment_amount != null ? `${formatMoney(a.minimum_payment_amount)} minimum` : ''}
            {(a.apr != null || a.minimum_payment_amount != null) && a.next_payment_due_date ? ' · ' : ''}
            {a.next_payment_due_date ? `due ${a.next_payment_due_date}` : ''}
          </span>
        )}
      </span>
      <span className={cx('shrink-0 font-semibold tabular-nums', isDebtType(a.type) ? 'text-net-neg' : 'text-net-pos')}>
        {formatMoney(a.current ?? 0)}
      </span>
    </label>
  );
}

// Plaid credit/loan accounts become debts; everything else becomes a cash account.
function isDebtType(type: string): boolean {
  return type === 'credit' || type === 'loan';
}

/** Where this Plaid account would land if imported. */
function DestBadge({ type }: { type: string }) {
  const label = type === 'credit' ? 'Credit card' : type === 'loan' ? 'Loan' : 'Account';
  return <Pill tone={isDebtType(type) ? 'debt' : 'cash'}>{label}</Pill>;
}

function ReplacedBadge() {
  return (
    <Pill title="This card number was reissued; the imported debt now follows the new number" className="border-dashed">
      Replaced
    </Pill>
  );
}

function ImportedBadge() {
  return (
    <Pill className="gap-1">
      <Check size={12} strokeWidth={2.6} aria-hidden="true" />Imported
    </Pill>
  );
}

async function toastGuard(toast: ReturnType<typeof useToast>, fn: () => Promise<void>) {
  try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Something went wrong'); }
}
