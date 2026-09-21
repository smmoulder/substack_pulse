'use strict';
const manifest = chrome.runtime.getManifest();
document.querySelector('#build').textContent = `Extension ${manifest.version} · ID ${chrome.runtime.id}`;
chrome.storage.local.get(['captures', 'lastCaptureAt'], ({ captures = [], lastCaptureAt }) => {
  document.querySelector('#status').textContent = captures.length ? `${captures.length} local dashboard responses · last capture ${new Date(lastCaptureAt).toLocaleString()}` : 'No dashboard responses captured yet.';
});
document.querySelector('#open').addEventListener('click', () => chrome.tabs.create({ url: 'http://localhost:8000/' }));
document.querySelector('#export').addEventListener('click', () => chrome.storage.local.get(['captures', 'lastCaptureAt'], (data) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `substack-pulse-redacted-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
document.querySelector('#clear').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'CLEAR_CAPTURES' }, () => window.close()));
