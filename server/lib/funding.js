const VALID_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annually', 'one-time'];
const { normalizeDate } = require('./dates');

function isAmount(v) {
  return typeof v === 'number' && isFinite(v);
}

function cleanAllocations(input, { allowDebt = true } = {}) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const a of input) {
    if (!a || (a.source_type !== 'account' && (a.source_type !== 'debt' || !allowDebt))) continue;
    if (a.alloc_type !== 'percent' && a.alloc_type !== 'fixed') continue;
    if (!isAmount(a.value) || a.value < 0) continue;
    out.push({
      source_type: a.source_type,
      source_id: a.source_id == null ? null : Number(a.source_id),
      alloc_type: a.alloc_type,
      value: a.value,
    });
  }
  return out;
}

function cleanFundingRules(input, { allowDebt = true } = {}) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const r of input) {
    const clean = cleanAllocations([r], { allowDebt })[0];
    if (!clean) continue;
    out.push({
      ...clean,
      frequency: VALID_FREQUENCIES.includes(r.frequency) ? r.frequency : 'monthly',
      start_date: normalizeDate(r.start_date, 'rule.start_date'),
      end_date: normalizeDate(r.end_date, 'rule.end_date'),
    });
  }
  return out;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = { cleanAllocations, cleanFundingRules, parseJsonArray };
