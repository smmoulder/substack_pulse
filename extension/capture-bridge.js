(() => {
  'use strict';
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== 'SUBSTACK_PULSE_CAPTURE') return;
    chrome.runtime.sendMessage({ type: 'STORE_CAPTURE', capture: { url: event.data.url, capturedAt: event.data.capturedAt, data: event.data.data } });
  });
})();
