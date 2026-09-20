(() => {
  'use strict';

  const OWNER_NAME = 'Stuart Moulder';
  const STORAGE_KEY = 'substack-pulse-derived-v1';
  const state = { files: [], subscribers: [], posts: [], comments: [], revenues: [], replies: [], dismissed: [], activeFilter: 'all', sources: {}, capabilities: {}, datasets: {}, range: '30' };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const aliases = {
    name: ['name', 'user_name', 'display_name', 'author_name', 'subscriber_name', 'first_name'],
    email: ['email', 'email_address', 'user_email'],
    status: ['status', 'subscription_status', 'subscriber_status'],
    plan: ['plan', 'type', 'subscription_type', 'subscription_tier', 'plan_name', 'is_paid', 'stripe_subscription_status'],
    created: ['created_at', 'created', 'date', 'post_date', 'published_at', 'publication_date', 'email_sent_at', 'timestamp'],
    title: ['title', 'post_title', 'subject'],
    subtitle: ['subtitle', 'description'],
    body: ['body', 'comment', 'text', 'content', 'message'],
    id: ['id', 'comment_id', 'note_id'],
    parent: ['parent_id', 'parent_comment_id', 'reply_to_id', 'ancestor_id'],
    postId: ['post_id', 'publication_id', 'article_id'],
    openRate: ['open_rate', 'email_open_rate', 'opens_rate', 'open rate'],
    views: ['views', 'web_views', 'total_views', 'view_count'],
    opens: ['opens', 'email_opens', 'unique_opens'],
    likes: ['likes', 'reactions', 'like_count'],
    commentCount: ['comments', 'comment_count', 'comments_count'],
    revenue: ['revenue', 'amount', 'net_revenue', 'gross_revenue'],
    currency: ['currency', 'currency_code'],
    url: ['url', 'canonical_url', 'post_url']
  };

  function normalizeHeader(value) {
    return String(value || '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    const source = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (quoted) {
        if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (char !== '\r') field += char;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map(normalizeHeader);
    return rows.filter((values) => values.some((value) => value.trim())).map((values) =>
      Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, (values[index] || '').trim()]))
    );
  }

  function get(row, keys) {
    for (const key of keys) {
      const value = row[normalizeHeader(key)];
      if (value !== undefined && value !== '') return value;
    }
    return '';
  }

  function numeric(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const cleaned = String(value || '').replace(/[%,$£€\s]/g, '').replace(/,/g, '');
    const number = Number(cleaned);
    if (!Number.isFinite(number)) return null;
    return String(value).includes('%') ? number / 100 : number;
  }

  function validDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  function classifyFile(fileName, rows) {
    const name = normalizeHeader(fileName.replace(/\.csv$/i, ''));
    const headers = Object.keys(rows[0] || {});
    if (/subscriber|email_list|audience|member/.test(name) || headers.includes('subscription_status')) return 'subscribers';
    if (/comment|reply|thread/.test(name) || headers.some((h) => ['parent_comment_id', 'comment_id'].includes(h))) return 'comments';
    if (/note/.test(name)) return 'comments';
    if (/post|publication|article|stat/.test(name) || headers.some((h) => ['post_id', 'open_rate', 'email_open_rate'].includes(h))) return 'posts';
    if (/payment|revenue|transaction/.test(name)) return 'revenue';
    return 'unknown';
  }

  function subscriberIsActive(row) {
    const status = get(row, aliases.status).toLowerCase();
    return !status || !/(unsub|inactive|cancel|expired|bounced|deleted)/.test(status);
  }

  function subscriberIsPaid(row) {
    const values = `${get(row, aliases.plan)} ${get(row, aliases.status)}`.toLowerCase();
    return /(paid|annual|monthly|yearly|founding|true)/.test(values) && !/(free|unpaid|cancel|expired|false)/.test(values);
  }

  function normalizePost(row) {
    const rate = numeric(get(row, aliases.openRate));
    return {
      id: get(row, aliases.id) || get(row, aliases.postId),
      title: get(row, aliases.title) || 'Untitled post',
      subtitle: get(row, aliases.subtitle),
      date: get(row, aliases.created),
      openRate: rate !== null && rate > 1 ? rate / 100 : (rate > 0 ? rate : null),
      views: numeric(get(row, aliases.views)),
      opens: numeric(get(row, aliases.opens)),
      likes: numeric(get(row, aliases.likes)),
      comments: numeric(get(row, aliases.commentCount)),
      url: get(row, aliases.url)
    };
  }

  function mergePosts(rows) {
    rows.map(normalizePost).forEach((post) => {
      const existing = state.posts.find((item) => post.id && item.id === post.id)
        || state.posts.find((item) => item.title === post.title && (!item.date || !post.date || item.date === post.date));
      if (existing) Object.keys(post).forEach((key) => { if (post[key] !== '' && post[key] !== null) existing[key] = post[key]; });
      else state.posts.push(post);
    });
  }

  function commentIdentity(row) {
    return get(row, aliases.name) || get(row, aliases.email) || 'Reader';
  }

  function deriveReplies() {
    const byId = new Map(state.comments.map((row, index) => [get(row, aliases.id) || `row-${index}`, row]));
    const children = new Map();
    state.comments.forEach((row) => {
      const parent = get(row, aliases.parent);
      if (parent) children.set(parent, [...(children.get(parent) || []), row]);
    });
    const owner = OWNER_NAME.toLowerCase();
    const waiting = [];
    byId.forEach((row, id) => {
      const author = commentIdentity(row);
      if (author.toLowerCase().includes(owner) || get(row, aliases.parent)) return;
      const descendants = children.get(id) || [];
      const ownerReplied = descendants.some((reply) => commentIdentity(reply).toLowerCase().includes(owner));
      if (ownerReplied) return;
      const date = validDate(get(row, aliases.created));
      const postId = get(row, aliases.postId);
      const post = state.posts.find((item) => item.id && item.id === postId);
      waiting.push({
        id, name: author, initials: initials(author), type: descendants.length ? 'follow' : 'never',
        tag: descendants.length ? 'Follow up' : 'Never replied',
        message: get(row, aliases.body) || 'Message text not included in this export.',
        source: post?.title || get(row, aliases.title) || 'Substack conversation',
        date: date ? date.toISOString() : '', age: date ? relativeDate(date) : 'Date not available'
      });
    });
    state.replies = waiting.filter((reply) => !state.dismissed.includes(reply.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'R';
  }

  function relativeDate(date) {
    const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  }

  async function importFiles(files) {
    const csvFiles = [...files].filter((file) => file.name.toLowerCase().endsWith('.csv'));
    if (!csvFiles.length) throw new Error('Choose one or more CSV files from your Substack export.');
    const parsedFiles = [];
    for (const file of csvFiles) {
      const rows = parseCSV(await file.text());
      const type = classifyFile(file.name, rows);
      parsedFiles.push({ name: file.name, type, rows });
    }
    const recognized = parsedFiles.filter((file) => file.type !== 'unknown');
    if (!recognized.length) {
      const headers = Object.keys(parsedFiles[0]?.rows[0] || {}).slice(0, 8);
      const looksLikeMusic = ['artist', 'album', 'genre', 'plays'].filter((header) => headers.includes(header)).length >= 2;
      throw new Error(looksLikeMusic
        ? 'This appears to be a music-library CSV, not a Substack export. In Substack, open Settings → Exports, download the export, extract the ZIP, and select its CSV files.'
        : `No Substack data was recognized. Found columns: ${headers.join(', ') || 'none'}. Select CSV files from an extracted Substack publication export.`);
    }
    recognized.forEach((file) => { state.datasets[file.name] = { type: file.type, rows: compactRows(file.type, file.rows) }; });
    rebuildImportedData();
    deriveReplies();
    state.sources.privateAt = new Date().toISOString();
    const derived = mergeAvailable(loadSaved(), deriveDashboard());
    derived.datasets = state.datasets;
    saveDerived(derived);
    render(derived);
    const skipped = parsedFiles.length - recognized.length;
    return `${recognized.length} Substack file${recognized.length === 1 ? '' : 's'} added · ${recognized.reduce((sum, file) => sum + file.rows.length, 0).toLocaleString()} rows · ${Object.keys(state.datasets).length} files combined${skipped ? ` · ${skipped} unrelated file${skipped === 1 ? '' : 's'} skipped` : ''}`;
  }

  function compactRows(type, rows) {
    if (type === 'subscribers') return rows.map((row) => ({ email: get(row, aliases.email), name: get(row, aliases.name), status: get(row, aliases.status), plan: get(row, aliases.plan), created_at: get(row, aliases.created) }));
    if (type === 'posts') return rows.map((row) => ({ post_id: get(row, aliases.postId) || get(row, aliases.id), title: get(row, aliases.title), subtitle: get(row, aliases.subtitle), created_at: get(row, aliases.created), open_rate: get(row, aliases.openRate), views: get(row, aliases.views), opens: get(row, aliases.opens), likes: get(row, aliases.likes), comments: get(row, aliases.commentCount), url: get(row, aliases.url) }));
    if (type === 'comments') return rows.map((row) => ({ id: get(row, aliases.id), parent_id: get(row, aliases.parent), post_id: get(row, aliases.postId), author_name: get(row, aliases.name), user_email: get(row, aliases.email), body: get(row, aliases.body), title: get(row, aliases.title), created_at: get(row, aliases.created) }));
    if (type === 'revenue') return rows.map((row) => ({ amount: get(row, aliases.revenue), currency: get(row, aliases.currency), created_at: get(row, aliases.created) }));
    return [];
  }

  function rebuildImportedData() {
    state.subscribers = [];
    state.posts = [];
    state.comments = [];
    state.revenues = [];
    state.capabilities = {};
    Object.values(state.datasets).forEach(({ type, rows }) => {
      if (type === 'subscribers') { state.subscribers.push(...rows); state.capabilities.subscribers = true; }
      else if (type === 'posts') { mergePosts(rows); state.capabilities.posts = true; if (rows.some((row) => get(row, aliases.openRate) || get(row, aliases.views) || get(row, aliases.opens) || get(row, aliases.likes))) state.capabilities.engagement = true; }
      else if (type === 'comments') { state.comments.push(...rows); state.capabilities.comments = true; }
      else if (type === 'revenue') { state.revenues.push(...rows); state.capabilities.revenue = true; }
    });
    dedupeRows(state.subscribers, aliases.email);
    dedupeRows(state.comments, aliases.id);
    state.files = Object.entries(state.datasets).map(([name, dataset]) => ({ name, type: dataset.type, rows: dataset.rows.length }));
  }

  function deriveDashboard() {
    const activeSubscribers = state.subscribers.filter(subscriberIsActive);
    const paid = activeSubscribers.filter(subscriberIsPaid);
    const cutoff = rangeCutoff();
    const newSubscribers = activeSubscribers.filter((row) => {
      const date = validDate(get(row, aliases.created));
      return date && (!cutoff || date >= cutoff);
    }).length;
    const rangedPosts = postsInRange(state.posts);
    const postRates = rangedPosts.map((post) => post.openRate).filter((rate) => rate !== null && rate >= 0 && rate <= 1);
    const revenueRows = state.revenues.map((row) => ({ amount: numeric(get(row, aliases.revenue)), date: validDate(get(row, aliases.created)), currency: get(row, aliases.currency) })).filter((row) => row.amount !== null);
    const recentRevenue = revenueRows.filter((row) => !cutoff || (row.date && row.date >= cutoff));
    const revenue = recentRevenue.length ? recentRevenue.reduce((sum, row) => sum + row.amount, 0) : null;
    const datedPosts = state.posts.map((post) => ({ ...post, parsedDate: validDate(post.date) })).filter((post) => post.parsedDate);
    return {
      importedAt: new Date().toISOString(), files: state.files, sources: state.sources, capabilities: state.capabilities, datasets: state.datasets, range: state.range,
      subscribers: state.subscribers.length ? activeSubscribers.length : null,
      newSubscribers: state.subscribers.length ? newSubscribers : null,
      paid: state.subscribers.length && state.subscribers.some((row) => get(row, aliases.plan)) ? paid.length : null,
      conversion: activeSubscribers.length && paid.length ? paid.length / activeSubscribers.length : null,
      openRate: postRates.length ? postRates.reduce((sum, rate) => sum + rate, 0) / postRates.length : null,
      revenue, currency: recentRevenue.find((row) => row.currency)?.currency || 'USD',
      posts: state.posts, datedPosts: datedPosts.map((post) => ({ ...post, parsedDate: post.parsedDate.toISOString() })),
      raw: { subscribers: state.subscribers, comments: state.comments, revenues: state.revenues },
      replies: state.replies, dismissed: state.dismissed
    };
  }

  function rangeCutoff() {
    if (state.range === 'all') return null;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Number(state.range));
    return cutoff;
  }

  function postsInRange(posts) {
    const cutoff = rangeCutoff();
    if (!cutoff) return posts;
    return posts.filter((post) => { const date = validDate(post.date); return date && date >= cutoff; });
  }

  function render(data) {
    state.posts = data.posts || [];
    state.subscribers = data.raw?.subscribers || state.subscribers;
    state.comments = data.raw?.comments || state.comments;
    state.revenues = data.raw?.revenues || state.revenues;
    state.replies = data.replies || [];
    state.dismissed = data.dismissed || [];
    state.sources = data.sources || {};
    state.capabilities = data.capabilities || {};
    state.datasets = data.datasets || state.datasets || {};
    state.range = data.range || state.range;
    $('#rangeSelect').value = state.range;
    const rangeLabel = state.range === 'all' ? 'all time' : `the last ${state.range} days`;
    $('#revenueLabel').textContent = state.range === 'all' ? 'All-time revenue' : `${state.range}-day revenue`;
    const available = (value, formatter = String) => value === null || value === undefined ? 'Not available' : formatter(value);
    $('#subscriberTotal').textContent = available(data.subscribers, (value) => value.toLocaleString());
    $('#subscriberDetail').textContent = data.newSubscribers === null ? 'Import subscribers.csv' : `${data.newSubscribers.toLocaleString()} joined in ${rangeLabel}`;
    $('#paidTotal').textContent = available(data.paid, (value) => value.toLocaleString());
    $('#paidDetail').textContent = data.conversion === null ? 'Paid status not included in export' : `${formatPercent(data.conversion)} conversion rate`;
    $('#openRate').textContent = available(data.openRate, formatPercent);
    $('#openRateDetail').textContent = data.openRate === null ? 'Open-rate fields not included for this range' : `Average across ${postsInRange(state.posts).filter((post) => post.openRate !== null).length} posts in ${rangeLabel}`;
    $('#revenueTotal').textContent = available(data.revenue, (value) => new Intl.NumberFormat('en', { style: 'currency', currency: data.currency || 'USD', maximumFractionDigits: 0 }).format(value));
    $('#revenueDetail').textContent = data.revenue === null ? 'Revenue not included in export' : `From imported transactions in ${rangeLabel}`;
    if (data.importedAt) $('#syncStatus').innerHTML = `<i></i> Imported ${relativeDate(new Date(data.importedAt)).toLowerCase()}`;
    renderSources();
    renderReplies();
    renderCadence(data.datedPosts || []);
    renderTopContent();
  }

  function formatPercent(value) { return `${(value * 100).toFixed(1)}%`; }

  function renderSources() {
    $('#privateSource').textContent = state.sources.privateAt ? `CSV · ${relativeDate(new Date(state.sources.privateAt))}` : 'No CSV snapshot';
    $('#publicSource').textContent = state.sources.publicAt ? `Feed · ${relativeDate(new Date(state.sources.publicAt))}` : 'Not connected';
    $('#connectorSource').textContent = state.sources.connectorAt ? `Captured · ${relativeDate(new Date(state.sources.connectorAt))}${state.sources.connectorSummary ? ` · ${state.sources.connectorSummary}` : ''}` : 'Extension not detected';
    $$('#sourceStrip .source-dot').forEach((dot, index) => dot.classList.toggle('muted', ![state.sources.privateAt, state.sources.publicAt, state.sources.connectorAt][index]));
  }

  function renderReplies() {
    const visible = state.replies.filter((reply) => state.activeFilter === 'all' || reply.type === state.activeFilter);
    const never = state.replies.filter((reply) => reply.type === 'never').length;
    const follow = state.replies.filter((reply) => reply.type === 'follow').length;
    $('#navCount').textContent = state.replies.length;
    $('#allCount').textContent = state.replies.length;
    $('#neverCount').textContent = never;
    $('#followCount').textContent = follow;
    if (state.capabilities.comments) {
      $('#attentionTitle').innerHTML = `<strong id="waitingTotal">${state.replies.length} reader${state.replies.length === 1 ? '' : 's'} waiting</strong> to hear from you`;
      const dated = state.replies.map((reply) => validDate(reply.date)).filter(Boolean).sort((a, b) => a - b);
      $('#attentionDetail').textContent = dated.length ? `Your oldest unanswered message is ${relativeDate(dated[0]).toLowerCase()}.` : 'No dated unanswered messages were found.';
    }
    $('#waitingAvatars').innerHTML = state.replies.slice(0, 3).map((reply) => `<span>${escapeHTML(reply.initials)}</span>`).join('') + (state.replies.length > 3 ? `<span>+${state.replies.length - 3}</span>` : '');
    $('#replyList').innerHTML = visible.length ? visible.map((reply) => `
      <article class="reply-item"><div class="reply-avatar">${escapeHTML(reply.initials)}</div><div class="reply-body">
      <div class="reply-meta"><strong>${escapeHTML(reply.name)}</strong><span class="badge ${reply.type}">${reply.tag}</span></div>
      <p>${escapeHTML(reply.message)}</p><small>On “${escapeHTML(reply.source)}” · ${escapeHTML(reply.age)}</small></div>
      <button class="reply-action" data-id="${escapeHTML(reply.id)}" data-name="${escapeHTML(reply.name)}">Mark replied</button></article>`).join('')
      : `<div class="empty"><strong>${state.capabilities.comments ? 'You’re all caught up.' : 'Reply data is not available yet.'}</strong>${state.capabilities.comments ? 'No replies in this view need your attention.' : 'Open the comments and Notes pages in Substack with the connector installed, then sync again.'}</div>`;
  }

  function renderCadence(datedPosts) {
    const chart = $('#cadenceChart'); chart.innerHTML = '';
    if (!datedPosts.length) return;
    let posts = datedPosts.map((post) => ({ ...post, date: new Date(post.parsedDate) }));
    const last = new Date(Math.max(...posts.map((post) => post.date)));
    const cutoff = rangeCutoff();
    if (cutoff) posts = posts.filter((post) => post.date >= cutoff);
    if (!posts.length) { $('#cadenceValue').textContent = '0'; $('#cadencePeriod').textContent = state.range === '30' ? '30 days' : '90 days'; $('#chartLabels').innerHTML = '<span>—</span><span>—</span>'; $('#cadenceInsight').innerHTML = '<span>⌁</span>No posts were found in this date range.'; return; }
    const start = cutoff || new Date(Math.min(...posts.map((post) => post.date)));
    const spanWeeks = state.range === 'all' ? Math.max(1, (last - start) / 604800000) : Number(state.range) / 7;
    const bucketCount = state.range === '30' ? 5 : state.range === '90' ? 13 : 12;
    const buckets = Array(bucketCount).fill(0);
    const duration = Math.max(1, last - start);
    posts.forEach((post) => { const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((post.date - start) / duration * bucketCount))); buckets[index] += 1; });
    const average = posts.length / spanWeeks;
    const max = Math.max(...buckets, 1);
    buckets.forEach((count) => { const bar = document.createElement('i'); bar.style.height = `${Math.max(4, count / max * 100)}%`; bar.title = `${count} post${count === 1 ? '' : 's'}`; chart.appendChild(bar); });
    $('#cadenceValue').textContent = average.toFixed(1);
    $('#cadencePeriod').textContent = state.range === 'all' ? 'All time' : `${state.range} days`;
    $('#chartLabels').innerHTML = `<span>${formatDate(start)}</span><span>${formatDate(last)}</span>`;
    const provenance = state.sources.publicAt ? 'Public Substack feed' : (state.sources.connectorAt ? 'Imported and locally synchronized post dates' : 'Imported post dates');
    $('#cadenceInsight').innerHTML = `<span>⌁</span><b>${posts.length} posts.</b> ${average.toFixed(1)} posts per week in this range · ${provenance}.`;
  }

  function renderTopContent() {
    const eligible = postsInRange(state.posts).filter((post) => post.title && post.title !== 'Untitled post');
    const metric = eligible.some((post) => post.views > 0) ? 'views'
      : eligible.some((post) => post.opens > 0) ? 'opens'
        : eligible.some((post) => post.openRate > 0) ? 'openRate'
          : eligible.some((post) => (post.likes || 0) + (post.comments || 0) > 0) ? 'interactions' : null;
    const ranked = metric ? eligible.map((post) => {
      const value = metric === 'interactions' ? (post.likes || 0) + (post.comments || 0) : post[metric];
      const label = metric === 'openRate' ? 'open rate' : metric;
      const display = metric === 'openRate' ? formatPercent(value) : Number(value || 0).toLocaleString();
      return { post, metric: { value: value || 0, label, display } };
    }).filter((item) => item.metric.value > 0).sort((a, b) => b.metric.value - a.metric.value).slice(0, 3) : [];
    $('#topMetricLabel').textContent = metric ? `Ranked by ${metric === 'openRate' ? 'open rate' : metric}` : 'No metric available';
    $('#topContentList').className = ranked.length ? '' : 'empty compact';
    $('#topContentList').innerHTML = ranked.length ? ranked.map(({ post, metric }, index) => `<div class="content-row"><span class="rank">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHTML(post.title)}</strong><p>${post.date ? formatDate(new Date(post.date)) : 'Date not available'}</p></div><b>${metric.display}<small>${metric.label}</small></b></div>`).join('') : '<strong>No engagement data available.</strong>The export does not contain post statistics.';
  }

  function formatDate(date) { return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date); }
  function escapeHTML(value) { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; }
  function saveDerived(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* The dashboard still works for this session. */ } }
  function restoreDerived() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (saved) { state.files = saved.files || []; render(saved); } } catch { localStorage.removeItem(STORAGE_KEY); } }
  function showToast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); window.setTimeout(() => $('#toast').classList.remove('show'), 2600); }

  function requestConnector() {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const timeout = window.setTimeout(() => { window.removeEventListener('message', receive); reject(new Error('Local connector not detected')); }, 2500);
      function receive(event) {
        if (event.source !== window || event.data?.type !== 'SUBSTACK_PULSE_SYNC_RESULT' || event.data.requestId !== requestId) return;
        window.clearTimeout(timeout); window.removeEventListener('message', receive);
        if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.payload || {});
      }
      window.addEventListener('message', receive);
      window.postMessage({ type: 'SUBSTACK_PULSE_REQUEST_SYNC', requestId }, window.location.origin);
    });
  }

  function walkRecords(value, visit, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (!Array.isArray(value)) visit(value);
    Object.values(value).forEach((child) => walkRecords(child, visit, seen));
  }

  function recordKind(row, url = '') {
    const keys = Object.keys(row).map(normalizeHeader);
    const has = (...names) => names.some((name) => keys.includes(name));
    if (has('subscription_status', 'subscriber_status', 'is_paid') && has('email', 'email_address')) return 'subscriber';
    if (has('comment_id', 'parent_comment_id', 'reply_to_id') || (has('body', 'comment', 'text') && (has('post_id') || /comment|note|repl/i.test(url)))) return 'comment';
    if (has('post_id', 'published_at', 'post_date', 'email_open_rate', 'open_rate') && has('title', 'post_title', 'subject')) return 'post';
    return '';
  }

  function normalizeCapturedRecord(record) {
    const normalized = {};
    Object.entries(record).forEach(([key, value]) => {
      const cleanKey = normalizeHeader(key);
      if (value === null || typeof value !== 'object') normalized[cleanKey] = String(value ?? '');
      else if (/^(user|author|commenter|profile)$/.test(cleanKey)) {
        if (value.name || value.display_name) normalized.author_name = String(value.name || value.display_name);
        if (value.email) normalized.user_email = String(value.email);
        if (value.id) normalized.author_id = String(value.id);
      }
    });
    return normalized;
  }

  function ingestConnectorPayload(payload) {
    const before = { subscribers: state.subscribers.length, posts: state.posts.length, comments: state.comments.length };
    (payload.captures || []).forEach((capture) => {
      if (/comment|note|repl/i.test(capture.url || '')) state.capabilities.comments = true;
      if (/subscriber|audience|member/i.test(capture.url || '')) state.capabilities.subscribers = true;
      walkRecords(capture.data, (record) => {
      const normalized = normalizeCapturedRecord(record);
      const kind = recordKind(normalized, capture.url);
      if (kind === 'subscriber') { state.subscribers.push(normalized); state.capabilities.subscribers = true; }
      else if (kind === 'comment') { state.comments.push(normalized); state.capabilities.comments = true; }
      else if (kind === 'post') { mergePosts([normalized]); state.capabilities.posts = true; if (get(normalized, aliases.openRate) || get(normalized, aliases.views) || get(normalized, aliases.opens) || get(normalized, aliases.likes)) state.capabilities.engagement = true; }
      });
    });
    dedupeRows(state.subscribers, aliases.email);
    dedupeRows(state.comments, aliases.id);
    deriveReplies();
    if (payload.feedXml) ingestFeed(payload.feedXml);
    if ((payload.captures || []).length || payload.feedXml) state.sources.connectorAt = payload.capturedAt || new Date().toISOString();
    const fresh = deriveDashboard();
    const previous = loadSaved();
    const merged = mergeAvailable(previous, fresh);
    const counts = { subscribers: Math.max(0, state.subscribers.length - before.subscribers), posts: Math.max(0, state.posts.length - before.posts), comments: Math.max(0, state.comments.length - before.comments), responses: (payload.captures || []).length };
    state.sources.connectorSummary = `${counts.posts} posts · ${counts.subscribers} subscribers · ${counts.comments} comments`;
    merged.sources = state.sources; merged.capabilities = state.capabilities; saveDerived(merged); render(merged);
    return counts;
  }

  function dedupeRows(rows, keys) {
    const seen = new Set();
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const id = get(rows[index], keys);
      if (id && seen.has(id)) rows.splice(index, 1); else if (id) seen.add(id);
    }
  }

  function ingestFeed(xml) {
    const documentNode = new DOMParser().parseFromString(xml, 'application/xml');
    const items = [...documentNode.querySelectorAll('item, entry')];
    mergePosts(items.map((item) => ({
      post_id: item.querySelector('guid, id')?.textContent || item.querySelector('link')?.getAttribute('href') || item.querySelector('link')?.textContent || '',
      title: item.querySelector('title')?.textContent || 'Untitled post',
      published_at: item.querySelector('pubDate, published, updated')?.textContent || '',
      url: item.querySelector('link')?.getAttribute('href') || item.querySelector('link')?.textContent || ''
    })));
    if (items.length) { state.sources.publicAt = new Date().toISOString(); state.capabilities.posts = true; }
  }

  function loadSaved() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } }
  function mergeAvailable(previous, fresh) {
    const result = { ...previous, ...fresh, sources: { ...(previous.sources || {}), ...(fresh.sources || {}) } };
    ['subscribers', 'newSubscribers', 'paid', 'conversion', 'openRate', 'revenue'].forEach((key) => { if (fresh[key] === null && previous[key] !== undefined) result[key] = previous[key]; });
    if (!fresh.posts?.length && previous.posts) result.posts = previous.posts;
    if (!fresh.datedPosts?.length && previous.datedPosts) result.datedPosts = previous.datedPosts;
    if (!fresh.replies?.length && !state.comments.length && previous.replies) result.replies = previous.replies;
    return result;
  }

  async function syncNow() {
    const button = $('#syncButton'); button.disabled = true; button.innerHTML = '<span>↻</span> Syncing…';
    try {
      const payload = await requestConnector();
      const counts = ingestConnectorPayload(payload);
      const found = counts.posts + counts.subscribers + counts.comments;
      showToast(found
        ? `Sync complete · ${counts.posts} posts, ${counts.subscribers} subscribers, ${counts.comments} comments refreshed`
        : `Sync connected, but no dashboard data was recognized from ${counts.responses} captured responses`);
    } catch (error) {
      showToast('Connector not detected — opening setup help');
      $('#connectorModal').hidden = false;
    } finally { button.disabled = false; button.innerHTML = '<span>↻</span> Sync now'; }
  }

  const modal = $('#importModal');
  const openModal = () => { modal.hidden = false; $('#modalClose').focus(); };
  const closeModal = () => { modal.hidden = true; $('#importStatus').textContent = ''; };
  async function handleFiles(files) {
    $('#importStatus').textContent = 'Parsing your export…';
    try { const message = await importFiles(files); $('#importStatus').textContent = message; window.setTimeout(closeModal, 900); showToast(message); }
    catch (error) { $('#importStatus').textContent = error.message; }
  }

  $('#importButton').addEventListener('click', openModal);
  $('#modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; if (!modal.hidden) closeModal(); $('#connectorModal').hidden = true; });
  $('#fileInput').addEventListener('change', async (event) => { await handleFiles(event.target.files); event.target.value = ''; });
  ['dragenter', 'dragover'].forEach((type) => $('#dropzone').addEventListener(type, (event) => { event.preventDefault(); $('#dropzone').classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((type) => $('#dropzone').addEventListener(type, (event) => { event.preventDefault(); $('#dropzone').classList.remove('dragging'); }));
  $('#dropzone').addEventListener('drop', (event) => handleFiles(event.dataTransfer.files));
  $$('.tabs button').forEach((button) => button.addEventListener('click', () => { $('.tabs button.active').classList.remove('active'); button.classList.add('active'); state.activeFilter = button.dataset.filter; renderReplies(); }));
  $('#replyList').addEventListener('click', (event) => { const button = event.target.closest('.reply-action'); if (!button) return; state.dismissed.push(button.dataset.id); state.replies = state.replies.filter((reply) => reply.id !== button.dataset.id); const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); saveDerived({ ...saved, replies: state.replies, dismissed: state.dismissed }); renderReplies(); showToast(`${button.dataset.name} marked as replied`); });
  $('#reviewButton').addEventListener('click', () => $('#replyPanel').scrollIntoView({ behavior: 'smooth' }));
  $('#viewAllButton').addEventListener('click', () => $('.tabs button[data-filter="all"]').click());
  $('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#rangeSelect').addEventListener('change', (event) => {
    state.range = event.target.value;
    const saved = loadSaved();
    const derived = deriveDashboard();
    derived.importedAt = saved.importedAt || derived.importedAt;
    saveDerived(derived);
    render(derived);
  });
  $('#syncButton').addEventListener('click', syncNow);
  $('#connectorHelp').addEventListener('click', () => { $('#connectorModal').hidden = false; });
  $('#clearDataButton').addEventListener('click', () => {
    if (!window.confirm('Clear imported and synchronized Pulse data from this browser?')) return;
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });
  $('#connectorClose').addEventListener('click', () => { $('#connectorModal').hidden = true; });
  $('#connectorModal').addEventListener('click', (event) => { if (event.target === $('#connectorModal')) $('#connectorModal').hidden = true; });
  $$('.nav-item[data-section]').forEach((button) => button.addEventListener('click', () => { $$('.nav-item[data-section]').forEach((item) => item.classList.remove('active')); button.classList.add('active'); $('#sidebar').classList.remove('open'); if (button.dataset.section === 'inbox') $('#replyPanel').scrollIntoView({ behavior: 'smooth' }); }));

  $('#todayLabel').textContent = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  restoreDerived();
  renderReplies();
})();
