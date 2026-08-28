'use strict';

// Entry point serverless da Vercel. A Vercel trata qualquer arquivo em
// /api como uma função — como o Express app já é uma função compatível
// com a assinatura (req, res) que a Vercel espera, basta reexportá-lo. Todo
// o resto (rotas, CORS, rate limit, análise) continua em src/server.js,
// sem duplicar nada.
module.exports = require('../src/server');
