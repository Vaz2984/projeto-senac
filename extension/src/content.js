'use strict';

// Content script: só EXTRAI dados públicos já visíveis na página (título,
// texto, autor, data, domínio) e manda para o background analisar. Nunca
// busca nenhuma URL por conta própria — sem isso o backend não teria como
// sofrer SSRF via extensão (ver PRIVACY.md do backend).
/* global FactAIBrowserAPI */

const MAX_TEXT_CHARS = 20000;
const MAX_URL_CHARS = 2048; // mesmo limite de backend/src/routes/analyze.js (MAX_FIELD_LENGTHS.url)

function metaContent(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const value = el.getAttribute('content') || el.getAttribute('datetime') || el.textContent;
      if (value && value.trim()) return value.trim();
    }
  }
  return '';
}

function extractTitle() {
  const og = metaContent(['meta[property="og:title"]', 'meta[name="twitter:title"]']);
  if (og) return og;
  const h1 = document.querySelector('h1');
  if (h1 && h1.textContent.trim()) return h1.textContent.trim();
  return document.title || '';
}

function extractAuthor() {
  return metaContent([
    'meta[name="author"]',
    'meta[property="article:author"]',
    '[rel="author"]',
    '[itemprop="author"]',
  ]);
}

function extractPublishedDate() {
  const meta = metaContent([
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="publish-date"]',
    'time[datetime]',
    'time',
  ]);
  return meta;
}

/**
 * Heurística simples de extração de artigo (sem lib externa): prioriza a
 * tag <article>; se ausente, agrupa parágrafos pelo elemento-pai comum e
 * escolhe o grupo com mais texto — costuma ser o corpo da notícia, não o
 * menu/rodapé/comentários.
 */
function extractMainText() {
  const article = document.querySelector('article');
  if (article && article.innerText && article.innerText.trim().length > 200) {
    return article.innerText.trim().slice(0, MAX_TEXT_CHARS);
  }

  const paragraphs = Array.from(document.querySelectorAll('p'));
  const groups = new Map();
  for (const p of paragraphs) {
    const text = p.innerText ? p.innerText.trim() : '';
    if (!text || text.length < 20) continue;
    const parent = p.parentElement;
    if (!parent) continue;
    const key = parent;
    const entry = groups.get(key) || { length: 0, texts: [] };
    entry.length += text.length;
    entry.texts.push(text);
    groups.set(key, entry);
  }

  let best = null;
  for (const entry of groups.values()) {
    if (!best || entry.length > best.length) best = entry;
  }

  if (best) return best.texts.join('\n\n').slice(0, MAX_TEXT_CHARS);
  return document.body ? document.body.innerText.trim().slice(0, MAX_TEXT_CHARS) : '';
}

function extractArticle() {
  return {
    url: location.href.slice(0, MAX_URL_CHARS),
    domain: location.hostname,
    title: extractTitle().slice(0, 500),
    text: extractMainText(),
    author: extractAuthor().slice(0, 200),
    publishedDate: extractPublishedDate().slice(0, 100),
  };
}

// --- Detecção "isso é mesmo uma notícia?" --------------------------------
//
// Antes, a única verificação era "tem texto suficiente?" — o que faz uma
// página de produto de e-commerce, um perfil de rede social ou uma doc
// técnica (todos com bastante texto corrido) ser tratada como se fosse uma
// matéria jornalística e receber um veredito de semáforo sem sentido. Os
// sinais abaixo olham a ESTRUTURA da página, não só o tamanho do texto.

// Tipos schema.org que indicam conteúdo jornalístico/editorial
// (https://schema.org/NewsArticle e afins). Sites que querem aparecer no
// Google Notícias se declaram assim de propósito — é o sinal mais confiável
// que dá pra checar sem nenhuma biblioteca externa.
const NEWS_SCHEMA_TYPES = new Set([
  'newsarticle',
  'article',
  'reportagenewsarticle',
  'analysisnewsarticle',
  'backgroundnewsarticle',
  'opinionnewsarticle',
  'reviewnewsarticle',
  'blogposting',
  'liveblogposting',
]);

function collectJsonLdTypes(node, types, depth) {
  if (!node || depth > 4) return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdTypes(item, types, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  const t = node['@type'];
  if (typeof t === 'string') types.add(t.toLowerCase());
  else if (Array.isArray(t)) {
    for (const x of t) {
      if (typeof x === 'string') types.add(x.toLowerCase());
    }
  }
  // @graph e mainEntity são onde a maioria dos sites aninha o tipo real.
  if (node['@graph']) collectJsonLdTypes(node['@graph'], types, depth + 1);
  if (node.mainEntity) collectJsonLdTypes(node.mainEntity, types, depth + 1);
}

function extractJsonLdTypes() {
  const types = new Set();
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    const raw = script.textContent;
    if (!raw || raw.length > 100000) continue; // evita JSON-LD gigante/custoso de analisar
    try {
      collectJsonLdTypes(JSON.parse(raw), types, 0);
    } catch {
      // JSON-LD malformado é comum e inofensivo — só ignora esse bloco.
    }
  }
  return types;
}

