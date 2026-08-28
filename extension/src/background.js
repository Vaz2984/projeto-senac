'use strict';

// Service worker (Chrome/Edge) / script de background (Firefox). Orquestra:
// recebe o artigo extraído pelo content script, chama o backend configurado
// nas opções, guarda o resultado por aba e pinta o badge do ícone.
/* global importScripts, FactAIBrowserAPI, browser, chrome */

if (typeof importScripts === 'function' && typeof FactAIBrowserAPI === 'undefined') {
  importScripts('browserApi.js');
}

const BADGE_COLORS = {
  green: '#2fae60',
  yellow: '#e0a100',
  red: '#d64545',
};
const BADGE_TEXT = { green: 'OK', yellow: '!', red: 'X' };

const FETCH_TIMEOUT_MS = 15000;

// Estado em memória: resultado da última análise por aba. Perdido se o
// service worker for encerrado pelo navegador (normal no MV3) — o popup
// pede uma reanálise automaticamente quando não encontra nada em cache.
const resultsByTab = new Map();

async function getBackendUrl() {
  const stored = await FactAIBrowserAPI.storage.get(['factaiBackendUrl']);
  const url = (stored && stored.factaiBackendUrl) || '';
  return url.trim().replace(/\/+$/, '');
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function setBadge(tabId, verdict) {
  if (!tabId) return;
  const action = FactAIBrowserAPI.action;
  if (!action) return;
  action.setBadgeText({ tabId, text: BADGE_TEXT[verdict] || '' });
  action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS[verdict] || '#888888' });
}

function clearBadge(tabId) {
  const action = FactAIBrowserAPI.action;
  if (!action || !tabId) return;
  action.setBadgeText({ tabId, text: '' });
}

async function analyzeArticle(article, tabId) {
  const backendUrl = await getBackendUrl();

  if (!backendUrl) {
    const result = { status: 'not_configured' };
    if (tabId) resultsByTab.set(tabId, result);
    clearBadge(tabId);
    return result;
  }

  try {
    const res = await fetchWithTimeout(
      `${backendUrl}/api/analyze`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(article),
      },
      FETCH_TIMEOUT_MS,
    );

    if (!res.ok) {
      let message = `O backend respondeu com erro ${res.status}.`;
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch {
        // resposta sem JSON — mantém mensagem genérica
      }
      const result = { status: 'error', message };
      if (tabId) resultsByTab.set(tabId, result);
      clearBadge(tabId);
      return result;
    }

    const data = await res.json();
    const result = { status: 'ok', article, data, analyzedAt: Date.now() };
    if (tabId) resultsByTab.set(tabId, result);
    setBadge(tabId, data.verdict);
    return result;
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    const result = {
      status: 'error',
      message: timedOut
        ? 'O backend demorou demais para responder (timeout).'
        : `Não foi possível contatar o backend: ${err.message}`,
    };
    if (tabId) resultsByTab.set(tabId, result);
    clearBadge(tabId);
    return result;
  }
}

FactAIBrowserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'FACTAI_ANALYZE') {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    analyzeArticle(message.article, tabId).then(sendResponse);
    return true; // resposta assíncrona
  }

  if (message.type === 'FACTAI_GET_RESULT') {
    const tabId = message.tabId;
    const cached = tabId ? resultsByTab.get(tabId) : null;
    sendResponse(cached || { status: 'no_data' });
    return false;
  }

  if (message.type === 'FACTAI_REANALYZE') {
    const tabId = message.tabId;
    if (!tabId) {
      sendResponse({ status: 'error', message: 'Aba inválida.' });
      return false;
    }
    FactAIBrowserAPI.tabs
      .sendMessage(tabId, { type: 'FACTAI_REQUEST_REANALYZE' })
      .then(() => sendResponse({ ok: true }))
      .catch((err) =>
        sendResponse({
          ok: false,
          message: 'Não foi possível reanalisar esta página (recarregue a aba e tente novamente).',
          debug: err && err.message,
        }),
      );
    return true;
  }

  return false;
});

// Limpa o cache/badge quando a aba navega para outra página, para não
// mostrar o resultado da página anterior enquanto a nova ainda não respondeu.
const nativeTabsApi = (typeof browser !== 'undefined' ? browser : chrome).tabs;

if (nativeTabsApi && nativeTabsApi.onUpdated) {
  nativeTabsApi.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading' && changeInfo.url) {
      resultsByTab.delete(tabId);
      clearBadge(tabId);
    }
  });
}

if (nativeTabsApi && nativeTabsApi.onRemoved) {
  nativeTabsApi.onRemoved.addListener((tabId) => {
    resultsByTab.delete(tabId);
  });
}
