const { serveHTTP } = require('stremio-addon-sdk');
const addon         = require('./addon');

serveHTTP(addon, { port: process.env.PORT || 7860 });
console.log('Addon running on port', process.env.PORT || 7860);
