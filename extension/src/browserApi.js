'use strict';

// Shim mínimo para rodar o mesmo código em Chrome/Edge (namespace `chrome`,
// APIs por callback) e Firefox (namespace `browser`, Promises nativas).
// Script clássico (não-módulo) carregado antes dos outros — cria o global
// `FactAIBrowserAPI` compartilhado por content script, background e
// popup/options. Evita depender de uma lib externa vendorizada.
/* global chrome, browser, importScripts */

const rootApi = typeof browser !== 'undefined' ? browser : chrome;
const isFirefox = typeof browser !== 'undefined';

function promisify(fn, thisArg) {
  return (...args) =>
    new Promise((resolve, reject) => {
      try {
        fn.call(thisArg, ...args, (result) => {
          const err = chrome.runtime && chrome.runtime.lastError;
          if (err) return reject(new Error(err.message));
          resolve(result);
        });
      } catch (err) {
        reject(err);
      }
    });
}

const FactAIBrowserAPI = {
  isFirefox,
  storage: {
    get: isFirefox
      ? (keys) => browser.storage.local.get(keys)
      : promisify(chrome.storage.local.get, chrome.storage.local),
    set: isFirefox
      ? (items) => browser.storage.local.set(items)
      : promisify(chrome.storage.local.set, chrome.storage.local),
  },
  tabs: {
    query: isFirefox ? (q) => browser.tabs.query(q) : promisify(chrome.tabs.query, chrome.tabs),
    sendMessage: isFirefox
      ? (tabId, msg) => browser.tabs.sendMessage(tabId, msg)
      : promisify(chrome.tabs.sendMessage, chrome.tabs),
  },
  runtime: {
    sendMessage: isFirefox
      ? (msg) => browser.runtime.sendMessage(msg)
      : promisify(chrome.runtime.sendMessage, chrome.runtime),
    onMessage: rootApi.runtime.onMessage,
    getURL: (path) => rootApi.runtime.getURL(path),
  },
  action: rootApi.action || rootApi.browserAction,
};
