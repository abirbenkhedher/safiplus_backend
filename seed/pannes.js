// seed/pannes.js
// ============================================================
// ✅ PANNES PAR CATÉGORIE
// ============================================================
// Structure :
//   - Chaque clé = NOM de la catégorie (doit correspondre exactement)
//   - Chaque valeur = tableau de noms de pannes (ordre respecté)

module.exports = {
  // ============================================================
  // GSM
  // ============================================================
  'GSM-AUTRE': [
    'Autre problème GSM',
    'Ne s\'allume pas',
    'Bluetooth HS',
    'Wifi HS',
    'Réseau HS',
    'Haut-parleur HS',
    'Micro HS',
    'Vibreur HS',
    'Boutons HS',
    'Caméra HS',
  ],

  'GSM-Hard': [
    'Écran cassé',
    'Tactile HS',
    'Batterie HS',
    'Connecteur de charge HS',
    'Caméra avant HS',
    'Caméra arrière HS',
    'Haut-parleur HS',
    'Micro HS',
    'Bouton Power HS',
    'Boutons volume HS',
    'Vibreur HS',
    'Désoxydation / Dégât d\'eau',
    'Châssis / Coque abîmé',
    'Vitre arrière cassée',
  ],

  'GSM-SOFT': [
    'Blocage',
    'Virus / Malware',
    'Système corrompu',
    'Écran noir logiciel',
    'Redémarrage en boucle',
    'Lent / Performance',
    'Bootloop',
    'Compte Google bloqué (FRP)',
    'IMEI invalide',
    'Mise à jour échouée',
    'Applications qui plantent',
    'Wifi logiciel HS',
    'Réseau logiciel HS',
  ],

  'GSM-LCD': [
    'Écran cassé (vitre)',
    'LCD endommagé',
    'Tactile HS',
    'Pixels morts',
    'Taches / Lignes',
    'Écran noir (LCD mort)',
    'Rétroéclairage HS',
  ],

  // ============================================================
  // VENTE
  // ============================================================
  'VENTE GSM OCCASION': [
    'État neuf',
    'Très bon état',
    'Bon état',
    'État correct',
    'Retour client',
    'Accessoires manquants',
  ],

  'VENTE PC OCCASION': [
    'État neuf',
    'Très bon état',
    'Bon état',
    'État correct',
    'Retour client',
    'Accessoires manquants',
  ],

  // ============================================================
  // INFORMATIQUE
  // ============================================================
  'INFORMATIQUE-HARD': [
    'Écran cassé',
    'Clavier HS',
    'Touchpad HS',
    'Batterie HS',
    'Chargeur HS',
    'Connecteur de charge HS',
    'Disque dur HS',
    'RAM HS',
    'Carte mère HS',
    'Ventilateur HS',
    'Surchauffe',
    'USB HS',
    'HDMI HS',
    'Jack audio HS',
    'Webcam HS',
    'Haut-parleur HS',
    'Désoxydation / Dégât d\'eau',
    'Charnières cassées',
  ],

  'INFORMATIQUE-SOFT': [
    'Windows corrompu',
    'Virus / Malware',
    'Écran bleu (BSOD)',
    'Ne démarre pas',
    'Lent / Performance',
    'Pilotes manquants',
    'Mise à jour échouée',
    'Compte Windows bloqué',
    'Données perdues',
    'Réinitialisation nécessaire',
    'Logiciel qui plante',
    'Connexion réseau HS',
    'Wifi logiciel HS',
  ],

  'INFORMATIQUE-AUTRE': [
    'Autre problème info',
    'Nettoyage',
    'Installation logiciel',
    'Sauvegarde données',
    'Maintenance préventive',
  ],

  // ============================================================
  // ELECTRONIQUE
  // ============================================================
  'ELECTRONIQUE': [
    'Ne s\'allume pas',
    'Fusible grillé',
    'Court-circuit',
    'Composant grillé',
    'Surchauffe',
    'Bruit anormal',
    'Écran HS',
    'Bouton HS',
    'Télécommande HS',
    'Connecteur HS',
    'Désoxydation / Dégât d\'eau',
    'Alimentation HS',
  ],

  // ============================================================
  // RECEPTEUR BEIN
  // ============================================================
  'recepteur bein': [
    'Ne s\'allume pas',
    'Signal perdu',
    'Chaînes absentes',
    'Abonnement expiré',
    'Carte non reconnue',
    'Télécommande HS',
    'HDMI HS',
    'Connecteur alimentation HS',
    'Firmware corrompu',
    'Sur-échauffement',
  ],
};