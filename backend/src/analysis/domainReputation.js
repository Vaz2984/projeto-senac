'use strict';

const path = require('node:path');
const fs = require('node:fs');

const DOMAINS_PATH = path.join(__dirname, '..', 'data', 'domains.json');

/**
 * Carrega a lista de domínios uma única vez e monta mapas de consulta O(1).
 * Se o arquivo estiver ausente ou corrompido, o serviço continua no ar com
 * uma base vazia (o sinal de domínio simplesmente fica "desconhecido" para
 * tudo) em vez de derrubar o servidor inteiro — robustez > uma feature.
 */
function loadDomainMap() {
  const map = new Map();
  try {
    const raw = fs.readFileSync(DOMAINS_PATH, 'utf8');
    const data = JSON.parse(raw);
    for (const category of ['reliable', 'questionable', 'fake', 'satire']) {
      const list = Array.isArray(data[category]) ? data[category] : [];
      for (const domain of list) {
        if (typeof domain === 'string' && domain.trim()) {
          map.set(domain.trim().toLowerCase(), category);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[domainReputation] falha ao carregar domains.json, seguindo sem base local:', err.message);
  }
  return map;
}

const domainMap = loadDomainMap();

// Score -1..+1 por categoria, usado depois pelo scorer para compor o score 0-100.
const CATEGORY_SCORE = {
  reliable: 1,
  questionable: -0.3,
  fake: -1,
  satire: -0.6,
};

const CATEGORY_LABEL_PT = {
  reliable: 'fonte com histórico de checagem editorial',
  questionable: 'fonte com viés forte ou baixo rigor de apuração conhecido',
  fake: 'fonte já desmentida repetidamente por agências de checagem',
  satire: 'fonte de humor/paródia (não é uma notícia real)',
};

/**
 * Normaliza um hostname (remove porta, "www.", passa para minúsculas) e
 * tenta encontrar o domínio exato ou o domínio-pai mais próximo na base
 * (ex.: "noticias.exemplo.com" cai em "exemplo.com" se cadastrado assim).
 */
function normalizeHost(rawDomain) {
  if (!rawDomain || typeof rawDomain !== 'string') return null;
  let host = rawDomain.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  if (host.startsWith('www.')) host = host.slice(4);
  return host || null;
}

function lookupDomain(rawDomain) {
  const host = normalizeHost(rawDomain);
  if (!host) {
    return { known: false, category: null, host: null };
  }

  if (domainMap.has(host)) {
    return { known: true, category: domainMap.get(host), host };
  }

  // Tenta achar por sufixo (ex.: sub.dominio.com -> dominio.com cadastrado).
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (domainMap.has(candidate)) {
      return { known: true, category: domainMap.get(candidate), host };
    }
  }

  return { known: false, category: null, host };
}

/**
 * Sinal de reputação de domínio: sempre disponível, sem custo, sem chamada
 * de rede. Retorna null quando o domínio é desconhecido (não entra na média
 * do scorer, não "puxa" o score para nenhum lado).
 */
function analyzeDomain(rawDomain) {
  const { known, category, host } = lookupDomain(rawDomain);

  if (!known) {
    return {
      available: false,
      host,
      known: false,
      category: null,
      contribution: null,
      reason: host
        ? `Domínio "${host}" não consta na base local (nem confiável nem desmentido) — sinal de domínio não usado.`
        : null,
    };
  }

  return {
    available: true,
    host,
    known: true,
    category,
    contribution: CATEGORY_SCORE[category],
    reason: `Domínio "${host}": ${CATEGORY_LABEL_PT[category]}.`,
  };
}

module.exports = { analyzeDomain, normalizeHost, lookupDomain };
