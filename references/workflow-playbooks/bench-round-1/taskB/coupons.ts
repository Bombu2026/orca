export type Coupon = { type: "percent" | "fixed"; value: number };
const TABLE: Record<string, Coupon> = { SAVE10: { type: "percent", value: 10 }, MINUS500: { type: "fixed", value: 500 }, HALF: { type: "percent", value: 50 } };
export function getCoupon(code: string): Coupon | null { return TABLE[code] ?? null; }
