'use strict';

const CAPTURE_LIMIT = 30;
const FEED_URL = 'https://smmoulder.substack.com/feed';

async function captures() {
  return (await chrome.storage.local.get('captures')).captures || [];
}

async function storeCapture(capture) {
  const current = await captures();
  const fingerprint = `${capture.url}:${JSON.stringify(capture.data).slice(0, 500)}`;
  const unique = current.filter((item) => item.fingerprint !== fingerprint);
  unique.unshift({ ...capture, fingerprint });
  await chrome.storage.local.set({ captures: unique.slice(0, CAPTURE_LIMIT), lastCaptureAt: capture.capturedAt });
}

async function getSyncData() {
  const stored = await chrome.storage.local.get(['captures', 'lastCaptureAt']);
  let feedXml = '';
  try {
    const response = await fetch(FEED_URL, { credentials: 'omit', cache: 'no-store' });
    if (response.ok) feedXml = await response.text();
  } catch { /* Private captures can still sync when the public feed is unavailable. */ }
  return { captures: stored.captures || [], capturedAt: stored.lastCaptureAt || null, feedXml };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'STORE_CAPTURE' && sender.tab?.url?.includes('substack.com')) {
    storeCapture(message.capture).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message?.type === 'GET_SYNC_DATA') {
    getSyncData().then(sendResponse).catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message?.type === 'CLEAR_CAPTURES') {
    chrome.storage.local.remove(['captures', 'lastCaptureAt']).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
