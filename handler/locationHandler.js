'use strict';
const hoek = require('hoek');
const boom = require('boom');

const util = require('../lib/util');


let handler = {};
const basicPin = {
    role: 'location'
};

handler.getLocationById = (request, reply) => {

    let senecaAct = util.setupSenecaPattern('locationById', request.params, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });

};

handler.getLocationsNearby = (request, reply) => {

    let senecaAct = util.setupSenecaPattern('nearby', request.query, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });

};


handler.postSchoenhier = (request, reply) => {

    let senecaAct = util.setupSenecaPattern('addschoenhier', request.payload, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });

};


handler.getSchoenhierNearby = (request, reply) => {

    let senecaAct = util.setupSenecaPattern('nearbyschoenhier', request.query, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });
};


module.exports = handler;