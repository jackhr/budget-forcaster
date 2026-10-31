// View preferences persisted in localStorage.
//
// A stored id outlives the code that wrote it: someone who used the app last
// week has ids from last week's build. Casting a raw string to a union type is
// a lie that surfaces as a crash on their next visit, so every read is
// validated against the ids that exist *now*.

/** The stored value if it's still a legal id, otherwise the fallback. */
export function pickStored<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/**
 * Tabs that existed before Forecast / Savings / Net Worth / Overview were
 * folded into one Projections page. Mapping them carries the user's last
 * choice over instead of dumping them on Home.
 */
export const LEGACY_TABS: Record<string, { tab: string; view: string }> = {
  forecast: { tab: 'projections', view: 'cashflow' },
  savings: { tab: 'projections', view: 'savings' },
  networth: { tab: 'projections', view: 'networth' },
  overview: { tab: 'projections', view: 'overview' },
};

export interface ResolvedTab {
  tab: string;
  /** Set only when a legacy tab implies which projection to show. */
  view: string | null;
}

export function resolveTab(
  raw: string | null,
  allowed: readonly string[],
  fallback: string,
): ResolvedTab {
  if (raw !== null && allowed.includes(raw)) return { tab: raw, view: null };
  const legacy = raw !== null ? LEGACY_TABS[raw] : undefined;
  if (legacy && allowed.includes(legacy.tab)) return { tab: legacy.tab, view: legacy.view };
  return { tab: fallback, view: null };
}
