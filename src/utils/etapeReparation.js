// ============================================================
// ✅ Étape d'une réparation d'après le LIBELLÉ de son statut
// (le champ Status.isTerminal n'est pas fiable dans les données existantes)
//   - en_cours : « EN COURS », « SAV EN COURS »…           → à traiter
//   - terminee : « REPARE », « NON REPARE », « SAV REPARE »  → prête à livrer
//   - livree   : « SORTIE … », « LIVRE »                    → rendue au client
// ============================================================
const norm = (label) =>
  String(label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();

const etapeReparation = (label) => {
  const l = norm(label);
  if (l.includes('SORTIE') || l.includes('LIVRE')) return 'livree';
  if (l.includes('REPARE')) return 'terminee';
  return 'en_cours';
};

module.exports = { etapeReparation, normLabel: norm };
