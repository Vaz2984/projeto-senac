'use strict';

// Padrões de clickbait/sensacionalismo comuns em PT-BR e EN. Lista deliberadamente
// pequena e explicável (cada match vira um motivo legível no popup), não um
// classificador estatístico — isso é papel do sinal de IA (llm.js).
const CLICKBAIT_PATTERNS = [
  /\bvoc[eê]\s+n[aã]o\s+vai\s+acreditar\b/i,
  /\bm[eé]dicos\s+odeiam\b/i,
  /\bo\s+que\s+aconteceu\s+depois\s+(vai\s+)?chocar/i,
  /\burgente\b.{0,20}\bcompartilh/i,
  /\bantes\s+que\s+(apaguem|tirem\s+do\s+ar|censurem)\b/i,
  /\bm[ií]dia\s+n[aã]o\s+quer\s+que\s+voc[eê]\s+saiba\b/i,
  /\bisso\s+vai\s+te\s+deixar\s+(chocado|revoltado)\b/i,
  /\byou\s+won'?t\s+believe\b/i,
  /\bdoctors\s+hate\s+(this|him|her)\b/i,
  /\bshocking\s+truth\b/i,
  /\bthey\s+don'?t\s+want\s+you\s+to\s+know\b/i,
  /\bcompartilhe\s+antes\s+que\s+(apaguem|removam)\b/i,
];

function countExclamationRuns(text) {
  const matches = text.match(/!{2,}|\?{2,}|!\?|\?!/g);
  return matches ? matches.length : 0;
}

function upperCaseRatio(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length < 8) return 0; // texto curto demais pra ser significativo
  const upper = text.match(/\p{Lu}/gu) || [];
  return upper.length / letters.length;
}

/**
 * Sinal heurístico: sempre disponível, sem custo, sem chamada de rede.
 * Retorna contribution em -1..+1.
 *
 * IMPORTANTE: a base é NEUTRA (0), não "confiável por padrão". Texto sem
 * nenhum sinal — nem de alerta, nem de apuração (sem autor, sem data,
 * curto) — fica em 0, não em +1. Só sobe com sinais concretos de apuração
 * (autor, data, texto com tamanho razoável) e só desce com sinais de
 * sensacionalismo. Isso evita que texto desconhecido saia "confiável" só
 * por não ter clickbait óbvio — a heurística sozinha nunca chega ao
 * extremo +1 (a confiança máxima depende de outros sinais: domínio
 * conhecido, fact-check, IA).
 */
function analyzeHeuristics({ title = '', text = '', author = '', publishedDate = '' } = {}) {
  const safeTitle = typeof title === 'string' ? title : '';
  const safeText = typeof text === 'string' ? text : '';
  const combined = `${safeTitle}\n${safeText.slice(0, 4000)}`;

  const findings = [];
  let credibility = 0; // sinais de apuração (autor, data, tamanho) somam aqui
  let penalty = 0; // sinais de sensacionalismo (clickbait, caixa alta, pontuação) somam aqui

  if (author && author.trim()) {
    credibility += 0.15;
  }
  if (publishedDate && publishedDate.trim()) {
    credibility += 0.15;
  }
  if (safeText.trim().length >= 400) {
    credibility += 0.1;
  } else if (safeText.trim().length > 0) {
    penalty += 0.1;
    findings.push('Texto do artigo muito curto para uma apuração jornalística típica.');
  }
  if (!author || !author.trim()) {
    findings.push('Nenhum autor identificado na página.');
  }
  if (!publishedDate || !publishedDate.trim()) {
    findings.push('Nenhuma data de publicação identificada na página.');
  }

  for (const pattern of CLICKBAIT_PATTERNS) {
    if (pattern.test(combined)) {
      penalty += 0.25;
      findings.push('Título/texto usa linguagem típica de clickbait/sensacionalismo.');
      break; // um achado desse tipo já basta, não empilha por múltiplos matches
    }
  }

  const upperRatio = upperCaseRatio(safeTitle);
  if (upperRatio > 0.6) {
    penalty += 0.2;
    findings.push('Título majoritariamente em CAIXA ALTA (sinal comum de sensacionalismo).');
  }

  const exclamationRuns = countExclamationRuns(combined);
  if (exclamationRuns > 0) {
    penalty += Math.min(0.2, exclamationRuns * 0.1);
    findings.push('Uso de pontuação exagerada ("!!!", "???") no título ou texto.');
  }

  const contribution = Math.max(-1, Math.min(1, credibility - penalty));

  return {
    available: true,
    contribution,
    findings,
    reason: findings.length
      ? findings.join(' ')
      : 'Nenhum sinal de sensacionalismo óbvio encontrado no texto, mas isso sozinho não confirma que a fonte é confiável.',
  };
}

module.exports = { analyzeHeuristics };
