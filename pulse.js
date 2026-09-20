(() => {
  'use strict';

  const OWNER_NAME = 'Stuart Moulder';
  const STORAGE_KEY = 'substack-pulse-derived-v1';
  const state = { files: [], subscribers: [], posts: [], comments: [], replies: [], dismissed: [], activeFilter: 'all' };
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
      openRate: rate !== null && rate > 1 ? rate / 100 : rate,
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
        || state.posts.find((item) => item.title === post.title && item.date === post.date);
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
    state.files = [];
    state.subscribers = [];
    state.posts = [];
    state.comments = [];
    state.dismissed = [];
    const revenues = [];
    for (const file of csvFiles) {
      const rows = parseCSV(await file.text());
      const type = classifyFile(file.name, rows);
      state.files.push({ name: file.name, type, rows: rows.length });
      if (type === 'subscribers') state.subscribers.push(...rows);
      else if (type === 'posts') mergePosts(rows);
      else if (type === 'comments') state.comments.push(...rows);
      else if (type === 'revenue') revenues.push(...rows);
    }
    deriveReplies();
    const derived = deriveDashboard(revenues);
    saveDerived(derived);
    render(derived);
    return `${csvFiles.length} files parsed · ${state.files.reduce((sum, file) => sum + file.rows, 0).toLocaleString()} rows`;
  }

  function deriveDashboard(revenues = []) {
    const activeSubscribers = state.subscribers.filter(subscriberIsActive);
    const paid = activeSubscribers.filter(subscriberIsPaid);
    const now = new Date();
    const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30);
    const newSubscribers = activeSubscribers.filter((row) => {
      const date = validDate(get(row, aliases.created));
      return date && date >= monthAgo;
    }).length;
    const postRates = state.posts.map((post) => post.openRate).filter((rate) => rate !== null && rate >= 0 && rate <= 1);
    const revenueRows = revenues.map((row) => ({ amount: numeric(get(row, aliases.revenue)), date: validDate(get(row, aliases.created)), currency: get(row, aliases.currency) })).filter((row) => row.amount !== null);
    const recentRevenue = revenueRows.filter((row) => !row.date || row.date >= monthAgo);
    const revenue = recentRevenue.length ? recentRevenue.reduce((sum, row) => sum + row.amount, 0) : null;
    const datedPosts = state.posts.map((post) => ({ ...post, parsedDate: validDate(post.date) })).filter((post) => post.parsedDate);
    return {
      importedAt: new Date().toISOString(), files: state.files,
      subscribers: state.subscribers.length ? activeSubscribers.length : null,
      newSubscribers: state.subscribers.length ? newSubscribers : null,
      paid: state.subscribers.length && state.subscribers.some((row) => get(row, aliases.plan)) ? paid.length : null,
      conversion: activeSubscribers.length && paid.length ? paid.length / activeSubscribers.length : null,
      openRate: postRates.length ? postRates.reduce((sum, rate) => sum + rate, 0) / postRates.length : null,
      revenue, currency: recentRevenue.find((row) => row.currency)?.currency || 'USD',
      posts: state.posts, datedPosts: datedPosts.map((post) => ({ ...post, parsedDate: post.parsedDate.toISOString() })),
      replies: state.replies, dismissed: state.dismissed
    };
  }

  function render(data) {
    state.posts = data.posts || [];
    state.replies = data.replies || [];
    state.dismissed = data.dismissed || [];
    const available = (value, formatter = String) => value === null || value === undefined ? 'Not available' : formatter(value);
    $('#subscriberTotal').textContent = available(data.subscribers, (value) => value.toLocaleString());
    $('#subscriberDetail').textContent = data.newSubscribers === null ? 'Import subscribers.csv' : `${data.newSubscribers.toLocaleString()} joined in the last 30 days`;
    $('#paidTotal').textContent = available(data.paid, (value) => value.toLocaleString());
    $('#paidDetail').textContent = data.conversion === null ? 'Paid status not included in export' : `${formatPercent(data.conversion)} conversion rate`;
    $('#openRate').textContent = available(data.openRate, formatPercent);
    $('#openRateDetail').textContent = data.openRate === null ? 'Open-rate fields not included in export' : `Average across ${state.posts.filter((post) => post.openRate !== null).length} posts`;
    $('#revenueTotal').textContent = available(data.revenue, (value) => new Intl.NumberFormat('en', { style: 'currency', currency: data.currency || 'USD', maximumFractionDigits: 0 }).format(value));
    $('#revenueDetail').textContent = data.revenue === null ? 'Revenue not included in export' : 'From imported transactions in the last 30 days';
    if (data.importedAt) $('#syncStatus').innerHTML = `<i></i> Imported ${relativeDate(new Date(data.importedAt)).toLowerCase()}`;
    renderReplies();
    renderCadence(data.datedPosts || []);
    renderTopContent();
  }

  function formatPercent(value) { return `${(value * 100).toFixed(1)}%`; }

  function renderReplies() {
    const visible = state.replies.filter((reply) => state.activeFilter === 'all' || reply.type === state.activeFilter);
    const never = state.replies.filter((reply) => reply.type === 'never').length;
    const follow = state.replies.filter((reply) => reply.type === 'follow').length;
    $('#navCount').textContent = state.replies.length;
    $('#allCount').textContent = state.replies.length;
    $('#neverCount').textContent = never;
    $('#followCount').textContent = follow;
    if (state.files.length || state.replies.length) {
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
      : `<div class="empty"><strong>${state.files.length ? 'You’re all caught up.' : 'Import your Substack data.'}</strong>${state.files.length ? 'No replies in this view need your attention.' : 'Comments and notes exports will appear here.'}</div>`;
  }

  function renderCadence(datedPosts) {
    const chart = $('#cadenceChart'); chart.innerHTML = '';
    if (!datedPosts.length) return;
    const posts = datedPosts.map((post) => ({ ...post, date: new Date(post.parsedDate) }));
    const last = new Date(Math.max(...posts.map((post) => post.date)));
    const start = new Date(last); start.setDate(start.getDate() - 83); start.setHours(0, 0, 0, 0);
    const weeks = Array(12).fill(0);
    posts.forEach((post) => { const index = Math.floor((post.date - start) / 604800000); if (index >= 0 && index < 12) weeks[index] += 1; });
    const average = weeks.reduce((sum, value) => sum + value, 0) / 12;
    const max = Math.max(...weeks, 1);
    weeks.forEach((count) => { const bar = document.createElement('i'); bar.style.height = `${Math.max(4, count / max * 100)}%`; bar.title = `${count} post${count === 1 ? '' : 's'}`; chart.appendChild(bar); });
    $('#cadenceValue').textContent = average.toFixed(1);
    $('#chartLabels').innerHTML = `<span>${formatDate(start)}</span><span>${formatDate(last)}</span>`;
    $('#cadenceInsight').innerHTML = `<span>⌁</span><b>${weeks.filter(Boolean).length} active weeks.</b> ${weeks.reduce((sum, value) => sum + value, 0)} posts published during this 12-week window.`;
  }

  function engagement(post) {
    if (post.openRate !== null) return { value: post.openRate, label: 'open rate', display: formatPercent(post.openRate) };
    if (post.views !== null) return { value: post.views, label: 'views', display: post.views.toLocaleString() };
    if (post.opens !== null) return { value: post.opens, label: 'opens', display: post.opens.toLocaleString() };
    if (post.likes !== null || post.comments !== null) { const value = (post.likes || 0) + (post.comments || 0); return { value, label: 'interactions', display: value.toLocaleString() }; }
    return null;
  }

  function renderTopContent() {
    const ranked = state.posts.map((post) => ({ post, metric: engagement(post) })).filter((item) => item.metric).sort((a, b) => b.metric.value - a.metric.value).slice(0, 3);
    $('#topContentList').className = ranked.length ? '' : 'empty compact';
    $('#topContentList').innerHTML = ranked.length ? ranked.map(({ post, metric }, index) => `<div class="content-row"><span class="rank">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHTML(post.title)}</strong><p>${post.date ? formatDate(new Date(post.date)) : 'Date not available'}</p></div><b>${metric.display}<small>${metric.label}</small></b></div>`).join('') : '<strong>No engagement data available.</strong>The export does not contain post statistics.';
  }

  function formatDate(date) { return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date); }
  function escapeHTML(value) { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; }
  function saveDerived(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* The dashboard still works for this session. */ } }
  function restoreDerived() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (saved) { state.files = saved.files || []; render(saved); } } catch { localStorage.removeItem(STORAGE_KEY); } }
  function showToast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); window.setTimeout(() => $('#toast').classList.remove('show'), 2600); }

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
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });
  $('#fileInput').addEventListener('change', (event) => handleFiles(event.target.files));
  ['dragenter', 'dragover'].forEach((type) => $('#dropzone').addEventListener(type, (event) => { event.preventDefault(); $('#dropzone').classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((type) => $('#dropzone').addEventListener(type, (event) => { event.preventDefault(); $('#dropzone').classList.remove('dragging'); }));
  $('#dropzone').addEventListener('drop', (event) => handleFiles(event.dataTransfer.files));
  $$('.tabs button').forEach((button) => button.addEventListener('click', () => { $('.tabs button.active').classList.remove('active'); button.classList.add('active'); state.activeFilter = button.dataset.filter; renderReplies(); }));
  $('#replyList').addEventListener('click', (event) => { const button = event.target.closest('.reply-action'); if (!button) return; state.dismissed.push(button.dataset.id); state.replies = state.replies.filter((reply) => reply.id !== button.dataset.id); const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); saveDerived({ ...saved, replies: state.replies, dismissed: state.dismissed }); renderReplies(); showToast(`${button.dataset.name} marked as replied`); });
  $('#reviewButton').addEventListener('click', () => $('#replyPanel').scrollIntoView({ behavior: 'smooth' }));
  $('#viewAllButton').addEventListener('click', () => $('.tabs button[data-filter="all"]').click());
  $('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $$('.nav-item[data-section]').forEach((button) => button.addEventListener('click', () => { $$('.nav-item[data-section]').forEach((item) => item.classList.remove('active')); button.classList.add('active'); $('#sidebar').classList.remove('open'); if (button.dataset.section === 'inbox') $('#replyPanel').scrollIntoView({ behavior: 'smooth' }); }));

  $('#todayLabel').textContent = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  restoreDerived();
  renderReplies();
})();
