'use strict';
const boom = require('boom');
const Wreck = require('wreck');

const util = require('../lib/util');
const helper = require('../lib/responseHelper');
const google = require('../lib/googleutil');

const utilities = require('ms-utilities');
const log = utilities.logger;
const slack = utilities.slack;

const basicPin = {
    role: 'location'
};


module.exports = {
    audioUploadRespone,
    videoUploadRespone,
    imageUploadRespone,
    postUpdateLocation,
    getLocationByName,
    postUnfavorLocation,
    postFavorLocation,
    genericUnFavorLocation,
    postToggleFavorLocation,
    getMyFavoriteLocations,
    getFavoriteLocationsByUserId,
    postTextImpression,
    getLocationsStream,
    getSchoenhierNearby,
    postSchoenhier,
    getAllLocationsByUserId,
    notifyUserForNewLike,
    genericFileResponseHandler,
    getLocationById,
    getLocationsNearby,
    createLocationAfterImageUpload,
    deleteLocation,
    getBubbleScreen
};

function getBubbleScreen(request, reply) {
    let senecaActLocations = {
        cmd: 'nearby',
        data: {
            long: request.query.long || 9.173626899719238,
            lat: request.query.lat || 47.66972243634168,
            maxDistance: request.query.maxDistance || 30000,
            limit: request.query.limit || 6
        },
        role: 'location'
    };

    request.server.pact(senecaActLocations)
        .then(helper.unwrap)
        .then(data => reply({locations: data}).ttl(30000))
        .catch(reply);
}

function notifyUserForNewLike(pushPattern, request) {
    pushPattern.cmd = 'notify';
    pushPattern.entity = 'location';
    pushPattern.action = 'newFavorator';

    let senecaAct = util.setupSenecaPattern(pushPattern, {
        loc_id: request.params.locationId,
        favorator_id: request.basicSenecaPattern.requesting_user_id
    }, {role: 'notifications'});
    return request.server.pact(senecaAct);
}

function genericFileResponseHandler(err, res, request, reply, type) {

    if (err) {
        log.fatal(err, 'Got error after image upload for location');
        return reply(boom.badRequest());
    }

    // read response
    Wreck.read(res, {json: true}, (err, response) => {
        if (err) {
            log.fatal(err, 'ERROR: Unable to read response from ms-fileserve');
            return reply(boom.badRequest());
        }

        if (response.statusCode >= 400) {
            return reply(boom.create(response.statusCode, response.message, response.error));
        }


        let pattern = util.clone(request.basicSenecaPattern);
        pattern.cmd = 'addimpression';
        pattern.type = type;

        let message = {
            location_id: request.params.locationId,
            user_id: util.getUserId(request.auth),
            file: {
                id: response._id,
                name: response.filename
            }
        };


        let senecaAct = util.setupSenecaPattern(pattern, message, basicPin);

        request.server.pact(senecaAct)
            .then(helper.unwrap)
            .then(res => {

                reply(res);


                if (res.isBoom) {
                    // remove the uploaded image again by making an internal DELETE request
                    Wreck.delete('http://localhost:3453/file/' + response._id, (err) => {
                        if (err) {
                            log.error(err, 'Error Deleting file type ' + type, {id: response._id});
                        }
                    });

                } else {

                    slack.sendSlackInfo(process.env['SLACK'], 'Neue Impression vom typ ' + type + ': https://locator-app.com' + res.data);


                    // dont send push if not defined
                    if (!message.user_id || !message.location_id) {
                        return;
                    }

                    // send push notifications
                    let pushPattern = util.clone(request.basicSenecaPattern);
                    pushPattern.cmd = 'notify';
                    pushPattern.entity = 'newImpression';

                    let pushAct = util.setupSenecaPattern(pushPattern,
                        {
                            location_id: message.location_id,
                            user_id: message.user_id,
                            user_name: request.auth.credentials.name,
                            type: type
                        },
                        {role: 'notifications'});

                    request.server.pact(pushAct);
                }
            })
            .catch(error => reply(boom.badImplementation(error)));
    });
}

function getLocationById(request, reply) {

    let pattern = util.clone(request.basicSenecaPattern);
    pattern.cmd = 'locationById';

    let senecaAct = util.setupSenecaPattern(pattern, request.params, basicPin);

    request.server.pact(senecaAct)
        .then(resp => reply(helper.unwrap(resp)))
        .catch(error => reply(boom.badImplementation(error)));
}

