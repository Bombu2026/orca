# AI-slop grep — patterns à chasser

Exécutable via `scripts/ai-slop-grep.sh <project>`. Chaque pattern a une pénalité
associée. Total ≥ 10 → site bloqué pour ship.

| Pattern | Penalty | Pourquoi c'est de l'AI-slop |
|---|---|---|
| `rounded-lg` | 2 | Radius identique sur tout (8px). Vrai design varie button 6 / card 12 / image 0 |
| `shadow-md` | 2 | Elevation flat. Senior = 3 niveaux (flat / card / hover) avec valeurs distinctes |
| `Get started` | 2 | CTA générique. Le copy doit nommer l'action concrète ("Embaucher avec Impulsion", "Lire le programme") |
| `Lorem ipsum` | 4 | Placeholder résiduel. Bloquant. |
| `Your tagline` / `Your headline here` | 4 | Placeholder résiduel. Bloquant. |
| `from-purple-` / `to-purple-` | 3 | Le gradient mauve/violet est la signature LLM #1 |
| `bg-gradient-to-br from-blue` | 2 | Combo générique SaaS 2020 |
| `lucide-react.*Sparkles` | 1 | Sparkles icon utilisée sans raison sémantique |
| `lucide-react.*Zap` | 1 | Zap icon idem |
| `lucide-react.*Rocket` | 1 | Rocket icon idem |
| `lucide-react.*Star` | 1 | Star idem (sauf vrai rating) |
| `min-h-screen flex items-center justify-center` repeated | 3 | Toutes sections 100vh centrées = rythme plat |
| `Trusted by` puis chiffre placeholder | 2 | Social proof bidon |
| `Built with love` / `Made with love` | 1 | Footer cliché |
| `font-family.*Inter` dans display | 2 | Inter = SaaS-corporate-safe, pas premium en 2026 |

## Comment runner

```bash
bash scripts/ai-slop-grep.sh path/to/your/site
```

Sortie :
- liste des hits avec 3 lignes de contexte
- total penalty
- verdict OK / GAPS / BLOCKED

## Hook recommandé

Pre-commit hook qui bloque si penalty ≥ 4 :

```bash
# .husky/pre-commit ou .git/hooks/pre-commit
bash scripts/ai-slop-grep.sh . || exit 1
```
