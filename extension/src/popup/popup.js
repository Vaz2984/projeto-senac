'use strict';

/* global FactAIBrowserAPI */

const STATES = ['loadingState', 'noDataState', 'notConfiguredState', 'errorState', 'resultState'];

const VERDICT_LABELS = {
  green: 'Confiável',
  yellow: 'Duvidoso — verifique com cuidado',
  red: 'Não acredite — sinais graves de desinformação',
};

const SIGNAL_LABELS = {
  domain: 'domínio',
  heuristics: 'heurísticas',
  factcheck: 'fact-check',
  llm: 'IA',
};

let currentTabId = null;

function showState(stateId) {
  for (const id of STATES) {
    document.getElementById(id).classList.toggle('hidden', id !== stateId);
  }
}

function renderResult(data) {
  const circle = document.getElementById('semaphoreCircle');
  circle.className = `semaphore-circle ${data.verdict}`;

  document.getElementById('verdictLabel').textContent = VERDICT_LABELS[data.verdict] || data.verdict;
  document.getElementById('scoreLabel').textContent = `Confiança: ${data.score}/100`;

  const reasonsList = document.getElementById('reasonsList');
  reasonsList.innerHTML = '';
  (data.reasons || []).forEach((reason) => {
    const li = document.createElement('li');
    li.textContent = reason;
    reasonsList.appendChild(li);
  });

  const factChecksSection = document.getElementById('factChecksSection');
  const factChecksList = document.getElementById('factChecksList');
  factChecksList.innerHTML = '';
  if (data.factChecks && data.factChecks.length > 0) {
    data.factChecks.forEach((claim) => {
      const li = document.createElement('li');
      const label = `${claim.publisher}: "${claim.rating}"`;
      if (claim.url) {
        const a = document.createElement('a');
        a.href = claim.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = label;
        li.appendChild(a);
      } else {
        li.textContent = label;
      }
      factChecksList.appendChild(li);
    });
    factChecksSection.classList.remove('hidden');
  } else {
    factChecksSection.classList.add('hidden');
  }

  const llmSection = document.getElementById('llmSection');
  if (data.llm && data.llm.summary) {
    document.getElementById('llmSummary').textContent = data.llm.summary;
    llmSection.classList.remove('hidden');
  } else {
    llmSection.classList.add('hidden');
  }

  const signalsUsed = (data.signalsUsed || []).map((s) => SIGNAL_LABELS[s] || s);
  document.getElementById('signalsUsedLabel').textContent = signalsUsed.length
    ? `Sinais usados: ${signalsUsed.join(', ')}`
    : 'Nenhum sinal disponível';

  showState('resultState');
}

function renderFromBackgroundResult(result) {
  if (!result || result.status === 'no_data') {
    showState('noDataState');
    return;
  }
  if (result.status === 'not_configured') {
    showState('notConfiguredState');
    return;
  }
  if (result.status === 'error') {
    document.getElementById('errorMessage').textContent =
      result.message || 'Não foi possível analisar esta página.';
    showState('errorState');
    return;
  }
  if (result.status === 'ok') {
    renderResult(result.data);
    return;
  }
  showState('noDataState');
}

async function loadResult() {
  showState('loadingState');
  const result = await FactAIBrowserAPI.runtime.sendMessage({
    type: 'FACTAI_GET_RESULT',
    tabId: currentTabId,
  });
  renderFromBackgroundResult(result);
}

async function triggerReanalyze() {
  showState('loadingState');
  // FACTAI_REANALYZE já devolve o resultado real da nova análise (o
  // background espera o content script terminar) — sem timeout chutado.
  const result = await FactAIBrowserAPI.runtime.sendMessage({ type: 'FACTAI_REANALYZE', tabId: currentTabId });
  renderFromBackgroundResult(result);
}

function openOptionsPage() {
  const runtimeApi = typeof browser !== 'undefined' ? browser : chrome; // eslint-disable-line no-undef
  if (runtimeApi.runtime.openOptionsPage) {
    runtimeApi.runtime.openOptionsPage();
  } else {
    window.open(FactAIBrowserAPI.runtime.getURL('src/options/options.html'));
  }
}

document.getElementById('optionsBtn').addEventListener('click', openOptionsPage);
document.getElementById('goToOptionsBtn').addEventListener('click', openOptionsPage);
document.getElementById('analyzeBtn').addEventListener('click', triggerReanalyze);
document.getElementById('retryBtn').addEventListener('click', triggerReanalyze);
document.getElementById('reanalyzeBtn').addEventListener('click', triggerReanalyze);

(async function init() {
  const tabs = await FactAIBrowserAPI.tabs.query({ active: true, currentWindow: true });
  currentTabId = tabs && tabs[0] ? tabs[0].id : null;
  await loadResult();
})();
