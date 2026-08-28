'use strict';

/* global FactAIBrowserAPI */

const urlInput = document.getElementById('backendUrl');
const statusEl = document.getElementById('statusMessage');
const signalsList = document.getElementById('signalsList');

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = `status ${type || ''}`.trim();
}

function normalizeUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function loadSavedUrl() {
  const stored = await FactAIBrowserAPI.storage.get(['factaiBackendUrl']);
  if (stored && stored.factaiBackendUrl) {
    urlInput.value = stored.factaiBackendUrl;
  }
}

async function saveUrl() {
  const url = normalizeUrl(urlInput.value);
  if (!url) {
    setStatus('Informe a URL do backend antes de salvar.', 'error');
    return;
  }
  if (!isValidHttpUrl(url)) {
    setStatus('URL inválida — use algo como https://seu-backend.onrender.com', 'error');
    return;
  }
  await FactAIBrowserAPI.storage.set({ factaiBackendUrl: url });
  setStatus('Salvo! A extensão já vai usar este backend nas próximas análises.', 'ok');
}

async function testConnection() {
  const url = normalizeUrl(urlInput.value);
  if (!url || !isValidHttpUrl(url)) {
    setStatus('Informe uma URL válida antes de testar.', 'error');
    return;
  }

  setStatus('Testando conexão…', '');
  signalsList.innerHTML = '<li class="muted">Testando…</li>';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${url}/api/health`, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      setStatus(`O backend respondeu com erro ${res.status}.`, 'error');
      signalsList.innerHTML = '<li class="muted">—</li>';
      return;
    }

    const data = await res.json();
    setStatus('Conexão bem-sucedida!', 'ok');

    signalsList.innerHTML = '';
    const items = [
      ['Domínio + heurísticas', true],
      ['Google Fact Check Tools API', Boolean(data.signals && data.signals.factcheck)],
      ['Análise por IA (Anthropic)', Boolean(data.signals && data.signals.llm)],
    ];
    for (const [label, active] of items) {
      const li = document.createElement('li');
      li.textContent = `${active ? '✅' : '⭕'} ${label}${active ? '' : ' (não configurado)'}`;
      signalsList.appendChild(li);
    }
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    setStatus(
      timedOut ? 'O backend demorou demais para responder.' : `Não foi possível conectar: ${err.message}`,
      'error',
    );
    signalsList.innerHTML = '<li class="muted">—</li>';
  }
}

document.getElementById('saveBtn').addEventListener('click', saveUrl);
document.getElementById('testBtn').addEventListener('click', testConnection);

loadSavedUrl();
