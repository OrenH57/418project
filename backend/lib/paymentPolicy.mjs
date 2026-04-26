// File purpose:
// Shared payment rules so forms cannot change the locked base delivery payment.

export function parseOptionalTip(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, amount: 0 };
  }

  const normalizedValue = String(value).trim();

  if (!/^\d+(\.\d{1,2})?$/.test(normalizedValue)) {
    return {
      ok: false,
      error: "Tips can use dollars and cents, up to two decimal places.",
    };
  }

  const amount = Number(normalizedValue);

  if (!Number.isFinite(amount) || amount < 0) {
    return {
      ok: false,
      error: "Tips can use dollars and cents, up to two decimal places.",
    };
  }

  return { ok: true, amount: Number(amount.toFixed(2)) };
}

export function formatPaymentAmount(amount) {
  return Number(amount).toFixed(2);
}

export function buildPaymentTotal(basePayment, tipAmount = 0) {
  return Number((Number(basePayment) + Number(tipAmount)).toFixed(2));
}

export function getStoredPaymentBase(requestRecord) {
  if (Number.isFinite(Number(requestRecord?.basePayment))) {
    return Number(requestRecord.basePayment);
  }

  const payment = Number.parseFloat(requestRecord?.payment || "0");
  const tip = Number.isFinite(Number(requestRecord?.tipAmount)) ? Number(requestRecord.tipAmount) : 0;

  return Number((payment - tip).toFixed(2));
}
