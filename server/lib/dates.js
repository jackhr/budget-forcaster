function normalizeDate(value, field, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) {
      const err = new Error(`${field} is required`);
      err.status = 400;
      throw err;
    }
    return null;
  }

  if (typeof value !== 'string') {
    const err = new Error(`${field} must be a date string`);
    err.status = 400;
    throw err;
  }

  const trimmed = value.trim();
  const monthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) return `${trimmed}-01`;

  const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    const err = new Error(`${field} must be YYYY-MM-DD or YYYY-MM`);
    err.status = 400;
    throw err;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  const valid =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day;

  if (!valid) {
    const err = new Error(`${field} is not a valid calendar date`);
    err.status = 400;
    throw err;
  }

  return trimmed;
}

function dateError(res, err) {
  if (err && err.status === 400) {
    res.status(400).json({ error: err.message });
    return true;
  }
  return false;
}

module.exports = { normalizeDate, dateError };
