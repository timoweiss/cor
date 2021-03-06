'use strict';
const boom = require('boom');
const Wreck = require('wreck');
const fb = require('fbgraph');
const util = require('../lib/util');
const utilities = require('ms-utilities');
const log = utilities.logger;
const slack = utilities.slack;
const helper = require('../lib/responseHelper');

let handler = {};
const basicPin = {
    role: 'user'
};

handler.login = (request, reply) => {

    let pattern = util.clone(request.basicSenecaPattern);
    let user = request.payload;

    if (request.auth.isAuthenticated) {
        let userId = pattern.requesting_user_id || request.auth.credentials._id;
        return handler.getUserById(request, reply, userId);
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
        .catch(error => reply(boom.badImplementation(error)));
};

handler.fbLogin = (request, reply) => {
    let access_token = request.payload.token;
    fb.setAccessToken(access_token);

    let pattern = util.clone(request.basicSenecaPattern);
    pattern.cmd = 'fbLogin';

    if (request.auth.isAuthenticated) {
        let userId = request.auth.credentials._id || pattern.requesting_user_id;
        return handler.getUserById(request, reply, userId);
    }

    if (pattern.requesting_device_id === 'unknown') {
        return reply(boom.preconditionFailed('Register your device!'));
    }

    fb.get('/me?fields=id,email,name', (err, fb_user) => {

        fb_user.requesting_device_id = pattern.requesting_device_id;

        let senecaAct = util.setupSenecaPattern(pattern, fb_user, basicPin);

        request.server.pact(senecaAct)
            .then(helper.unwrap)
            .then(resp => {

                if (!resp.isBoom) {

                    let cookie = {
                        _id: resp._id,
                        mail: resp.mail || resp.fbId,
                        name: resp.name,
                        strategy: 'facebook',
                        device_id: fb_user.requesting_device_id
                    };

                    request.auth.session.set(cookie);

                    return reply(resp).unstate('locator');
                }
                return reply(resp);
            })
            .catch(error => reply(boom.badImplementation(error)));
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
                reply(result).code(201).unstate('locator');

                slack.sendSlackInfo(process.env['SLACK'], 'Neuer Benutzer registriert ' + result.name);
            } else {
                reply(result);
            }

        })
        .catch(error => reply(boom.badImplementation(error)));
};


handler.changePwd = (request, reply)=> {

    let pattern = util.clone(request.basicSenecaPattern);
    pattern.cmd = 'changePwd';

    if (request.auth.credentials.strategy === 'facebook') {
        return reply(boom.badRequest('unable to change facebook pw'));
    }

    let message = request.payload;
    message.user_id = request.basicSenecaPattern.requesting_user_id;

    let senecaAct = util.setupSenecaPattern(pattern, message, basicPin);
    request.server.pact(senecaAct)
        .then(helper.unwrap)
        .then(reply)
        .catch(error => reply(boom.badImplementation(error)));
};

handler.forgetPassword = (request, reply)=> {

    let pattern = util.clone(request.basicSenecaPattern);
    pattern.cmd = 'forgetPassword';

    let mailPattern = util.clone(request.basicSenecaPattern);
    mailPattern.cmd = 'send';
    mailPattern.subject = 'pwforget';

    let user = {
        mail: request.payload.mail
    };

    let senecaAct = util.setupSenecaPattern(pattern, user, basicPin);
    request.server.pact(senecaAct)
        .then(helper.unwrap)
        .then(value => {

            if (!value.isBoom) {
                // reply to client
                reply({ok: true});

                // send mail to user
                let senecaMailAct = util.setupSenecaPattern(
                    mailPattern,
                    {
                        mail: user.mail,
                        new_password: value.new_password
                    },
                    {
                        role: 'mailer'
                    });

                request.server.pact(senecaMailAct)
                    .catch(err => log.fatal('Error sending Mail', {error: err}));

            } else {
                reply(value);
            }

        })
        .catch(error => reply(boom.badImplementation(error)));

};

handler.follow = (request, reply) => {

    let pattern = util.clone(request.basicSenecaPattern);
    pattern.cmd = 'follow';

    let senecaAct = util.setupSenecaPattern(pattern, {
        follow_id: request.params.follow_id,
        user_id: pattern.requesting_user_id
    }, basicPin);

    request.server.pact(senecaAct)
        .then(res => reply(helper.unwrap(res)))
        .catch(error => reply(boom.badImplementation(error)));

    let notificationAct = util.clone(senecaAct);
    notificationAct.cmd = 'notify';
    notificationAct.role = 'notifications';
    notificationAct.entity = 'newFollower';


    request.server.pact(notificationAct)
        .catch(error => log.error('Error sending push', {err: error}));


};

handler.unfollow = (request, reply) => {
    let pattern = util.clone(request.basicSenecaPattern);
    pattern.cmd = 'unfollow';

    let senecaAct = util.setupSenecaPattern(pattern, {
        follow_id: request.params.follow_id,
        user_id: pattern.requesting_user_id
    }, basicPin);

    request.server.pact(senecaAct)
        .then(res => reply(helper.unwrap(res)))
        .catch(error => reply(boom.badImplementation(error)));

};

let getFollowingUsersByUserId = (request, reply, userId) => {

    let pattern = util.clone(request.basicSenecaPattern);
    pattern.cmd = 'getfollowing';

    let senecaAct = util.setupSenecaPattern(pattern, {
        user_id: userId
    }, basicPin);

    request.server.pact(senecaAct)
        .then(res => reply(helper.unwrap(res)))
        .catch(error => reply(boom.badImplementation(error)));
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
        .then(res => reply(helper.unwrap(res)))
        .catch(error => reply(boom.badImplementation(error)));
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

    if (!userId || userId === 'unknown') {
        return reply(boom.badRequest('No user id found in cookie (or param)'));
    }

    let locationCountPromise = true;
    let followersCountPromise = true;

    basicUser.cmd = 'getUser';
    basicUser.by = 'id';

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
            let user = helper.unwrap(result[0]);

            if (!user.isBoom) {
                if (options.countLocations) {
                    user.location_count = result[1].count || 0;
                }
                if (options.countFollowers) {
                    user.follower_count = result[2].count || 0;
                }
            }

            // HACK: add default user images
            if (!user.images || !user.images.normal || !user.images.small) {
                user.images = {
                    normal: '/api/v2/users/image/57287555842f60f41a55341d/userprofilimage.jpg',
                    small: '/api/v2/users/image/57287555842f60f41a55341c/userprofilimage.jpg'
                };
            }

            return reply(user);
        })
        .catch(error => reply(boom.badImplementation(error)));
};

handler.protected = (request, reply) => {
    handler.getUserById(request, reply, true);
};


handler.userImageUploadRespone = (err, res, request, reply) => {

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
        pattern.cmd = 'add';
        pattern.entity = 'image';

        let message = {
            user_id: util.getUserId(request.auth),
            images: {
                normal: '/api/v2/users/image/' + response.images.normal + '/' + response.name,
                small: '/api/v2/users/image/' + response.images.small + '/' + response.name
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
                            log.error(err, 'Error Deleting file type ', {id: response._id});
                        }
                    });
                }
            })
            .catch(error => reply(boom.badImplementation(error)));
    });
};

handler.userRegisterImageUploadRespone = (err, res, request, reply) => {
    reply(boom.notImplemented('Wait for it'));
};


module.exports = handler;
