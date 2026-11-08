// ============================================================
// ✅ Créer ou réinitialiser le compte SUPER_ADMIN (propriétaire de la plateforme)
//
// Usage :
//   npm run superadmin -- <identifiant> <mot_de_passe>
//
// - si un SUPER_ADMIN existe déjà : son identifiant et son mot de passe sont remplacés
// - sinon : le compte est créé
// Le mot de passe est chiffré (bcrypt) avant d'être enregistré.
// ============================================================
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error('Usage : npm run superadmin -- <identifiant> <mot_de_passe>');
  process.exit(1);
}
if (password.length < 6) {
  console.error('❌ Le mot de passe doit contenir au moins 6 caractères.');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // L'identifiant ne doit pas appartenir à un autre utilisateur
  const taken = await User.findOne({ username, role: { $ne: 'SUPER_ADMIN' } });
  if (taken) {
    console.error(`❌ L'identifiant "${username}" est déjà utilisé par un autre compte.`);
    process.exit(1);
  }

  let user = await User.findOne({ role: 'SUPER_ADMIN' });
  const existed = !!user;
  if (!user) {
    user = new User({ role: 'SUPER_ADMIN', firstName: 'Super', lastName: 'Admin' });
  }
  user.username = username;
  user.password = password; // chiffré par le hook pre('save') du modèle
  user.isActive = true;
  await user.save();

  console.log(
    existed
      ? `✅ Super admin mis à jour : identifiant "${username}", nouveau mot de passe enregistré.`
      : `✅ Super admin créé : identifiant "${username}".`
  );
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('❌ Erreur :', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
