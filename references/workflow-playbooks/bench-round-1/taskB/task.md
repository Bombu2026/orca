# Tâche B (feature multi-fichiers) — Cart
Dans `cart.ts`, exporte une classe `Cart` :
- addItem(id: string, priceCents: number, qty = 1) — accumule qty si même id
- removeItem(id) ; setQty(id, qty) — qty<=0 supprime l'item
- applyCoupon(code) — utilise getCoupon(code) de `coupons.ts` ; si null → throw Error("invalid coupon") ; sinon stocke le coupon actif
- subtotal() — somme priceCents*qty
- total() — applique le coupon actif au subtotal : percent → Math.round(subtotal*(100-value)/100) ; fixed → Math.max(0, subtotal - value). Sans coupon, total()===subtotal().
Import : `import { getCoupon } from "./coupons";`
