// Single config point for money formatting across the app.

export interface CurrencyOption {
  code: string;
  label: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'USD', label: 'USD ($)' },
  { code: 'EUR', label: 'EUR (€)' },
  { code: 'GBP', label: 'GBP (£)' },
  { code: 'CAD', label: 'CAD ($)' },
  { code: 'AUD', label: 'AUD ($)' },
  { code: 'JPY', label: 'JPY (¥)' },
];

let _currency = 'USD';
const _locale = 'en-US';

export function setCurrency(code: string) {
  if (code) _currency = code;
}

export function getCurrency() {
  return _currency;
}

// Currencies that conventionally have no minor unit.
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);

export function formatMoney(n: number, opts: { whole?: boolean } = {}): string {
  const zeroDecimal = ZERO_DECIMAL.has(_currency);
  // `whole` forces no decimals; otherwise let the currency's own convention decide.
  const fractionDigits = opts.whole || zeroDecimal ? 0 : 2;
  return new Intl.NumberFormat(_locale, {
    style: 'currency',
    currency: _currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
}

// Signed with an explicit leading +/- (for deltas).
export function formatSignedMoney(n: number, opts: { whole?: boolean } = {}): string {
  const sign = n >= 0 ? '+' : '-';
  return sign + formatMoney(Math.abs(n), opts);
}

// Compact form for chart axes, e.g. "$5K".
export function formatCompactMoney(n: number): string {
  return new Intl.NumberFormat(_locale, {
    style: 'currency',
    currency: _currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}
