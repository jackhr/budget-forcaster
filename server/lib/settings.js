// Validation for app_settings writes.
//
// Settings are a per-user key/value store, so the route is the only place that
// can keep a nonsense value out of the database. Keys we know get checked;
// anything else is stored as-is, as it was before this existed.
//
// HOME_LAYOUTS must match the ids in src/lib/homeLayout.ts — settings.test.mjs
// asserts the two agree, since a layout the client offers but the server
// rejects would fail silently on save.

const HOME_LAYOUTS = ['runway', 'balance', 'month', 'payoff', 'goal'];
const DEBT_STRATEGIES = ['none', 'avalanche', 'snowball'];

const oneOf = (allowed) => (value) =>
  allowed.includes(value) ? null : `must be one of: ${allowed.join(', ')}`;

const number = (value) =>
  Number.isFinite(Number(value)) ? null : 'must be a number';

const VALIDATORS = {
  home_layout: oneOf(HOME_LAYOUTS),
  debt_strategy: oneOf(DEBT_STRATEGIES),
  inflation_rate: number,
  debt_extra: number,
  starting_balance: number, // legacy, superseded by accounts
  currency: (value) => (/^[A-Za-z]{3}$/.test(value) ? null : 'must be a 3-letter currency code'),
};

/** The reason this value isn't allowed for this key, or null if it is. */
function settingError(key, value) {
  const validate = VALIDATORS[key];
  return validate ? validate(value) : null;
}

module.exports = { HOME_LAYOUTS, DEBT_STRATEGIES, settingError };
