'use strict';
chrome.storage.local.get(['captures', 'lastCaptureAt'], ({ captures = [], lastCaptureAt }) => {
  document.querySelector('#status').textContent = captures.length ? `${captures.length} local dashboard responses · last capture ${new Date(lastCaptureAt).toLocaleString()}` : 'No dashboard responses captured yet.';
});
document.querySelector('#open').addEventListener('click', () => chrome.tabs.create({ url: 'http://localhost:8000/' }));
document.querySelector('#clear').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'CLEAR_CAPTURES' }, () => window.close()));
