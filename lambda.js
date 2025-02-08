'use strict';
const app = require('./app');
const serverless = require('serverless-http');


export const handler = serverless(app);
