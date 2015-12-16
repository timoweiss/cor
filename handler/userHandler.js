'use strict';
const hoek = require('hoek');
const boom = require('boom');

const util = require('../lib/util');

let handler = {};
const basicPin = {
    role: 'user'
};

handler.login = (request, reply) => {

    let senecaAct = util.setupSenecaPattern('login', request.payload, basicPin);

    request.server.pact(senecaAct)
        .then(result => {
            request.auth.session.set(result);
            reply(result);
        })
        .catch(error => {
            reply(boom.badRequest('du depp'));
        });

};


handler.logout = (request, reply) => {
    request.auth.session.clear();
    reply({
        message: 'You are logged out'
    });
};

handler.register = (request, reply) => {

    let senecaAct = util.setupSenecaPattern('register', request.payload, basicPin);

    request.server.pact(senecaAct)
        .then(result => {
            request.auth.session.set(result);
            reply();
        })
        .catch(error => {
            console.log(error);
            reply(boom.badRequest('du depp'));
        });
}

handler.protected = (request, reply) => {
    reply('YOU CAN SEE THIS');
}


module.exports = handler;