/**
 * Reúne sinais estruturais de "isso é uma notícia" e os soma num score:
 * positivos quando a própria página se declara artigo/matéria (schema.org,
 * Open Graph, tag <article> — hoje só informativo, não é exigido pra
 * liberar a análise, ver isLikelyNewsArticle), negativo quando há indício
 * claro de OUTRA coisa (loja, documentação técnica). Importante: ausência
 * de marcação positiva NÃO é tratada como "não é notícia" — um boato
 * compartilhado como post curto e sem metadado nenhum é exatamente o tipo
 * de conteúdo que esta extensão existe pra pegar; só sinais negativos
 * explícitos derrubam a decisão.
 */
function detectArticleSignals(article) {
  const reasons = [];
  let score = 0;

  let hasNewsSchema = false;
  for (const t of extractJsonLdTypes()) {
    if (NEWS_SCHEMA_TYPES.has(t)) {
      hasNewsSchema = true;
      break;
    }
  }
  if (hasNewsSchema) {
    score += 2;
    reasons.push('A página se declara artigo/notícia via dados estruturados (schema.org).');
  }

  if (metaContent(['meta[property="og:type"]']).toLowerCase() === 'article') {
    score += 1;
    reasons.push('Meta tag og:type=article presente.');
  }

  if (metaContent(['meta[property="article:published_time"]'])) {
    score += 1;
    reasons.push('Meta tag de data de publicação de artigo presente.');
  }

  const articleEl = document.querySelector('article');
  const articleTextLen = articleEl && articleEl.innerText ? articleEl.innerText.trim().length : 0;
  if (articleTextLen > 200) {
    score += 1;
    reasons.push('Página usa a tag <article> com bastante texto.');
  }

  const hasCartUi = Boolean(
    document.querySelector(
      '[class*="add-to-cart" i], [id*="add-to-cart" i], button[class*="add-to-cart" i], ' +
        '[class*="adicionar-ao-carrinho" i], [class*="comprar-agora" i], [id*="buy-now" i]',
    ),
  );
  if (hasCartUi) {
    score -= 2;
    reasons.push('Página tem indícios de loja/e-commerce (botão de compra/carrinho).');
  }

  // Documentação técnica (API docs, README, Stack Overflow) costuma ter o
  // "texto principal" extraído dominado por blocos de código — um padrão
  // que reportagem real praticamente nunca tem (mesmo cobrindo algo técnico,
  // o texto em volta do código é a maior parte).
  const codeLen = Array.from(document.querySelectorAll('pre, code')).reduce(
    (sum, el) => sum + (el.innerText ? el.innerText.length : 0),
    0,
  );
  const mainTextLen = (article && article.text && article.text.length) || 1;
  if (codeLen > 400 && codeLen / mainTextLen > 0.45) {
    score -= 1;
    reasons.push('Conteúdo dominado por blocos de código — parece documentação técnica, não notícia.');
  }

  return { score, reasons };
}

/**
 * Decide se vale a pena analisar a página como notícia. Só dois critérios,
 * de propósito: texto curto demais nunca vale análise (não há o que ler),
 * e um sinal NEGATIVO explícito (loja, documentação) derruba a decisão.
 * Fora isso, aceita por padrão — inclusive sem nenhuma marcação positiva —
 * porque um post de boato típico raramente tem schema.org/og:type, e
 * recusar esses é recusar exatamente o caso que a extensão precisa cobrir.
 */
function isLikelyNewsArticle(article, signals) {
  if (article.text.length < 150) return false;
  if (signals.score <= -1) return false;
  return true;
}

// Devolve o resultado da análise (não só dispara e esquece) para que um
// pedido explícito de reanálise (vindo do popup) possa mostrar o resultado
// real assim que ele chegar, em vez de um popup adivinhar quanto tempo esperar.
//
// `force`: ignora a detecção de "isso é notícia?" — usado quando o usuário
// clica em "Analisar mesmo assim" no popup após a extensão recusar a
// página automaticamente (a detecção é uma heurística, pode errar).
function requestAnalysis(force = false) {
  const article = extractArticle();
  const signals = detectArticleSignals(article);

  if (!force && !isLikelyNewsArticle(article, signals)) {
    return FactAIBrowserAPI.runtime
      .sendMessage({ type: 'FACTAI_NOT_NEWS', reasons: signals.reasons })
      .catch(() => {}) // background pode não estar pronto ainda; não é fatal aqui
      .then(() => ({ ok: false, reason: 'not_news_page', reasons: signals.reasons }));
  }

  return FactAIBrowserAPI.runtime
    .sendMessage({ type: 'FACTAI_ANALYZE', article })
    .then((result) => ({ ok: true, result }))
    .catch(() => ({ ok: false, reason: 'background_unreachable' }));
  // "background_unreachable": acontece se o background não estiver pronto
  // ainda (ex.: extensão recém-instalada) — ignorado na carga automática,
  // mas repassado numa reanálise manual (ver listener FACTAI_REQUEST_REANALYZE).
}

// Roda na carga inicial da página.
requestAnalysis();

// Acompanha navegação em SPAs (troca de URL sem recarregar a página) e
// reanalisa quando o conteúdo principal muda de fato.
let lastUrl = location.href;
let debounceTimer = null;
const observer = new MutationObserver(() => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(requestAnalysis, 800);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// Responde a pedidos manuais de reanálise vindos do popup (via background),
// devolvendo o resultado real assim que a análise termina.
FactAIBrowserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'FACTAI_REQUEST_REANALYZE') {
    requestAnalysis(Boolean(message.force)).then(sendResponse);
    return true; // resposta assíncrona
  }
  return false;
});
