import { getCoupon, type Coupon } from "./coupons";
export class Cart {
  private items = new Map<string, { price: number; qty: number }>();
  private coupon: Coupon | null = null;
  addItem(id: string, priceCents: number, qty = 1) { const e = this.items.get(id); if (e) e.qty += qty; else this.items.set(id, { price: priceCents, qty }); }
  removeItem(id: string) { this.items.delete(id); }
  setQty(id: string, qty: number) { if (qty <= 0) { this.items.delete(id); return; } const e = this.items.get(id); if (e) e.qty = qty; }
  applyCoupon(code: string) { const c = getCoupon(code); if (!c) throw new Error("invalid coupon"); this.coupon = c; }
  subtotal() { let s = 0; for (const e of this.items.values()) s += e.price * e.qty; return s; }
  total() { const sub = this.subtotal(); if (!this.coupon) return sub; return this.coupon.type === "percent" ? Math.round(sub * (100 - this.coupon.value) / 100) : Math.max(0, sub - this.coupon.value); }
}
