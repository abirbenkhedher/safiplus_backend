const mongoose = require('mongoose');
const {
  getTenant,
  TenantError,
  BOUTIQUE_REQUIRED,
  BOUTIQUE_REQUIRED_MESSAGE,
  GLOBAL_READONLY,
  GLOBAL_READONLY_MESSAGE,
} = require('../../config/tenantContext');

// ============================================================
// ✅ PLUGIN MULTI-TENANT
// ------------------------------------------------------------
// scope = 'organisation' : données partagées par toutes les boutiques
//                          d'une organisation (clients, référentiels)
// scope = 'boutique'     : données propres à une boutique
//                          (réparations, stock, dépenses...)
// requireBoutique        : la boutique est obligatoire (sinon un document
//                          peut être "global" à l'organisation, ex: historique)
//
// Le plugin :
//  - ajoute les champs organisation / boutique
//  - filtre automatiquement TOUTES les requêtes (find, count, update,
//    delete, aggregate...) selon le contexte de la requête HTTP
//  - remplit organisation / boutique à la création
//  - interdit de modifier organisation / boutique via un update
//  - est "fail-closed" : sans contexte, la requête est refusée
// ============================================================

const QUERY_OPS = [
  'find',
  'findOne',
  'countDocuments',
  'distinct',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
];

const UPDATE_OPS = ['findOneAndUpdate', 'updateOne', 'updateMany'];
const WRITE_OPS = [
  'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
  'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany',
];

const globalReadOnlyError = () => new TenantError(GLOBAL_READONLY_MESSAGE, 403, GLOBAL_READONLY);
const TENANT_FIELDS = ['organisation', 'boutique'];

const sameId = (a, b) => a && b && String(a) === String(b);

module.exports = function tenantPlugin(schema, options = {}) {
  const scope = options.scope || 'organisation';
  const requireBoutique = !!options.requireBoutique;
  // globalDocs : boutique = null → document "global" de l'organisation
  // (ex : dépense administrative), visible UNIQUEMENT en vue globale (admin),
  // créé seulement sur demande explicite (doc.$locals.tenantGlobal = true).
  const globalDocs = !!options.globalDocs;
  // Données propres aux boutiques → lecture seule en vue globale
  // (les modèles à boutique facultative, ex : historique, messages, restent libres)
  const isBoutiqueScope = scope === 'boutique';
  const readOnlyInGlobal = isBoutiqueScope && (requireBoutique || globalDocs);

  schema.add({
    organisation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organisation',
      required: [true, "L'organisation est obligatoire"],
      index: true,
    },
  });

  if (isBoutiqueScope) {
    schema.add({
      boutique: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Boutique',
        required: requireBoutique ? [true, 'La boutique est obligatoire'] : false,
        default: null,
        index: true,
      },
    });
  }

  // ----------------------------------------------------------
  // Construit le filtre à appliquer (null = pas de filtrage)
  // ----------------------------------------------------------
  const buildFilter = () => {
    const ctx = getTenant();
    if (!ctx) {
      throw new TenantError('Contexte tenant manquant (requête non authentifiée).', 500);
    }
    if (ctx.system) return null;
    if (!ctx.organisation) {
      throw new TenantError('Aucune organisation associée à cet utilisateur.', 403);
    }

    const filter = { organisation: ctx.organisation };
    if (isBoutiqueScope) {
      const list = ctx.boutiques || [];
      const withNull = !requireBoutique && (!globalDocs || !!ctx.globalView);
      filter.boutique = withNull ? { $in: [...list, null] } : { $in: list };
    }
    return filter;
  };

  // ----------------------------------------------------------
  // Requêtes : filtrage automatique
  // ----------------------------------------------------------
  schema.pre(QUERY_OPS, { document: false, query: true }, function () {
    const filter = buildFilter();
    if (!filter) return;

    this.and([filter]);

    // ✅ Vue globale = consultation : écritures interdites sur les données des
    // boutiques ; seuls les documents globaux (boutique null) restent modifiables.
    if (readOnlyInGlobal && WRITE_OPS.includes(this.op) && getTenant().globalView) {
      if (!globalDocs) throw globalReadOnlyError();
      this.and([{ boutique: null }]);
    }

    // Interdire la modification des champs tenant via un update
    if (UPDATE_OPS.includes(this.op)) {
      const update = this.getUpdate();
      if (update) {
        for (const f of TENANT_FIELDS) {
          delete update[f];
          if (update.$set) delete update.$set[f];
          if (update.$unset) delete update.$unset[f];
          if (update.$setOnInsert) delete update.$setOnInsert[f];
        }
        if (this.getOptions().upsert) {
          const ctx = getTenant();
          update.$setOnInsert = update.$setOnInsert || {};
          update.$setOnInsert.organisation = ctx.organisation;
          if (isBoutiqueScope && ctx.boutique) update.$setOnInsert.boutique = ctx.boutique;
        }
        this.setUpdate(update);
      }
    }
  });

  // ----------------------------------------------------------
  // Agrégations : $match en tête de pipeline
  // ----------------------------------------------------------
  
  schema.pre('aggregate', function () {
    const filter = buildFilter();
    if (!filter) return;

    const pipeline = this.pipeline();
    const first = pipeline[0] ? Object.keys(pipeline[0])[0] : null;
    // Ces étapes doivent rester en première position
    const mustBeFirst = ['$geoNear', '$search', '$vectorSearch', '$collStats', '$indexStats'];
    if (mustBeFirst.includes(first)) {
      pipeline.splice(1, 0, { $match: filter });
    } else {
      pipeline.unshift({ $match: filter });
    }
  });

  // ----------------------------------------------------------
  // Création : remplissage organisation / boutique
  // ----------------------------------------------------------
  // ✅ Vue globale = consultation (création ET modification par doc.save())
  const assertWritable = function () {
    const ctx = getTenant();
    if (!readOnlyInGlobal || !ctx || ctx.system || !ctx.globalView) return;
    const globalDoc = globalDocs && (this.isNew ? !!this.$locals?.tenantGlobal : !this.boutique);
    if (!globalDoc) throw globalReadOnlyError();
  };
  schema.pre('validate', assertWritable);
  schema.pre('save', assertWritable);

  schema.pre('validate', function () {
    if (!this.isNew) return;

    const ctx = getTenant();
    if (!ctx) {
      throw new TenantError('Contexte tenant manquant (création non authentifiée).', 500);
    }
    if (ctx.system) return; // scripts : les champs sont fournis explicitement

    // L'organisation vient TOUJOURS du contexte (jamais du body)
    this.organisation = ctx.organisation;

    if (!isBoutiqueScope) return;

    if (globalDocs && this.$locals && this.$locals.tenantGlobal) {
      if (!ctx.globalView) {
        throw new TenantError(
          "Ce document global se crée uniquement en vue « Toutes les boutiques » (administrateur).",
          403
        );
      }
      this.boutique = null;
      return;
    }

    const allowed = ctx.allowed || ctx.boutiques || [];
    const provided = this.boutique;

    if (provided && allowed.some((b) => sameId(b, provided))) {
      return; // boutique fournie explicitement et autorisée
    }
    if (ctx.boutique) {
      this.boutique = ctx.boutique;
    } else if ((ctx.boutiques || []).length === 1) {
      this.boutique = ctx.boutiques[0];
    } else if (requireBoutique || globalDocs) {
      throw new TenantError(BOUTIQUE_REQUIRED_MESSAGE, 400, BOUTIQUE_REQUIRED);
    } else {
      this.boutique = null;
    }
  });
};
