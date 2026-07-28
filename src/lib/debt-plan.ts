export type DebtPlanItem = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minimum: number;
  promotionalEndDate: string;
};

export type DebtStrategy = "avalanche" | "snowball";

export function canReceiveOverpayment(debt: DebtPlanItem) {
  return debt.apr > 0 || Boolean(debt.promotionalEndDate);
}

export function orderDebts<T extends DebtPlanItem>(debts: T[], strategy: DebtStrategy) {
  return [...debts].sort((a, b) => {
    const eligibilityDifference = Number(canReceiveOverpayment(b)) - Number(canReceiveOverpayment(a));
    if (eligibilityDifference) return eligibilityDifference;
    if (!canReceiveOverpayment(a)) return a.balance - b.balance;
    return strategy === "avalanche" ? b.apr - a.apr || a.balance - b.balance : a.balance - b.balance;
  });
}

export function overpaymentCapacity(debts: DebtPlanItem[]) {
  return debts
    .filter(canReceiveOverpayment)
    .reduce((sum, debt) => sum + Math.max(0, debt.balance - debt.minimum), 0);
}

export function allocateDebtOverpayment(
  debts: DebtPlanItem[],
  strategy: DebtStrategy,
  extra: number
) {
  let remaining = Math.max(0, extra);
  const allocations: Array<{ id: string; name: string; amount: number }> = [];

  for (const debt of orderDebts(debts.filter(canReceiveOverpayment), strategy)) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, Math.max(0, debt.balance - debt.minimum));
    if (amount > 0) allocations.push({ id: debt.id, name: debt.name, amount });
    remaining = Math.max(0, remaining - amount);
  }

  return { allocations, unallocated: remaining };
}
