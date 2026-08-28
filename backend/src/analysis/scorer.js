'use strict';

const { analyzeDomain } = require('./domainReputation');
const { analyzeHeuristics } = require('./heuristics');
const { analyzeFactCheck } = require('./factcheck');
const { analyzeWithLLM } = require('./llm');

// Pesos-base; só entram na média os sinais que retornarem `available: true`,
// renormalizados entre si (soma sempre 1) — assim o score nunca fica
// distorcido por sinais ausentes/indisponíveis.
const BASE_WEIGHTS = {
  domain: 0.25,
  heuristics: 0.15,
  factcheck: 0.3,
  llm: 0.3,
};

const VERDICT_THRESHOLDS = { green: 70, yellow: 40 };

function verdictFromScore(score) {
  if (score >= VERDICT_THRESHOLDS.green) return 'green';
  if (score >= VERDICT_THRESHOLDS.yellow) return 'yellow';
  return 'red';
}

/**
 * Roda os 4 sinais em paralelo (com Promise.allSettled — nenhum deles pode
 * derrubar a resposta) e combina os disponíveis num score final 0-100.
 */
async function scoreArticle(article, { googleFactCheckApiKey, anthropicApiKey } = {}) {
  const [domainResult, heuristicsResult, factcheckResult, llmResult] = await Promise.allSettled([
    Promise.resolve().then(() => analyzeDomain(article.domain)),
    Promise.resolve().then(() => analyzeHeuristics(article)),
    analyzeFactCheck(article, googleFactCheckApiKey),
    analyzeWithLLM(article, anthropicApiKey),
  ]);

  const signals = {
    domain: settledOrUnavailable(domainResult, 'Falha interna ao avaliar domínio.'),
    heuristics: settledOrUnavailable(heuristicsResult, 'Falha interna ao avaliar heurísticas.'),
    factcheck: settledOrUnavailable(factcheckResult, 'Falha ao consultar fact-check.'),
    llm: settledOrUnavailable(llmResult, 'Falha ao consultar IA.'),
  };

  const availableKeys = Object.keys(signals).filter((key) => signals[key].available);
  const reasons = [];
  const signalsUsed = [];

  let weightedSum = 0;
  let totalWeight = 0;

  if (availableKeys.length > 0) {
    const weightPool = availableKeys.reduce((sum, key) => sum + BASE_WEIGHTS[key], 0) || 1;
    for (const key of availableKeys) {
      const normalizedWeight = BASE_WEIGHTS[key] / weightPool;
      weightedSum += signals[key].contribution * normalizedWeight;
      totalWeight += normalizedWeight;
      signalsUsed.push(key);
      if (signals[key].reason) reasons.push(signals[key].reason);
    }
  }

  for (const key of Object.keys(signals)) {
    if (!signals[key].available && signals[key].reason) {
      reasons.push(signals[key].reason);
    }
  }

  // contribution está em -1..+1 -> mapeia para 0..100. Sem nenhum sinal
  // disponível (caso extremo: base local vazia + sem chaves + domínio
  // desconhecido + texto vazio), cai no neutro (50, amarelo) em vez de quebrar.
  const normalizedContribution = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const score = Math.round(Math.max(0, Math.min(100, 50 + normalizedContribution * 50)));

  return {
    verdict: verdictFromScore(score),
    score,
    reasons,
    signalsUsed,
    domain: { known: signals.domain.known || false, category: signals.domain.category || null, host: signals.domain.host || null },
    factChecks: signals.factcheck.claims || [],
    llm: signals.llm.available
      ? { summary: signals.llm.summary, redFlags: signals.llm.redFlags }
      : null,
  };
}

function settledOrUnavailable(settled, fallbackReason) {
  if (settled.status === 'fulfilled' && settled.value) return settled.value;
  return { available: false, reason: `${fallbackReason}${settled.reason ? ` (${settled.reason.message || settled.reason})` : ''}` };
}

module.exports = { scoreArticle, verdictFromScore, VERDICT_THRESHOLDS };
