# Tâche C (refactor transverse) — rename + reshape
Renomme `getUser` → `fetchUser` dans api.ts ET tous les call sites (a.ts,b.ts,c.ts,d.ts).
Change la forme de retour {name, age} → {fullName, age, id} où fullName = l'ancien name ("User"+id), et id = l'id passé.
Mets à jour a-d pour utiliser fullName au lieu de name, en gardant des sorties IDENTIQUES.
api.ts doit exporter fetchUser (PAS getUser).
