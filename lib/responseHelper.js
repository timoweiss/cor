'use strict';

const Boom = require('boom');
const log = require('ms-utilities').logger;

const fns = {};

const ERRORS = {
    'NOT_FOUND': Boom.notFound
};


/**
 * Will receive a object like:
 * {
 *  error: {
 *      msg: 'NOT_FOUND',
 *      detail: 'something was not found'
 *    },
 *  data: null
 * }
 * @param serviceResponse
 * @returns {*}
 */
fns.unwrap = (serviceResponse) => {
    if (!serviceResponse.error) {

        return serviceResponse.data;

    }
    // get boom function
    let boom = ERRORS[serviceResponse.error.msg];

    if (!boom) {
        // TODO: notify someone, that somebody screwed up
        log.fatal('No boom object found for :', serviceResponse.error);
        return Boom.badImplementation();
    }

    // return boom function with message
    return boom(serviceResponse.error.detail);
};


module.exports = fns;