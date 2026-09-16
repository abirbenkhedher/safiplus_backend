const Joi = require('joi');

// Validation pour la création d'utilisateur
const validateUser = (data) => {
  const schema = Joi.object({
    username: Joi.string().min(3).max(30).required().messages({
      'string.min': 'Le nom d\'utilisateur doit contenir au moins 3 caractères',
      'string.max': 'Le nom d\'utilisateur doit contenir au maximum 30 caractères',
      'any.required': 'Le nom d\'utilisateur est obligatoire'
    }),
    email: Joi.string().email().required().messages({
      'string.email': 'Email invalide',
      'any.required': 'L\'email est obligatoire'
    }),
    password: Joi.string().min(6).required().messages({
      'string.min': 'Le mot de passe doit contenir au moins 6 caractères',
      'any.required': 'Le mot de passe est obligatoire'
    }),
    firstName: Joi.string().required().messages({
      'any.required': 'Le prénom est obligatoire'
    }),
    lastName: Joi.string().required().messages({
      'any.required': 'Le nom est obligatoire'
    }),
    role: Joi.string().valid('ADMIN', 'COMMERCIAL', 'REPARATEUR').default('COMMERCIAL')
  });
  
  return schema.validate(data);
};

// Validation pour la mise à jour d'utilisateur
const validateUpdateUser = (data) => {
  const schema = Joi.object({
    username: Joi.string().min(3).max(30),
    email: Joi.string().email(),
    password: Joi.string().min(6),
    firstName: Joi.string(),
    lastName: Joi.string(),
    role: Joi.string().valid('ADMIN', 'COMMERCIAL', 'REPARATEUR'),
    isActive: Joi.boolean()
  }).min(1);
  
  return schema.validate(data);
};

// Validation pour le login
const validateLogin = (data) => {
  const schema = Joi.object({
    username: Joi.string().required().messages({
      'any.required': 'Le nom d\'utilisateur est obligatoire'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Le mot de passe est obligatoire'
    })
  });
  
  return schema.validate(data);
};

module.exports = {
  validateUser,
  validateUpdateUser,
  validateLogin
};