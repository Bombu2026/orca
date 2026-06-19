export function nextBillingDate(startISO: string, months: number): string {
  const d = new Date(startISO + "T00:00:00Z");
  const day = d.getUTCDate();
  const y = d.getUTCFullYear(); const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay))).toISOString().slice(0, 10);
}
