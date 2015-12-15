'use strict';
const Joi = require('joi');
let validations = {};

validations.postUser = Joi.object().keys({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().regex(/^[a-zA-Z0-9]{3,30}$/)
});

validations.register = Joi.object().keys({
    mail: Joi.string().email().min(3).max(60).required()
        .description('Mail address'),
    password: Joi.string().regex(/[a-zA-Z0-9@#$%_&!"�\/\(\)=\?\^]{3,30}/).required()
        .description('User set password')
});

module.exports = validations;