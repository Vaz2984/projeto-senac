'use strict';

const express = require('express');
const { scoreArticle } = require('../analysis/scorer');

const router = express.Router();

const MAX_FIELD_LENGTHS = {
  url: 2048,
  domain: 255,
  title: 500,
  text: 20000,
  author: 200,
  publishedDate: 100,
};

/**
 * Valida e sanitiza o corpo da requisição. Nunca confia no que a extensão
 * manda: tipos errados, campos ausentes ou textos gigantes viram erro 400
 * claro, em vez de derrubar a análise mais adiante.
 */
function validateBody(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Corpo da requisição ausente ou inválido.' };
  }

  const { url, domain, title, text, author, publishedDate } = body;

  if (!url || typeof url !== 'string' || !url.trim()) {
    return { error: 'Campo "url" é obrigatório.' };
  }
  if (!domain || typeof domain !== 'string' || !domain.trim()) {
    return { error: 'Campo "domain" é obrigatório.' };
  }

  for (const [field, value] of Object.entries({ url, domain, title, text, author, publishedDate })) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return { error: `Campo "${field}" deve ser texto.` };
    }
    const max = MAX_FIELD_LENGTHS[field];
    if (typeof value === 'string' && max && value.length > max) {
      return { error: `Campo "${field}" excede o tamanho máximo permitido (${max} caracteres).` };
    }
  }

  return {
    article: {
      url: url.trim(),
      domain: domain.trim(),
      title: (title || '').trim(),
      text: (text || '').trim(),
      author: (author || '').trim(),
      publishedDate: (publishedDate || '').trim(),
    },
  };
}

router.post('/analyze', async (req, res, next) => {
  try {
    const { error, article } = validateBody(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const result = await scoreArticle(article, {
      googleFactCheckApiKey: process.env.GOOGLE_FACT_CHECK_API_KEY || null,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
    });

    // Log sem dados pessoais/conteúdo do artigo: só domínio + resultado.
    // eslint-disable-next-line no-console
    console.log(`[analyze] domain=${article.domain} score=${result.score} verdict=${result.verdict} signals=${result.signalsUsed.join(',')}`);

    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    signals: {
      factcheck: Boolean(process.env.GOOGLE_FACT_CHECK_API_KEY),
      llm: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  });
});

module.exports = router;
