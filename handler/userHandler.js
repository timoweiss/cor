'use strict';
const boom = require('boom');

const util = require('../lib/util');
const log = require('ms-utilities').logger;
const helper = require('../lib/responseHelper');

let handler = {};
const basicPin = {
    role: 'user'
};

handler.login = (request, reply) => {

    let pattern = util.clone(request.basicSenecaPattern);
    let user = request.payload;

    if (request.auth.isAuthenticated) {
        return reply({message: 'Dude, you are already registered and authenticated!'});
    }


    if (pattern.requesting_device_id === 'unknown') {
        return reply(boom.preconditionFailed('Register your device!'));
    } else {
        user.requesting_device_id = pattern.requesting_device_id;
    }

    pattern.cmd = 'login';

    let senecaAct = util.setupSenecaPattern(pattern, user, basicPin);

    request.server.pact(senecaAct)
        .then(helper.unwrap)
        .then(resp => {

            if (!resp.isBoom) {

                let cookie = {
                    _id: resp._id,
                    mail: resp.mail,
                    name: resp.name,
                    device_id: user.requesting_device_id
                };

                request.auth.session.set(cookie);
                return reply(resp).unstate('locator');
            }

            return reply(resp);
        })
        .catch(err => {
            log.fatal(err, 'Error logging in');
            reply(boom.unauthorized());
        });

};


handler.logout = (request, reply) => {
    let deviceId = request.auth.credentials.device_id;
    request.auth.session.clear();

    reply({message: 'You are logged out'}).state('locator', {device_id: deviceId});

    // set device to inactive
    let pattern = util.clone(request.basicSenecaPattern);

    pattern.cmd = 'unregister';
    pattern.entity = 'device';

    let senecaAct = util.setupSenecaPattern(pattern, {deviceId: deviceId}, basicPin);

    request.server.pact(senecaAct)
        .catch(err => {
            log.error(err, 'Error unregistering device');
        });
};

handler.register = (request, reply) => {

    if (request.auth.isAuthenticated) {
        log.warn('Already authenticated user wants to register', {userid: request.auth.credentials._id});
        return reply({message: 'Dude, you are already registered and authenticated!'});
    }

    let pattern = util.clone(request.basicSenecaPattern);
    let user = request.payload;

    if (pattern.requesting_device_id === 'unknown') {
        return reply(boom.preconditionFailed('Register your device!'));
    } else {
        user.requesting_device_id = pattern.requesting_device_id;
    }

    pattern.cmd = 'register';
    pattern.entity = 'user';

    let senecaAct = util.setupSenecaPattern(pattern, user, basicPin);

    request.server.pact(senecaAct)
        .then(helper.unwrap)
        .then(result => {

            if (!result.isBoom) {

                let cookie = {
                    mail: result.mail,
                    _id: result._id,
                    name: result.name,
                    device_id: user.requesting_device_id
                };

                request.auth.session.set(cookie);
                return reply(result).code(201).unstate('locator');
            }

            return reply(result);
        })
        .catch(error => {
            log.fatal(error, 'User register handler failed');
            reply(boom.badRequest());
        });
};

handler.follow = (request, reply) => {
    let userID = util.getUserId(request.auth);

    request.basicSenecaPattern.cmd = 'follow';

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, {
        to_follow: request.params.toFollow,
        user_id: userID
    }, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            let errorMsg = error.cause.details.message ? error.cause.details.message : 'unknown';
            reply(boom.badRequest(errorMsg));
        });

};

let getFollowingUsersByUserId = (request, reply, userId) => {
    request.basicSenecaPattern.cmd = 'getfollowing';

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, {
        user_id: userId
    }, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            let errorMsg = error.cause.details.message ? error.cause.details.message : 'unknown';
            reply(boom.badRequest(errorMsg));
        });
};

handler.getMyFollowing = (request, reply) => {

    getFollowingUsersByUserId(request, reply, request.basicSenecaPattern.requesting_user_id);

};

handler.getFollowingByUserId = (request, reply) => {

    getFollowingUsersByUserId(request, reply, request.params.userId);

};


let getFollowerByUserId = (request, reply, userId) => {

    request.basicSenecaPattern.cmd = 'getfollowers';

    let senecaAct = util.setupSenecaPattern(request.basicSenecaPattern, {
        user_id: userId || request.requestingUserId
    }, basicPin);

    request.server.pact(senecaAct)
        .then(reply)
        .catch(error => {
            let errorMsg = error.cause.details.message ? error.cause.details.message : 'unknown';
            reply(boom.badRequest(errorMsg));
        });
};

handler.getMyFollower = (request, reply) => {

    getFollowerByUserId(request, reply, request.basicSenecaPattern.requesting_user_id);

};
handler.getFollowerByUser = (request, reply) => {

    getFollowerByUserId(request, reply, request.params.userId);

};

handler.getUserById = (request, reply, useRequestingUser) => {
    let options = {};
    let userId = request.params.userId;
    let basicLocation;
    let basicFollower;
    let senecaActLocationCount;
    let senecaActFollowerCount;

    let basicUser = util.clone(request.basicSenecaPattern);

    if (typeof request.query.count === 'string') {
        options.countFollowers = request.query.count.includes('followers');
        options.countLocations = request.query.count.includes('locations');
    }

    if (useRequestingUser) {
        userId = request.basicSenecaPattern.requesting_user_id;
    }

    let locationCountPromise = true;
    let followersCountPromise = true;

    basicUser.cmd = 'getUserById';

    let senecaActUser = util.setupSenecaPattern(basicUser, {
        user_id: userId
    }, basicPin);


    if (options.countLocations) {
        basicLocation = util.clone(request.basicSenecaPattern);

        basicLocation.cmd = 'count';
        basicLocation.entity = 'location';
        basicLocation.by = 'userId';

        senecaActLocationCount = util.setupSenecaPattern(basicLocation, {
            user_id: userId
        }, {role: 'location'});

        // override bool with promise
        locationCountPromise = request.server.pact(senecaActLocationCount);
    }

    if (options.countFollowers) {
        basicFollower = util.clone(request.basicSenecaPattern);

        basicFollower.cmd = 'count';
        basicFollower.entity = 'follower';
        basicFollower.by = 'userId';

        senecaActFollowerCount = util.setupSenecaPattern(basicFollower, {
            user_id: userId
        }, basicPin);

        // override bool with promise
        followersCountPromise = request.server.pact(senecaActFollowerCount);
    }

    Promise.all([request.server.pact(senecaActUser), locationCountPromise, followersCountPromise])
        .then(result => {
            let reponse = result[0];
            if (reponse) {
                if (options.countLocations) {
                    reponse.location_count = result[1].count || 0;
                }
                if (options.countFollowers) {
                    reponse.follower_count = result[2].count || 0;
                }
            }
            if (!reponse) {
                reponse = boom.notFound();
            }
            reply(reponse);
        })
        .catch(error => {
            let errorMsg = error.cause.details.message ? error.cause.details.message : 'unknown';
            reply(boom.badRequest(errorMsg));
        });
};

handler.protected = (request, reply) => {
    handler.getUserById(request, reply, true);
};


handler.userImageUploadRespone = (err, res, request, reply) => {
    reply(boom.notImplemented('Wait for it'));
};


module.exports = handler;
