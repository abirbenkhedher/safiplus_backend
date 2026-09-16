const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// ✅ Modules disponibles (avec :read pour lecture seule)
const AVAILABLE_MODULES = [
  'dashboard',
  'clients',
  'reparations',
  'paiements',
  'familles',
  'familles:read',
  'categories',
  'categories:read',
  'objets',
  'objets:read',
  'statuses',
  'statuses:read',
  'users',
  'history',
];

// ✅ Permissions par défaut
const DEFAULT_PERMISSIONS = {
  ADMIN: [
    'dashboard', 'clients', 'reparations', 'paiements',
    'familles', 'categories', 'objets', 'statuses',
    'users', 'history',
  ],
  COMMERCIAL: [
    'dashboard',
    'clients',
    'reparations',
    'paiements',
    'categories:read',
    'objets:read',
    'statuses:read',
    'familles:read',
  ],
  REPARATEUR: [
    'dashboard',
    'reparations',
    'categories:read',
    'objets:read',
    'statuses:read',
  ],
};

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Le nom d\'utilisateur est obligatoire'],
    unique: true,
    trim: true,
    minlength: [3, 'Minimum 3 caractères'],
    maxlength: [30, 'Maximum 30 caractères'],
  },
  email: {
    type: String,
    required: [true, 'L\'email est obligatoire'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Email invalide'],
  },
  phone: {
    type: String,
    trim: true,
    default: '',
  },
  password: {
    type: String,
    required: [true, 'Le mot de passe est obligatoire'],
    minlength: [6, 'Minimum 6 caractères'],
    select: false,
  },
  firstName: {
    type: String,
    required: [true, 'Le prénom est obligatoire'],
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, 'Le nom est obligatoire'],
    trim: true,
  },
  role: {
    type: String,
    enum: ['ADMIN', 'COMMERCIAL', 'REPARATEUR'],
    default: 'COMMERCIAL',
  },
  permissions: {
    type: [String],
    enum: AVAILABLE_MODULES,
    default: function () {
      return DEFAULT_PERMISSIONS[this.role] || [];
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },
  refreshToken: {
    type: String,
    select: false,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.hasRole = function (role) {
  return this.role === role;
};

userSchema.methods.hasAnyRole = function (roles) {
  return roles.includes(this.role);
};

// ✅ Vérifier une permission (accepte aussi la version :read)
userSchema.methods.hasPermission = function (module) {
  if (this.role === 'ADMIN') return true;
  if (this.permissions.includes(module)) return true;
  // Si on demande "categories" et qu'on a "categories:read", on refuse l'écriture
  return false;
};

// ✅ Vérifier une permission (avec fallback sur :read)
userSchema.methods.hasPermissionOrRead = function (module) {
  if (this.role === 'ADMIN') return true;
  return (
    this.permissions.includes(module) ||
    this.permissions.includes(`${module}:read`)
  );
};

userSchema.methods.hasAnyPermission = function (modules) {
  if (this.role === 'ADMIN') return true;
  return modules.some(m => this.permissions.includes(m));
};

userSchema.statics.AVAILABLE_MODULES = AVAILABLE_MODULES;
userSchema.statics.DEFAULT_PERMISSIONS = DEFAULT_PERMISSIONS;

module.exports = mongoose.model('User', userSchema);