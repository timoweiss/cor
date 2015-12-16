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
    // TODO implement
    let senecaAct = util.setupSenecaPattern('login', request.payload, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            console.log(error);
            reply(boom.badRequest('du depp'));
        });
};

handler.register = (request, reply) => {

    let senecaAct = util.setupSenecaPattern('register', request.payload, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            console.log(error);
            reply(boom.badRequest('du depp'));
        });
}


module.exports = handler;