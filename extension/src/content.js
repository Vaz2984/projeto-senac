'use strict';

// Content script: só EXTRAI dados públicos já visíveis na página (título,
// texto, autor, data, domínio) e manda para o background analisar. Nunca
// busca nenhuma URL por conta própria — sem isso o backend não teria como
// sofrer SSRF via extensão (ver PRIVACY.md do backend).
/* global FactAIBrowserAPI */

const MAX_TEXT_CHARS = 20000;

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
    url: location.href,
    domain: location.hostname,
    title: extractTitle().slice(0, 500),
    text: extractMainText(),
    author: extractAuthor().slice(0, 200),
    publishedDate: extractPublishedDate().slice(0, 100),
  };
}

function requestAnalysis() {
  const article = extractArticle();
  // Páginas sem texto suficiente (ex.: home de e-commerce, app) não valem análise.
  if (article.text.length < 150) return;
  FactAIBrowserAPI.runtime.sendMessage({ type: 'FACTAI_ANALYZE', article }).catch(() => {
    // Background pode não estar pronto ainda (ex.: extensão recém-instalada) — ignora silenciosamente.
  });
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

// Responde a pedidos manuais de reanálise vindos do popup.
FactAIBrowserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'FACTAI_REQUEST_REANALYZE') {
    requestAnalysis();
    sendResponse({ ok: true });
  }
  return false;
});
