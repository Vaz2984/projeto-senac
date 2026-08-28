'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const analyzeRouter = require('./routes/analyze');

const app = express();

// Hospedagem na nuvem (Render/Railway/Fly) roda atrás de um proxy reverso —
// necessário para o rate limiter identificar o IP real do cliente.
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json({ limit: '200kb' }));

// CORS: por padrão só aceita chamadas vindas de uma extensão de navegador
// (chrome-extension://, moz-extension://, edge://extensions usa o mesmo
// esquema chrome-extension://). É possível restringir a IDs específicos via
// ALLOWED_ORIGINS (lista separada por vírgula) para reforçar em produção.
const EXTENSION_ORIGIN_PATTERN = /^(chrome|moz|edge)-extension:\/\//;
const explicitAllowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Requisições sem header Origin (ex.: curl, health checks) são liberadas
      // só para health check; o navegador sempre envia Origin em fetch de extensão.
      if (!origin) return callback(null, true);
      if (explicitAllowedOrigins.length > 0 && explicitAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      if (explicitAllowedOrigins.length === 0 && EXTENSION_ORIGIN_PATTERN.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origem não permitida por política de CORS.'));
    },
  }),
);

// Endpoint público e potencialmente custoso (chama APIs de terceiros) —
// limite generoso o bastante para uso normal, mas que barra abuso automatizado.
const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});

app.use('/api/analyze', analyzeLimiter);
app.use('/api', analyzeRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// Handler de erro central: nunca vaza stack trace nem detalhes internos ao
// cliente — só loga no servidor e devolve uma mensagem genérica.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.message === 'Origem não permitida por política de CORS.') {
    return res.status(403).json({ error: err.message });
  }
  // eslint-disable-next-line no-console
  console.error('[server] erro não tratado:', err);
  res.status(err && err.status ? err.status : 500).json({ error: 'Erro interno ao processar a requisição.' });
});

const PORT = Number(process.env.PORT || 3000);

if (!process.env.GOOGLE_FACT_CHECK_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[server] GOOGLE_FACT_CHECK_API_KEY não configurada — sinal de fact-check desativado.');
}
if (!process.env.ANTHROPIC_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[server] ANTHROPIC_API_KEY não configurada — sinal de IA desativado.');
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] FactAI backend rodando na porta ${PORT}`);
});

module.exports = app;
