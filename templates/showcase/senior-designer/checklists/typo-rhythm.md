# Typographic Rhythm — Senior rules

Le rythme typographique distingue un site amateur d'un site senior bien plus
que les fonts choisies. Voici les règles auditables.

---

## Modular scale

Choisir un ratio et l'imposer. Pas de tailles random.

| Ratio | Nom | Usage |
|---|---|---|
| 1.200 | Minor third | Sites denses (SaaS, blog) |
| 1.250 | Major third | **Défaut** showcase, équilibre lisibilité/drama |
| 1.333 | Perfect fourth | Plus dramatique, agence créative |
| 1.414 | Augmented fourth (√2) | Editorial / print-inspired |
| 1.618 | Golden ratio | Brand/luxury, rares moments hero |

Pour 1.250 base 16px : 13 · 16 · 20 · 25 · 31 · 39 · 49 · 61 · 76 · 95.
Mapper sur CSS tokens `--text-xs`, `--text-sm`, `--text-base`, `--text-lg`,
`--text-xl`, `--text-2xl`, etc.

---

## Hierarchy par section

Une section type :

```
[Kicker mono caps]       — 0.7rem · letter-spacing 0.22em
[Display title]          — 3-7rem · line-height 0.9-1.05 · letter-spacing -0.04em
[Subhead optional]       — 1.2-1.8rem · line-height 1.25 · serif-italic
[Body]                   — 1rem-1.1rem · line-height 1.55-1.7
[Metadata / caption]     — 0.7-0.85rem · mono · caps · color-ink/65
```

Jamais : display > 6rem dans une section autre que le hero. Jamais : 3 niveaux
de display visibles dans le même viewport.

---

## Line-length

- **Body** : 60-75 caractères par ligne (≈ `max-w-prose` ou `max-w-[65ch]`)
- **Display** : pas de limite stricte, mais break-line manuel (`<br>` ou `SplitLines`) pour contrôler le rythme
- **Captions / kickers** : 1 ligne idéalement, max 2

Tailwind : `max-w-prose` ≈ 65ch. Pour les colonnes éditoriales, `max-w-[28rem]` à `max-w-[36rem]`.

---

## Letter-spacing par usage

| Usage | Spacing | Pourquoi |
|---|---|---|
| Display serif | -0.02 à -0.05em | Compense l'opsz large, resserre la silhouette |
| Display sans bold | -0.01 à -0.02em | Compense l'inertie visuelle |
| Body | 0 (default) | Lisibilité avant tout |
| Caps mono | 0.18 à 0.24em | Évite la fusion glyphique |
| Small caps | 0.04 à 0.08em | Plus tight que caps full |

---

## Italic discipline

Italic n'est pas juste pour emphasize un mot. C'est un outil rythmique :

- **Pull-quote** dans le body — italique long passage
- **Ponctuation visuelle** dans un titre — un mot italique au milieu d'un display roman ("Quatre semaines *pour* changer")
- **Metadata premium** — figcaption en italique court (`Premier bilan, automne 2021`)
- **Author / sigle** — fin de citation

Avec Fraunces : utiliser `SOFT` axis pour adoucir l'italic, `WONK` axis pour
glyphes alternatifs (g, k, y). Le combo italic + WONK = signature éditoriale.

---

## Mono usage

Le mono (Geist Mono, JetBrains Mono, IBM Plex Mono) sert à :

- **Kickers / numérotation** (`N° 04`, `Fig. 01`, `02 —`)
- **Métadonnées** (date, lieu, version)
- **Code / data** (évident)

Jamais : mono pour titres principaux ou body long. Mono est une **épice**, pas
un plat principal.

---

## Line-breaking — veuves & orphelines (NON NÉGOCIABLE)

Le tell n°1 d'une mise en page non-humaine : un mot court (pronom, article,
préposition) abandonné en fin de ligne alors que sa phrase continue à la ligne
suivante (« …se choisit séparément. Vous / prenez seulement… »). Aucun
typographe ne livre ça. Règle complète : `references/typography-2026.md`
§ Line-breaking.

- `globals.css` : `body { text-wrap: pretty }` + `h1,h2,h3 { text-wrap: balance }`.
- Titres / sous-titres / intros courtes (≤ 3 lignes) → classe `text-balance`.
- Paragraphes longs (≥ 4 lignes) → `text-pretty`.
- Couture interdite de cassure → espace insécable ` ` (`Vous prenez`) ou
  `white-space: nowrap`.
- FR : insécable avant `: ; ! ?` et `»`, après `«`, entre nombre et unité
  (`750 €`, `2 à 3 jours`). Apostrophe `’`, jamais `'`.
- **Passe finale obligatoire** : lire chaque ligne *rendue* (screenshot aux
  largeurs réelles). Une ligne qui finit par un mot-outil de 1–4 lettres
  appartenant à la suivante = défaut à corriger.

---

## Verdict typo (subset de design-review)

- [ ] Modular scale identifiable
- [ ] Hierarchy claire kicker → display → body → meta
- [ ] Italic utilisé > 0 fois, pas juste emphasis
- [ ] Letter-spacing négatif sur display, positif sur caps mono
- [ ] Body line-height entre 1.5 et 1.7
- [ ] Aucun bloc body > 80ch
- [ ] Aucune section avec 3 niveaux de display dans le même viewport
- [ ] `globals.css` : `text-wrap: pretty` (body) + `balance` (titres)
- [ ] Titres / sous-titres ≤ 3 lignes en `text-balance`
- [ ] Aucune ligne finissant par un mot-outil orphelin (le / la / de / et / à / Vous…)
- [ ] FR : insécables avant ponctuation double et dans les guillemets