function getLocationsNearby(request, reply) {

    let pattern = util.clone(request.basicSenecaPattern);
    pattern.cmd = 'nearby';

    let senecaAct = util.setupSenecaPattern(pattern, request.query, basicPin);

    request.server.pact(senecaAct)
        .then(resp => reply(helper.unwrap(resp)))
        .catch(error => reply(boom.badImplementation(error)));
}

function createLocationAfterImageUpload(err, res, request, reply) {

    if (err) {
        log.fatal(err, 'Got error after image upload for location');
        return reply(boom.badRequest());
    }

    // read response
    Wreck.read(res, {json: true}, (err, response) => {

        if (err) {
            log.fatal(err, 'ERROR: Unable to read response from ms-fileserve');
            return reply(boom.badRequest());
        }

        if (response.statusCode >= 400) {
            return reply(boom.create(response.statusCode, response.message, response.error));
        }

        let pattern = util.clone(request.basicSenecaPattern);
        pattern.cmd = 'addnewlocation';

        let location = {
            user_id: request.basicSenecaPattern.requesting_user_id,
            title: response.location.title,
            categories: response.location.categories,
            favorites: [],
            public: true,
            geotag: {
                type: 'Point',
                coordinates: [response.location.long, response.location.lat]
            },
            images: {
                xlarge: '/api/v2/locations/impression/image/' + response.images.xlarge + '/' + response.images.name,
                large: '/api/v2/locations/impression/image/' + response.images.large + '/' + response.images.name,
                normal: '/api/v2/locations/impression/image/' + response.images.normal + '/' + response.images.name,
                small: '/api/v2/locations/impression/image/' + response.images.small + '/' + response.images.name
            },
            city: {
                title: 'Unknown',
                place_id: 'Unknown'
            }
        };

        let locationId;
        let userId;

        google.findNameOfPosition2(response.location.long, response.location.lat)
            .then(cParam => {
                location.city.title = cParam.title;
                location.city.place_id = cParam.place_id;

                return location;
            })
            .catch(error => {
                log.warn(error);
                return location;
            })
            .then(location => {
                let senecaAct = util.setupSenecaPattern(pattern, location, basicPin);

                return request.server.pact(senecaAct);
            })
            .then(helper.unwrap)
            .then(location => {

                // reply to client (could be an error)
                reply(location);

                if (!location.isBoom) {
                    locationId = location._id;
                    userId = location.user_id;
                }

                slack.sendSlackInfo(process.env['SLACK'], 'Neue Location erstellt mit Titel ' + location.title +
                    ' und  Bild: https://locator-app.com' + location.images.xlarge);


            })
            .catch(error => reply(boom.badImplementation(error)))
            .then(() => {

                // dont send push if not defined
                if (!userId || !locationId) {
                    return;
                }

                // send push notifications
                let pushPattern = util.clone(request.basicSenecaPattern);
                pushPattern.cmd = 'notify';
                pushPattern.entity = 'newLocation';

                let pushAct = util.setupSenecaPattern(pushPattern,
                    {
                        location_id: locationId,
                        user_id: userId,
                        user_name: request.auth.credentials.name
                    },
                    {role: 'notifications'});

                return request.server.pact(pushAct);
            })
            .catch(err => log.warn({error: err}, 'Error sending push'));
    });

}

function deleteLocation(request, reply) {
    request.basicSenecaPattern.cmd = 'deletelocation';

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, request.query, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });

}

function getAllLocationsByUserId(request, reply) {
    request.basicSenecaPattern.cmd = 'getlocbyuserid';

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, request.params, basicPin);

    request.server.pact(senecaAct)
        .then(resp => reply(helper.unwrap(resp)))
        .catch(error => {
            reply(boom.badRequest(error));
        });
}

function postSchoenhier(request, reply) {

    let senecaAct = util.setupSenecaPattern('addschoenhier', request.payload, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            reply(boom.badRequest(error));
        });

}

function getSchoenhierNearby(request, reply) {

    let senecaAct = util.setupSenecaPattern('nearbyschoenhier', request.query, basicPin);

    request.server.pact(senecaAct)
        .then(resp => reply(helper.unwrap(resp)))
        .catch(error => {
            reply(boom.badRequest(error));
        });
}

function getLocationsStream(request, reply) {

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

}

