'use strict';

// Padrões de clickbait/sensacionalismo comuns em PT-BR e EN. Lista deliberadamente
// pequena e explicável (cada match vira um motivo legível no popup), não um
// classificador estatístico — isso é papel do sinal de IA (llm.js).
const CLICKBAIT_PATTERNS = [
  /\bvoc[eê]\s+n[aã]o\s+vai\s+acreditar\b/i,
  /\bm[eé]dicos\s+odeiam\b/i,
  /\bo\s+que\s+aconteceu\s+depois\s+(vai\s+)?chocar/i,
  /\burgente\b.{0,20}\bcompartilh/i,
  /\bantes\s+que\s+(apaguem|tirem\s+do\s+ar|censurem|bloqueiem)\b/i,
  /\bm[ií]dia\s+n[aã]o\s+quer\s+que\s+voc[eê]\s+saiba\b/i,
  /\bisso\s+vai\s+te\s+deixar\s+(chocado|revoltado)\b/i,
  /\byou\s+won'?t\s+believe\b/i,
  /\bdoctors\s+hate\s+(this|him|her)\b/i,
  /\bshocking\s+truth\b/i,
  /\bthey\s+don'?t\s+want\s+you\s+to\s+know\b/i,
  /\bcompartilhe\s+antes\s+que\s+(apaguem|removam)\b/i,
  /\bcompartilhe\s+com\s+todos\s+(os\s+)?(seus\s+)?contatos\b/i,
];

// Padrões mais específicos de DESINFORMAÇÃO (não só "título chamativo", mas
// alegações/retórica tipicamente usadas em boatos já recorrentes — cura
// milagrosa, antivacina, conspiração). Tratados à parte do clickbait porque
// são um sinal mais forte: um título exagerado pode ser só mau jornalismo,
// mas "vacina mata" ou "terra é plana" é o próprio conteúdo sendo falso.
const MISINFORMATION_PATTERNS = [
  /\bcura\s+milagrosa\b/i,
  /\bvacinas?\s+(matam?|causam?\s+autismo|[eé]\s+veneno)\b/i,
  /\bgoverno\s+(esconde|est[aá]\s+escondendo|n[aã]o\s+quer\s+que\s+voc[eê]\s+saiba)\b/i,
  /\bm[ií]dia\s+(globalista|tradicional)\s+n[aã]o\s+(mostra|divulga|quer\s+mostrar)\b/i,
  /\bnova\s+ordem\s+mundial\b/i,
  /\bgrande\s+reinicializa[cç][aã]o\b/i,
  /\bchip\s+(na\s+|nas\s+)?vacinas?\b/i,
  /\b5g\s+(causa|espalha|transmite)\b/i,
  /\bterra\s+[eé]\s+plana\b/i,
  /\b100%\s+comprovado\b/i,
  /\bn[aã]o\s+[eé]\s+fake\s+news[,.]?\s+[eé]\s+verdade\b/i,
  /\bisso\s+[eé]\s+verdade\s+e\s+a\s+m[ií]dia\s+esconde\b/i,
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

// Emojis de "alarme"/urgência (🚨⚠️❗😱🔥💯 etc.) em excesso são um padrão comum
// em correntes/boatos compartilhados em redes sociais e apps de mensagem —
// reportagem real raramente usa mais de um ou dois no título/corpo.
const ALARM_EMOJI = /[\u{1F6A8}\u{26A0}\u{FE0F}\u{2757}\u{203C}\u{1F631}\u{1F525}\u{1F4AF}\u{1F6D1}\u{2757}]/gu;

function countAlarmEmoji(text) {
  const matches = text.match(ALARM_EMOJI);
  return matches ? matches.length : 0;
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
 *
 * IMPORTANTE #2: autor/data/tamanho são sinais de apuração FRACOS de
 * propósito — qualquer site, inclusive um fabricando notícia falsa, pode
 * preencher um nome de "autor" e uma data. Por isso eles valem pouco (não
 * dá pra um texto bem formatado, mas com conteúdo enganoso, neutralizar
 * sozinho a cautela de um domínio desconhecido). Quem pesa de verdade contra
 * desinformação são os padrões de conteúdo abaixo (MISINFORMATION_PATTERNS)
 * e, mais ainda, o sinal de IA (lê o significado, não só a formatação).
 */
function analyzeHeuristics({ title = '', text = '', author = '', publishedDate = '' } = {}) {
  const safeTitle = typeof title === 'string' ? title : '';
  const safeText = typeof text === 'string' ? text : '';
  const combined = `${safeTitle}\n${safeText.slice(0, 4000)}`;

  const findings = [];
  let credibility = 0; // sinais (fracos) de apuração — autor, data, tamanho
  let penalty = 0; // sinais de sensacionalismo/desinformação — somam aqui

  if (author && author.trim()) {
    credibility += 0.1;
  }
  if (publishedDate && publishedDate.trim()) {
    credibility += 0.1;
  }
  if (safeText.trim().length >= 400) {
    credibility += 0.05;
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

  for (const pattern of MISINFORMATION_PATTERNS) {
    if (pattern.test(combined)) {
      penalty += 0.4;
      findings.push('Texto contém alegação(ões) com padrão recorrente em boatos/desinformação já desmentidos (ex.: cura milagrosa, antivacina, conspiração).');
      break;
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

  const alarmEmoji = countAlarmEmoji(combined);
  if (alarmEmoji >= 3) {
    penalty += 0.15;
    findings.push('Uso excessivo de emojis de alarme/urgência (🚨⚠️😱), comum em correntes compartilhadas, incomum em reportagem.');
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
