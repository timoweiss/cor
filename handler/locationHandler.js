'use strict';
const boom = require('boom');
const Wreck = require('wreck');
const slack = require('ms-utilities').slack;


const util = require('../lib/util');


let handler = {};
const basicPin = {
    role: 'location'
};

let genericFileResponseHandler = (err, res, request, reply, type) => {

    if (err) {
        return reply(boom.badRequest(err));
    }

    // read response
    Wreck.read(res, {json: true}, (err, response) => {
        if (err) {
            return reply(boom.badRequest(err));
        }

        if (response.statusCode >= 400) {
            return reply(boom.create(response.statusCode, response.message, response.error));
        }

        let userId = util.getUserId(request.auth);
        let senecaAct = util.setupSenecaPattern({cmd: 'addimpression', type: type}, {
            location_id: request.params.locationId,
            user_id: userId,
            message: response
        }, basicPin);

        request.server.pact(senecaAct)
            .then(reply)
            .catch(error => {
                if (error.message.includes('Invalid id')) {

                    // remove the uploaded image again by making an internal DELETE request
                    Wreck.delete('http://localhost:3453/stream/' + type + '/' + response._id, (err) => {
                        if (err) {
                            // send slack error TODO
                            slack.sendSlackError(process.env['SLACK_ERROR_CHANNEL'],
                                'Error Deleting file type ' + type + '. Because of: ' + err);
                        }
                    });
                    return reply(boom.notFound('location_id'));
                }
                reply(boom.badImplementation(error));
            });
    });
};

handler.getLocationById = (request, reply) => {

    request.basicSenecaPattern.cmd = 'locationById';

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, request.params, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });

};

handler.getLocationsNearby = (request, reply) => {

    request.basicSenecaPattern.cmd = 'nearby';

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, request.query, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });

};

handler.postNewLocation = (request, reply) => {

    request.basicSenecaPattern.cmd = 'addnewlocation';

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, request.payload, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });

};

handler.deleteLocation = (request, reply) =>{
    request.basicSenecaPattern.cmd = 'deletelocation';

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, request.params, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });

};

handler.getAllLocationsByUserId = (request, reply) =>{
    request.basicSenecaPattern.cmd = 'getlocbyuserid';

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, request.params, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });
}


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


handler.getLocationsStream = (request, reply) => {

    //return reply(boom.notImplemented('still todo'));
    //return reply([{
    //    user_id: '5677fdec53f5beead532b1e3',
    //    create_date: '2015-07-27T07:29:06.381Z',
    //    modified_date: '2015-07-27T07:29:06.381Z',
    //    location_id: '567a96f3990007900125f52e',
    //    type: 'text',
    //    data: 'pimaling ding ding'
    //},{
    //    user_id: '5677fdec53f5beead532b1e3',
    //    create_date: '2015-07-27T07:24:06.381Z',
    //    modified_date: '2015-07-27T07:24:06.381Z',
    //    location_id: '567a96f3990007900125f52e',
    //    type: 'audio',
    //    data: '/audio/pipapoid/file.mp3'
    //}, {
    //    user_id: '5677fdec53f5beead532b1e3',
    //    create_date: '2015-07-26T07:24:06.381Z',
    //    modified_date: '2015-07-26T07:24:06.381Z',
    //    location_id: '567a96f3990007900125f52e',
    //    type: 'video',
    //    data: '/video/pipapoid2/file.mpg'
    //}, {
    //    user_id: '5677fdec53f5beead532b1e3',
    //    create_date: '2015-07-26T06:24:06.381Z',
    //    modified_date: '2015-07-26T06:24:06.381Z',
    //    location_id: '567a96f3990007900125f52e',
    //    type: 'video',
    //    data: '/video/pipapoid3/file2.mpg'
    //}]);

    let userId = util.getUserId(request.auth);
    let senecaAct = util.setupSenecaPattern('getlocationstream', {
        location_id: request.params.locationId,
        user_id: userId
    }, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            if (error.message.includes('Invalid id.') || error.message.includes('invalid location_id')) {
                return reply(boom.notFound('location_id'));
            }
            reply(boom.badImplementation(error));
        });

};

handler.postTextImpression = (request, reply) => {

    let userId = util.getUserId(request.auth);
    let senecaAct = util.setupSenecaPattern({cmd: 'addimpression', type: 'text'}, {
        location_id: request.params.locationId,
        user_id: userId,
        message: request.payload.data
    }, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            if (error.message.includes('Invalid id.')) {
                return reply(boom.notFound('location_id'));
            }
            reply(boom.badImplementation(error));
        });

};


handler.getMyFavoriteLocations = (request, reply) => {

    return reply(boom.notImplemented('todo'));
};

handler.postToggleFavorLocation = (request, reply) => {

    let userId = util.getUserId(request.auth);
    let senecaAct = util.setupSenecaPattern('toggleFavor', {
        location_id: request.params.locationId,
        user_id: userId
    }, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            console.log(error);
            if (error.cause.details.message && error.cause.details.message === 'Invalid id') {
                return reply(boom.notFound());
            }
            reply(boom.badImplementation(error));
        });
};

handler.getLocationByName = (request, reply) => {

    let senecaAct = util.setupSenecaPattern('locationbyname', request.query, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });
};

handler.postUpdateLocation = (request, reply) => {
    return reply(boom.notImplemented ('todo'));
};

handler.imageUploadRespone = (err, res, request, reply) => {

    genericFileResponseHandler(err, res, request, reply, 'image');
};


handler.videoUploadRespone = (err, res, request, reply) => {

    genericFileResponseHandler(err, res, request, reply, 'video');
};


module.exports = handler;