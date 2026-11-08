const mongoose = require('mongoose');

// ============================================================
// ✅ Compteurs atomiques (numéros de réparation, codes client...)
// Clé ex: "reparation:<boutiqueId>:2026"
// ============================================================
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * Renvoie le prochain numéro pour une clé.
 * Si le compteur n'existe pas encore, il est initialisé avec initFn()
 * (ex : nombre de documents existants) pour rester compatible avec
 * les données déjà présentes.
 */
Counter.next = async function (key, initFn) {
  const exists = await Counter.exists({ _id: key });
  if (!exists && typeof initFn === 'function') {
    const initial = Number(await initFn()) || 0;
    try {
      await Counter.create({ _id: key, seq: initial });
    } catch (err) {
      if (err.code !== 11000) throw err; // créé en parallèle : OK
    }
  }
  const doc = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
};

module.exports = Counter;
