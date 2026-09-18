const TeamMessage = require('../models/TeamMessage');
const logger = require('../config/logger');

// ============================================================
// GET - Liste des messages d'équipe (30 derniers)
// ============================================================
exports.getAll = async (req, res) => {
  try {
    const userId = req.user.id;

    const messages = await TeamMessage.find()
      .populate('author', 'firstName lastName role')
      .sort('-createdAt')
      .limit(50);

    // Ajouter isRead pour l'utilisateur courant
    const withRead = messages.map((m) => ({
      ...m.toObject(),
      isRead: m.readBy.some((r) => r.user?.toString() === userId),
      isMine: m.author?._id?.toString() === userId,
    }));

    const unreadCount = withRead.filter(
      (m) => !m.isRead && !m.isMine
    ).length;

    res.json({
      success: true,
      data: withRead,
      unreadCount,
    });
  } catch (error) {
    logger.error('Erreur getAll teamMessages:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// ============================================================
// POST - Envoyer un message à l'équipe
// ============================================================
exports.create = async (req, res) => {
  try {
    const { message, priority = 'normal' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Le message ne peut pas être vide',
      });
    }

    const newMessage = await TeamMessage.create({
      author: req.user.id,
      message: message.trim(),
      priority,
      readBy: [{ user: req.user.id, readAt: new Date() }], // L'auteur l'a "lu"
    });

    const populated = await TeamMessage.findById(newMessage._id)
      .populate('author', 'firstName lastName role');

    res.status(201).json({
      success: true,
      message: 'Message envoyé à l\'équipe',
      data: {
        ...populated.toObject(),
        isRead: true,
        isMine: true,
      },
    });
  } catch (error) {
    logger.error('Erreur create teamMessage:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// ============================================================
// PATCH - Marquer un message comme lu
// ============================================================
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const msg = await TeamMessage.findById(req.params.id);

    if (!msg) {
      return res.status(404).json({ success: false, message: 'Non trouvé' });
    }

    const alreadyRead = msg.readBy.some(
      (r) => r.user?.toString() === userId
    );

    if (!alreadyRead) {
      msg.readBy.push({ user: userId, readAt: new Date() });
      await msg.save();
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Erreur markAsRead:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// ============================================================
// PATCH - Marquer tous comme lus
// ============================================================
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    const unread = await TeamMessage.find({
      'readBy.user': { $ne: userId },
      author: { $ne: userId },
    });

    for (const msg of unread) {
      msg.readBy.push({ user: userId, readAt: new Date() });
      await msg.save();
    }

    res.json({ success: true, count: unread.length });
  } catch (error) {
    logger.error('Erreur markAllAsRead:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};

// ============================================================
// DELETE - Supprimer son propre message
// ============================================================
exports.delete = async (req, res) => {
  try {
    const msg = await TeamMessage.findById(req.params.id);

    if (!msg) {
      return res.status(404).json({ success: false, message: 'Non trouvé' });
    }

    // Seul l'auteur (ou admin) peut supprimer
    if (msg.author.toString() !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé',
      });
    }

    await msg.deleteOne();
    res.json({ success: true, message: 'Message supprimé' });
  } catch (error) {
    logger.error('Erreur delete teamMessage:', error);
    res.status(500).json({ success: false, message: 'Erreur' });
  }
};