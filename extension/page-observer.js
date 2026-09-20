(() => {
  'use strict';
  const EVENT_TYPE = 'SUBSTACK_PULSE_CAPTURE';
  const SENSITIVE_KEY = /(token|secret|password|cookie|authorization|session|csrf)/i;
  const MAX_TEXT_LENGTH = 1_500_000;

  function redact(value, depth = 0) {
    if (depth > 12 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice(0, 2000).map((item) => redact(item, depth + 1));
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, child]) => [key, redact(child, depth + 1)]));
  }

  function publish(url, data) {
    if (!data || typeof data !== 'object') return;
    window.postMessage({ type: EVENT_TYPE, url, capturedAt: new Date().toISOString(), data: redact(data) }, window.location.origin);
  }

  async function inspectResponse(response) {
    try {
      const type = response.headers.get('content-type') || '';
      if (!type.includes('json')) return;
      const text = await response.clone().text();
      if (text.length > MAX_TEXT_LENGTH) return;
      publish(response.url, JSON.parse(text));
    } catch { /* A failed observation must never affect the Substack page. */ }
  }

  const nativeFetch = window.fetch;
  window.fetch = async function pulseObservedFetch(...args) {
    const response = await nativeFetch.apply(this, args);
    inspectResponse(response);
    return response;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function pulseObservedOpen(method, url, ...rest) {
    this.__pulseUrl = new URL(String(url), window.location.href).href;
    return nativeOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function pulseObservedSend(...args) {
    this.addEventListener('load', () => {
      try {
        const type = this.getResponseHeader('content-type') || '';
        if (type.includes('json') && this.responseText?.length <= MAX_TEXT_LENGTH) publish(this.__pulseUrl, JSON.parse(this.responseText));
      } catch { /* Observation remains non-blocking. */ }
    }, { once: true });
    return nativeSend.apply(this, args);
  };
})();