function postTextImpression(request, reply) {

    let userId = request.basicSenecaPattern.requesting_user_id;

    request.basicSenecaPattern.cmd = 'addimpression';
    request.basicSenecaPattern.type = 'text';


    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, {
        location_id: request.params.locationId,
        user_id: userId,
        message: request.payload.data
    }, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .then(() => {
            slack.sendSlackInfo(process.env['SLACK'], 'Neue Text Impression hinzugefügt: ' + request.payload.data);
        })
        .catch(error => {
            if (error.message.includes('Invalid id.')) {
                return reply(boom.notFound('location_id'));
            }
            reply(boom.badImplementation(error));
        });

}

function getFavoriteLocationsByUserId(request, reply, optionalUserId) {
    let userId = optionalUserId || request.params.userId;

    let senecaAct = util.setupSenecaPattern('getfavoritelocationbyuserid', {
        user_id: userId
    }, basicPin);

    request.server.pact(senecaAct)
        .then(resp => reply(helper.unwrap(resp)))
        .catch(error => {
            console.log(error);
            if (error.cause.details.message && error.cause.details.message === 'Invalid id') {
                return reply(boom.notFound());
            }
            reply(boom.badImplementation(error));
        });

}

function getMyFavoriteLocations(request, reply) {

    handler.getFavoriteLocationsByUserId(request, reply, request.basicSenecaPattern.requesting_user_id);
}

function postToggleFavorLocation(request, reply) {
    let pushPattern = util.clone(request.basicSenecaPattern);

    request.basicSenecaPattern.cmd = 'toggleFavor';
    let userId = request.basicSenecaPattern.requesting_user_id;

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, {
        location_id: request.params.locationId,
        user_id: userId
    }, basicPin);

    request.server.pact(senecaAct)
        .then(response => {
            reply(response);
            return response;
        })
        .then(response => {
            if (response.added) {
                return notifyUserForNewLike(pushPattern, request);
            }
        })
        .catch(error => {
            console.log(error);
            if (error.cause.details.message && error.cause.details.message === 'Invalid id') {
                return reply(boom.notFound());
            }
            reply(boom.badImplementation(error));
        });
}

function genericUnFavorLocation(request, reply) {
    let userId = request.basicSenecaPattern.requesting_user_id;

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, {
        location_id: request.params.locationId,
        user_id: userId
    }, basicPin);

    return request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            console.log(error);
            if (error.cause.details.message && error.cause.details.message === 'Invalid id') {
                return reply(boom.notFound());
            }
            reply(boom.badImplementation(error));
        });
}

function postFavorLocation(request, reply) {
    let pushPattern = util.clone(request.basicSenecaPattern);
    request.basicSenecaPattern.cmd = 'favor';
    genericUnFavorLocation(request, reply)
        .then(() => notifyUserForNewLike(pushPattern, request))
        .catch(err => log.warn('error happend', err));
}

function postUnfavorLocation(request, reply) {
    request.basicSenecaPattern.cmd = 'unfavor';
    genericUnFavorLocation(request, reply);
}

function getLocationByName(request, reply) {

    let senecaAct;
    let name = request.query.locationName;
    let long = request.query.long;
    let lat = request.query.lat;

    if (name) {
        senecaAct = util.setupSenecaPattern('locationbyname', {locationName: request.query.locationName}, basicPin);
    }
    else {
        senecaAct = util.setupSenecaPattern('nearby', request.query, basicPin);
    }

    let gFinds = google.locationSearch(name, lat, long);

    let dbPromise = request.server.pact(senecaAct);


    Promise.all([dbPromise, gFinds])
        .then(value => {
            let dbLocations = helper.unwrap(value[0]);
            let googleLocations = value[1];

            let result = {
                google: googleLocations,
                locator: dbLocations
            };

            reply(result);
        })
        .catch(error => {
            reply(boom.badRequest(error));
        });
}

function postUpdateLocation(request, reply) {
    return reply(boom.notImplemented('todo'));
}

function imageUploadRespone(err, res, request, reply) {

    genericFileResponseHandler(err, res, request, reply, 'image');
}

function videoUploadRespone(err, res, request, reply) {

    genericFileResponseHandler(err, res, request, reply, 'video');
}

function audioUploadRespone(err, res, request, reply) {

    genericFileResponseHandler(err, res, request, reply, 'audio');
}

