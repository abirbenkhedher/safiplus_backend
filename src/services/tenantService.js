const mongoose = require('mongoose');
const Boutique = require('../models/Boutique');
const Organisation = require('../models/Organisation');

// ============================================================
// ✅ Helpers multi-tenant (utilisateurs / boutiques)
// ============================================================

const toId = (v) => (v ? String(v._id || v) : null);

/** Boutiques accessibles par un utilisateur (documents légers). */
const getUserBoutiques = async (user) => {
  if (!user) return [];
  // SUPER_ADMIN : toutes les boutiques de toutes les sociétés (avec le nom de la société)
  if (user.role === 'SUPER_ADMIN') {
    return Boutique.find()
      .select('nom code adresse telephone organisation isActive')
      .populate('organisation', 'nom')
      .sort({ nom: 1 })
      .lean();
  }
  if (!user.organisation) return [];
  const query = { organisation: user.organisation, isActive: true };
  if (!user.isOwner) query._id = { $in: user.boutiques || [] };
  return Boutique.find(query).select('nom code adresse telephone').sort({ nom: 1 }).lean();
};

/** Organisation de l'utilisateur (document léger). */
const getUserOrganisation = async (user) => {
  if (!user || !user.organisation) return null;
  return Organisation.findById(user.organisation).select('nom isActive').lean();
};

/**
 * Filtre Mongo sur la collection User selon le contexte de la requête :
 *  - toujours limité à l'organisation
 *  - limité aux utilisateurs des boutiques visibles (+ propriétaires)
 */
const userScopeFilter = (req) => {
  const t = req.tenant || {};
  if (t.system) return {};
  const visible = t.boutiques || [];
  return {
    organisation: t.organisation,
    $or: [
      { isOwner: true },
      { boutiques: { $in: visible } },
      { _id: req.user._id },
    ],
  };
};

/** Ne garde que les boutiques que l'utilisateur courant a le droit d'affecter. */
const sanitizeBoutiques = (req, ids) => {
  const allowed = (req.tenant?.allowed || []).map(String);
  const list = Array.isArray(ids) ? ids : ids ? [ids] : [];
  return [...new Set(list.map(toId).filter((id) => id && allowed.includes(id)))]
    .map((id) => new mongoose.Types.ObjectId(id));
};

// Propriétaire de l'organisation (ou SUPER_ADMIN, qui a tous les droits)
const isOwnerUser = (user) =>
  !!user && (user.role === 'SUPER_ADMIN' || (user.role === 'ADMIN' && !!user.isOwner));

module.exports = {
  getUserBoutiques,
  getUserOrganisation,
  userScopeFilter,
  sanitizeBoutiques,
  isOwnerUser,
  toId,
};
