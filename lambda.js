'use strict';
const app = require('./app');
import serverless from 'serverless-http';


export const handler = serverless(app);
