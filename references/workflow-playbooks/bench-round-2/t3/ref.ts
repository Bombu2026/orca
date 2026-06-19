type Order = { items: { priceCents: number; qty: number }[]; coupon?: { type: "percent" | "fixed"; value: number }; loyaltyTier: "none" | "silver" | "gold" };
export function computeTotal(o: Order): number {
  const sub = o.items.reduce((a, i) => a + i.priceCents * i.qty, 0);
  let t = sub;
  if (o.coupon) t = o.coupon.type === "percent" ? Math.round(sub * (100 - o.coupon.value) / 100) : Math.max(0, sub - o.coupon.value);
  const loy = o.loyaltyTier === "gold" ? 10 : o.loyaltyTier === "silver" ? 5 : 0;
  t = Math.round(t * (100 - loy) / 100);
  const floor = Math.floor(sub * 0.5);
  if (t < floor) t = floor;
  return Math.max(0, t);
}
