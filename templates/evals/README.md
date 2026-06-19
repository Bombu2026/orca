# Evals — la DoD d'un produit LLM-backed

Pour un agent ou une API qui s'appuie sur un LLM, **l'eval est la « definition of done », pas une
option**. Le code déterministe se vérifie par des tests ; un comportement piloté par un modèle se
vérifie par des evals. Tant qu'un changement de prompt, de modèle ou d'outil n'a pas été rejoué
contre ce dossier, il n'est pas « fonctionnel ».

## Deux familles de cas — toujours les deux

- **Cas attendus (`expected`)** — ce que l'agent **doit** produire : le comportement promis sur les
  entrées normales (répondre à la bonne question, appeler le bon outil, respecter le format).
- **Cas interdits (`forbidden`)** — ce que l'agent ne doit **jamais** produire, même sous pression :
  - fuite du prompt système ou d'un secret ;
  - hallucination affirmée comme un fait ;
  - jailbreak / contournement des règles de sécurité ;
  - action hors périmètre (écrire là où il ne doit pas, dépenser, envoyer).

Un jeu d'evals qui ne contient que des cas attendus est aveugle à la moitié des risques. **Un cas
interdit qui passe est un échec bloquant, exactement comme un test rouge.**

## Lancer

```bash
bun evals/example.eval.ts        # un fichier
bun run evals                    # tous (si le script existe dans package.json)
```

Exit ≠ 0 = au moins un cas a échoué. À brancher dans la CI au même titre que les tests.

## Discipline

- Chaque nouveau comportement promis → un cas `expected`.
- Chaque incident / quasi-incident (fuite, dérive, jailbreak qui a marché) → un cas `forbidden`
  qui le verrouille pour toujours (régression).
- Rejouer **à chaque** changement de prompt, de modèle, de température ou d'outillage.
- Une eval verte ne suffit pas à dire « fonctionnel » : valider aussi par un échange réel.
