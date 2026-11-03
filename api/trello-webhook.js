// Only used if the Vercel project's Root Directory is the repo root; the real handler lives in docs/api/trello-webhook.js.
const handler = require('../docs/api/trello-webhook.js');
module.exports = handler;
module.exports.config = handler.config;
