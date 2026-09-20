(() => {
  'use strict';
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== 'SUBSTACK_PULSE_REQUEST_SYNC') return;
    const requestId = event.data.requestId;
    chrome.runtime.sendMessage({ type: 'GET_SYNC_DATA' }, (payload) => {
      const error = chrome.runtime.lastError?.message;
      window.postMessage({ type: 'SUBSTACK_PULSE_SYNC_RESULT', requestId, payload, error }, window.location.origin);
    });
  });
  window.postMessage({ type: 'SUBSTACK_PULSE_CONNECTOR_READY' }, window.location.origin);
})();
