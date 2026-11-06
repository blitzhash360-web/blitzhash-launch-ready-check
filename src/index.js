'use strict';

const { scanUrl, normalizeUrl, grade } = require('./scanner');
const { formatReport } = require('./format');

module.exports = { scanUrl, normalizeUrl, grade, formatReport };
