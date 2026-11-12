const Reparation = require('../models/Reparation');

// ✅ Statistiques de réparation de plusieurs clients en UNE requête (au lieu d'une
//    requête par client : 10 000 clients = 10 000 requêtes auparavant).
// Retourne Map(idClient → { totalReparations, totalPaye, totalRestant, lastReparation }).
const statsParClient = async (ids) => {
  const map = new Map();
  if (!ids || ids.length === 0) return map;
  const rows = await Reparation.aggregate([
    { $match: { client: { $in: ids }, isDeleted: false } },
    {
      $group: {
        _id: '$client',
        totalReparations: { $sum: 1 },
        totalPaye: { $sum: { $ifNull: ['$acompte', 0] } },
        totalRestant: { $sum: { $subtract: [{ $ifNull: ['$prix', 0] }, { $ifNull: ['$acompte', 0] }] } },
        lastReparation: { $max: '$createdAt' },
      },
    },
  ]);
  rows.forEach((r) => map.set(String(r._id), r));
  return map;
};

const VIDE = { totalReparations: 0, totalPaye: 0, totalRestant: 0, lastReparation: null };

/** Ajoute les statistiques à une liste de clients (objets simples ou documents). */
const avecStats = async (clients) => {
  const plain = clients.map((c) => (typeof c.toObject === 'function' ? c.toObject() : c));
  const map = await statsParClient(plain.map((c) => c._id).filter(Boolean));
  return plain.map((c) => {
    const s = map.get(String(c._id)) || VIDE;
    return {
      ...c,
      totalReparations: s.totalReparations,
      totalPaye: s.totalPaye,
      totalRestant: s.totalRestant,
      lastReparation: s.lastReparation || null,
    };
  });
};

module.exports = { statsParClient, avecStats };
