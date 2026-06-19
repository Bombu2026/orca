# Tâche A (bug fix) — parsePrice
Exporte `parsePrice(input: string): number` depuis `price.ts`.
Règle DÉTERMINISTE : le séparateur décimal est le DERNIER caractère '.' ou ',' présent ;
tout le reste (autres séparateurs, espaces, symboles devise, lettres sauf signe '-') est retiré.
Retourne NaN si aucun chiffre. Ne change pas la signature.
Exemples : "1,234.56"→1234.56 · "1.000,50"→1000.5 · "€1 234,56"→1234.56 · "-12.50"→-12.5 · "12,50"→12.5 · "abc"→NaN
