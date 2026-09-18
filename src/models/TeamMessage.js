const mongoose = require('mongoose');

const teamMessageSchema = new mongoose.Schema({
  // Auteur du message
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Contenu du message
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },

  // Priorité (facultatif)
  priority: {
    type: String,
    enum: ['normal', 'urgent'],
    default: 'normal',
  },

  // Qui a lu le message
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    readAt: {
      type: Date,
      default: Date.now,
    },
  }],
}, {
  timestamps: true,
});

teamMessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('TeamMessage', teamMessageSchema);