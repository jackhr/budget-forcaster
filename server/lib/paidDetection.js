// Detects whether a Plaid-linked debt's payment for a month (YYYY-MM) was made.
// Pure apart from `findPaymentTxn(month)`, which returns the first payment
// transaction posted to the debt's account that month ({date, amount}) or null.
// Returns a short human-readable reason when detected, else null.

function parseDate(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function detectDebtPayment(debt, month, findPaymentTxn = () => null) {
  const amount = debt.last_payment_amount != null ? ` $${debt.last_payment_amount}` : '';

  // 1. Liabilities report a payment made this month.
  if (debt.last_payment_date && debt.last_payment_date.startsWith(month)) {
    return `Plaid: paid${amount} on ${debt.last_payment_date}`;
  }

  // 2. Paid early. The card has moved on to a due date after this month, and the
  //    due date that fell in this month was covered by a payment within 30 days
  //    before it. (A payment older than that belongs to the previous due date.)
  if (debt.next_payment_due_date && debt.last_payment_date && debt.next_payment_due_date.slice(0, 7) > month) {
    const next = parseDate(debt.next_payment_due_date);
    const daysInPrevMonth = new Date(next.getFullYear(), next.getMonth(), 0).getDate();
    const thisDue = new Date(next.getFullYear(), next.getMonth() - 1, Math.min(next.getDate(), daysInPrevMonth));
    if (isoDate(thisDue).startsWith(month)) {
      const windowStart = new Date(thisDue);
      windowStart.setDate(windowStart.getDate() - 30);
      if (parseDate(debt.last_payment_date) >= windowStart) {
        return `Plaid: paid${amount} on ${debt.last_payment_date} for the ${isoDate(thisDue)} due date`;
      }
    }
  }

  // 3. A payment transaction posted to the linked account this month.
  const txn = findPaymentTxn(month);
  if (txn) return `Plaid: payment of $${Math.abs(txn.amount)} posted ${txn.date}`;
  return null;
}

module.exports = { detectDebtPayment };
