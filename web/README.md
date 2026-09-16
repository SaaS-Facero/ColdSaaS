# ColdTrend — funnel avec auth invisible

Ce code n'a pas pu être installé/compilé/exécuté dans l'environnement où il a
été écrit (pas de Node.js/npm disponible) — voir avertissement dans la
réponse qui l'accompagne. Avant de l'utiliser :

```bash
cd web
npm install
cp .env.example .env.local   # puis remplir avec un vrai projet Supabase
npm run dev
```

Côté Supabase (dashboard du projet) :
1. Activer les connexions anonymes : Authentication → Settings → "Allow
   anonymous sign-ins".
2. Activer le provider Google : Authentication → Providers → Google
   (client ID/secret), et ajouter `<votre-domaine>/auth/callback` aux
   redirect URLs autorisées.
3. Appliquer la migration `supabase/migrations/0002_profiles_anonymous_auth.sql`
   (`supabase db push` ou copier/coller dans le SQL editor).
4. Vérifier le trigger : créer un utilisateur de test
   (`supabase.auth.signInAnonymously()` depuis la console) et confirmer
   qu'une ligne apparaît dans `profiles` avec le même `id`.

Le job de purge RGPD (comptes anonymes inactifs 30 jours, cf. commentaire en
fin de migration) n'est pas inclus ici : c'est une Edge Function + `pg_cron`
à créer côté projet Supabase, hors scope de ce livrable frontend.
