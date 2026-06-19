# Art Direction — Photo treatments

Le traitement photo est le 2e levier (après la typo) qui distingue un site
senior. Stock photo brut sur site senior = échec immédiat. Ces recettes
unifient un set de photos hétérogène.

---

## Recettes par mood

### `.photo-warm` — Editorial / print

```css
.photo-warm { filter: saturate(0.85) sepia(0.06) contrast(1.05); }
```

Usage : sites éditoriaux, brands warm (terracotta, ember, ochre), photos
terrain/portraits. Le `sepia(0.06)` introduit une dominante chaude légère
sans virer au vintage.

### `.photo-cinema` — Dramatic / moody

```css
.photo-cinema { filter: saturate(0.7) contrast(1.1) brightness(0.96); }
```

Usage : brands sombres, hero moody, ambiance studio. Désature et contraste,
mais reste lisible.

### `.photo-bw` — Statement / minimal

```css
.photo-bw { filter: grayscale(1) contrast(1.08); }
```

Usage : portraits éditoriaux, statements visuels forts, archives. Un coup
de contraste pour compenser la perte tonale.

### `.photo-duotone` — Brand identity

```css
.photo-duotone {
  filter: grayscale(1) contrast(1.05);
  mix-blend-mode: multiply;
}
/* parent doit avoir une couleur de fond accent */
```

Usage : brand identity forte (Spotify-like), couvertures, headers. Combiner
avec un fond `--color-accent` et `mix-blend-mode`.

### `.photo-grain-cinema` — Film texture

```css
.photo-grain-cinema {
  filter: saturate(0.75) contrast(1.08);
}
.photo-grain-cinema::after {
  content: ""; position: absolute; inset: 0;
  background-image: url("data:image/svg+xml;..."); /* feTurbulence */
  opacity: 0.12; mix-blend-mode: overlay;
}
```

Usage : ajoute du grain photo (pas papier). Plus subtil que `.grain-paper`.

---

## Ratios cohérents

Max 2 ratios différents dans tout le site. Recommandations :

| Ratio | Usage | Pourquoi |
|---|---|---|
| 3/4 portrait | Portraits, citations | Print classic |
| 4/5 portrait | Hero photo, dominant | Sociale / IG-compatible |
| 1/1 square | Grilles produit, témoignages | Bento / collection |
| 16/9 landscape | Hero video, capture écran | Cinéma |
| 21/9 cinematic | Hero statement | Premium |

Anti-pattern : 5 ratios différents sur la home — donne un sentiment de "site
construit à l'arrache".

---

## Figcaption pattern

Senior = numérotation + italic courte.

```tsx
<figure>
  <Image src="..." className="object-cover photo-warm" />
  <figcaption className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 text-[0.72rem] text-ink/65">
    <span className="mono caps text-ember">Fig. 01</span>
    <span className="italic-wonky">La cohorte Impulsion, automne 2021.</span>
  </figcaption>
</figure>
```

Règles :
- `Fig. 01` en mono caps + couleur accent (ember/accent)
- Légende italic + axes variable (Fraunces WONK)
- Marge top discrète (mt-3)
- Couleur dimmed (ink/65)
- Aucune légende absente — si pas de légende, retirer le figcaption (jamais vide)

---

## Hero photo — composition rules

- **Subject hors-centre** (rule of thirds, ou même tiers gauche/droit)
- **Crop conscient** : laisser respirer, pas de cadrage têtes coupées
- **Profondeur** : flou de profondeur > photo plate, sauf brutalist explicite
- **Lumière directionnelle** : éviter flat lighting plein cadre
- **Pas de regard caméra** sauf intention statement (portraits exclusivement)

---

## Optimisation

```bash
# Convertir les sources en WebP haute qualité
sharp public/photos/raw/*.{jpg,png} --to public/photos/ --format webp --quality 82
```

Cibles :
- Hero : 1 image WebP ≤ 240KB (1920px width max)
- Body : 1 image WebP ≤ 100KB (1280px width max)
- Thumbs : 1 image WebP ≤ 40KB (640px width max)

Toujours `next/image` avec `sizes` correct + `placeholder="blur"` pour LCP.

---

## Anti-patterns photo

- Stock Unsplash visible (un visage trop "stocky", un meeting trop générique)
- Logo client incrusté en bas à droite de la photo (sauf legitime brand brief)
- Photos avec watermark résiduel
- 5+ ratios différents sur la même page
- Hero photo en `background-image` CSS (préférer `<Image>` Next.js)
- `<img>` natif sans `loading="lazy"`
- Pas de `alt` ou alt générique ("image")
