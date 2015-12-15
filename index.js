'use strict';

require('dotenv').config({path: '../.env'});

const Hapi = require('hapi');
const Bluebird = require('bluebird');

// plugins
const Chairo = require('chairo');

// Create a server with a host and port
const server = new Hapi.Server();


// API
const user = require('./lib/user');
const location = require('./lib/location');

server.connection({
    host: 'localhost',
    port: 8000
});

// Add the route
server.route(user.routes);
server.route(location.routes);


// register plugins

server.register({register: Chairo}, err => {

    server.seneca
        // set desired transport method
        .use('rabbitmq-transport')
        // announce a microservice with pin and transport type the services is listening to
        .client({type: 'rabbitmq', pin: 'role:mailer,cmd:*'})
        .client({type: 'rabbitmq', pin: 'role:location,cmd:*'});

    // promisify seneca.act
    let pact = Bluebird.promisify(server.seneca.act, {context: server.seneca});
    // decorate server object with promisified seneca.act
    server.decorate('server', 'pact', pact);

});

server.register([require('inert'), require('vision'), {register: require('hapi-swagger'), options: {
        enableDocumentationPage: true
}}], err => {

    if (err) {
        throw err;
    }

});


server.start((err) => {

    if (err) {
        throw err;
    }
    console.log('Server running at:', server.info.uri);
});
