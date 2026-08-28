'use strict';

const ENDPOINT = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';
const TIMEOUT_MS = 8000;

// Vocabulário de "veredito" usado por diferentes agências de checagem (PT/EN),
// normalizado para uma pontuação -1 (falso) .. +1 (verdadeiro). Textos que não
// batem com nada aqui contam como neutro (0) mas ainda aparecem como referência.
const RATING_KEYWORDS = [
  { score: -1, patterns: [/falso/i, /fake/i, /false/i, /pants on fire/i, /mentira/i, /enganoso.*falso/i] },
  { score: -0.6, patterns: [/enganoso/i, /misleading/i, /exagerad/i, /distorcid/i, /sem contexto/i, /fora de contexto/i, /out of context/i] },
  { score: -0.3, patterns: [/parcialmente falso/i, /mostly false/i, /half true/i, /meia verdade/i] },
  { score: 0.3, patterns: [/parcialmente verdadeiro/i, /mostly true/i] },
  { score: 1, patterns: [/verdadeiro/i, /^true$/i, /correct/i, /accurate/i] },
];

function normalizeRating(textualRating) {
  if (!textualRating || typeof textualRating !== 'string') return 0;
  for (const { score, patterns } of RATING_KEYWORDS) {
    if (patterns.some((p) => p.test(textualRating))) return score;
  }
  return 0;
}

function buildQuery({ title, text }) {
  const base = (title && title.trim()) || (text && text.trim().slice(0, 200)) || '';
  return base.slice(0, 300); // a API tem limite de tamanho de query
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sinal do Google Fact Check Tools API: só roda se GOOGLE_FACT_CHECK_API_KEY
 * estiver configurada. Nunca lança para fora — qualquer erro de rede/parse
 * vira `available: false` para o scorer simplesmente ignorar esse sinal.
 */
async function analyzeFactCheck({ title, text }, apiKey) {
  if (!apiKey) {
    return { available: false, reason: 'Fact Check Tools API não configurada (GOOGLE_FACT_CHECK_API_KEY ausente).', claims: [] };
  }

  const query = buildQuery({ title, text });
  if (!query) {
    return { available: false, reason: 'Sem título/texto suficiente para consultar o fact-check.', claims: [] };
  }

  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&languageCode=pt&key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetchWithTimeout(url, TIMEOUT_MS);
    if (!res.ok) {
      return {
        available: false,
        reason: `Fact Check Tools API respondeu ${res.status}.`,
        claims: [],
      };
    }
    const data = await res.json();
    const rawClaims = Array.isArray(data.claims) ? data.claims : [];

    const claims = [];
    for (const claim of rawClaims.slice(0, 5)) {
      const review = Array.isArray(claim.claimReview) ? claim.claimReview[0] : null;
      if (!review) continue;
      claims.push({
        text: typeof claim.text === 'string' ? claim.text.slice(0, 300) : '',
        publisher: review.publisher && review.publisher.name ? review.publisher.name : 'Agência de checagem',
        rating: review.textualRating || 'Sem classificação',
        url: review.url || null,
        score: normalizeRating(review.textualRating),
      });
    }

    if (claims.length === 0) {
      return {
        available: false,
        reason: 'Nenhuma checagem de fatos encontrada para esta notícia (pode ser boato novo/pouco divulgado).',
        claims: [],
      };
    }

    const avgScore = claims.reduce((sum, c) => sum + c.score, 0) / claims.length;

    return {
      available: true,
      contribution: avgScore,
      claims,
      reason: `${claims.length} checagem(ns) relacionada(s) encontrada(s) (ex.: ${claims[0].publisher} classificou como "${claims[0].rating}").`,
    };
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    return {
      available: false,
      reason: timedOut
        ? 'Consulta ao Fact Check Tools excedeu o tempo limite.'
        : `Falha ao consultar Fact Check Tools: ${err.message}`,
      claims: [],
    };
  }
}

module.exports = { analyzeFactCheck, normalizeRating };
