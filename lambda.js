'use strict';
const awsServerlessExpress = require('aws-serverless-express');
const app = require('./app');
const server = awsServerlessExpress.createServer(app);

exports.handler = (event, context) => {
  if (event.path) {
    event.path = event.path.replace(new RegExp('^/default'), '');
  }

  awsServerlessExpress.proxy(server, event, context);
};
