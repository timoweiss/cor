'use strict';
const Joi = require('joi');
let validations = {};

let mongoIdField = Joi.string().optional();
let mongoIdFieldRequired = mongoIdField.required();

validations.login = Joi.object().keys({
    mail: Joi.string().email().min(3).max(60).required()
        .description('Mail address'),
    password: Joi.string().regex(/[a-zA-Z0-9@#$%_&!"§\/\(\)=\?\^]{3,30}/).required()
});

validations.fbLogin = Joi.object().keys({
    token: Joi.string().required()
});

validations.register = Joi.object().keys({
    mail: Joi.string().email().min(3).max(60).required()
        .description('Mail address'),
    password: Joi.string().regex(/[a-zA-Z0-9@#$%_&!"§\/\(\)=\?\^]{3,30}/).required()
        .description('User set password'),
    name: Joi.string().required().description('User name'),
    residence: Joi.string().required().description('User residence')
});

validations.updatePwd = Joi.object().keys({
    old_password: Joi.string().regex(/[a-zA-Z0-9@#$%_&!"§\/\(\)=\?\^]{3,30}/).required().description('enter old password'),
    new_password: Joi.string().regex(/[a-zA-Z0-9@#$%_&!"§\/\(\)=\?\^]{3,30}/).required().description('enter new password')
});

validations.follow = Joi.object().keys({
    follow_id: mongoIdFieldRequired
});

validations.userId = Joi.object().keys({
    userId: mongoIdFieldRequired
});


validations.userMail = Joi.object().keys({
    mail: Joi.string().email().min(3).max(60).required()
        .description('Mail address')
});

validations.count = Joi.object().keys({
    count: Joi.string().valid(['locations', 'followers', 'locations,followers', 'followers,locations'])
});

module.exports = validations;