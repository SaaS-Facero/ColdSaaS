// TODO: remplacer par le vrai texte légal (mentions RGPD complètes,
// coordonnées du responsable de traitement, durée de conservation exacte,
// droits d'accès/suppression) avant tout déploiement en production.
export default function ConfidentialitePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-white/90">
      <h1 className="mb-6 text-2xl font-bold">Politique de confidentialité</h1>
      <p className="mb-4 text-steel">
        Ton email sert uniquement à t&apos;envoyer ton résultat et l&apos;accès
        après paiement — aucune newsletter, aucun partage à des tiers.
      </p>
      <p className="text-steel">
        Tu peux demander la suppression de tes données à tout moment en
        répondant à l&apos;email reçu. Les comptes créés anonymement et jamais
        sécurisés (mot de passe ou Google) sont automatiquement supprimés
        après 30 jours d&apos;inactivité.
      </p>
    </main>
  );
}
