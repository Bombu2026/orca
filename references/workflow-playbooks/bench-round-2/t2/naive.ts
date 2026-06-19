export function nextBillingDate(startISO: string, months: number): string {
  const d = new Date(startISO);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
