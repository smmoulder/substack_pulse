(() => {
  'use strict';

  const OWNER_NAME = 'Stuart Moulder';
  const OWNER_ID = '4912487';
  const STORAGE_KEY = 'substack-pulse-derived-v1';
  const LIVE_STORAGE_KEY = 'substack-pulse-live-v1';
  const state = { files: [], subscribers: [], posts: [], comments: [], revenues: [], replies: [], dismissed: [], activeFilter: 'all', sources: {}, capabilities: {}, datasets: {}, range: '30', live: null, activeView: 'posts' };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const aliases = {
    name: ['name', 'user_name', 'display_name', 'author_name', 'commenter_name', 'subscriber_name', 'first_name'],
    email: ['email', 'email_address', 'user_email'],
    handle: ['handle', 'username', 'user_handle', 'author_handle', 'commenter_handle'],
    userId: ['user_id', 'author_id', 'commenter_id', 'subscriber_id'],
    profileUrl: ['profile_url', 'author_url', 'user_url'],
    commentUrl: ['comment_url', 'thread_url', 'reply_url', 'note_url', 'permalink'],
    replyCount: ['reply_count', 'replies_count', 'num_replies', 'child_count'],
    historyComplete: ['history_complete', 'replies_complete', 'thread_complete'],
    status: ['status', 'subscription_status', 'subscriber_status'],
    plan: ['plan', 'type', 'subscription_type', 'subscription_tier', 'plan_name', 'is_paid', 'stripe_subscription_status'],
    created: ['created_at', 'created', 'date', 'post_date', 'published_at', 'publication_date', 'email_sent_at', 'paid_at', 'transaction_date', 'timestamp'],
    title: ['title', 'post_title', 'subject'],
    subtitle: ['subtitle', 'description'],
    body: ['body', 'comment', 'text', 'content', 'message'],
    id: ['id', 'comment_id', 'note_id'],
    parent: ['parent_id', 'parent_comment_id', 'reply_to_id', 'ancestor_id'],
    rootId: ['root_id', 'root_comment_id', 'thread_root_id', 'conversation_id'],
    threadId: ['thread_id', 'comment_thread_id'],
    postId: ['post_id', 'publication_id', 'article_id'],
    openRate: ['open_rate', 'email_open_rate', 'opens_rate', 'open rate'],
    views: ['views', 'web_views', 'total_views', 'view_count'],
    opens: ['opens', 'email_opens', 'unique_opens'],
    likes: ['likes', 'reactions', 'like_count'],
    commentCount: ['comments', 'comment_count', 'comments_count'],
    revenue: ['revenue', 'amount', 'amount_paid', 'payment_amount', 'net_amount', 'gross_amount', 'net_revenue', 'gross_revenue', 'earnings', 'payout_amount', 'revenue_usd'],
    subscriberRevenue: ['revenue', 'subscriber_revenue', 'lifetime_revenue', 'total_revenue', 'revenue_usd'],
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
    if (/payment|revenue|transaction|payout|earning/.test(name) || (headers.some((header) => aliases.revenue.includes(header)) && headers.some((header) => aliases.currency.includes(header)))) return 'revenue';
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
    return readerInfo(row).name;
  }

  function readerInfo(row) {
    const email = get(row, aliases.email);
    const userId = get(row, aliases.userId);
    const subscriber = state.subscribers.find((item) => (email && get(item, aliases.email) === email) || (userId && get(item, aliases.userId) === userId));
    const handle = get(row, aliases.handle) || (subscriber && get(subscriber, aliases.handle)) || '';
    return {
      name: get(row, aliases.name) || (subscriber && get(subscriber, aliases.name)) || handle || email || 'Reader',
      email: email || (subscriber && get(subscriber, aliases.email)) || '',
      handle,
      userId,
      profileUrl: get(row, aliases.profileUrl) || (subscriber && get(subscriber, aliases.profileUrl)) || ''
    };
  }

  function deriveReplies() {
    const byId = new Map(state.comments.map((row, index) => [get(row, aliases.id) || `unstable-row-${index}`, row]));
    const rootFor = (row) => {
      const explicit = get(row, aliases.rootId) || get(row, aliases.threadId);
      if (explicit) return explicit;
      let current = row; const visited = new Set();
      while (get(current, aliases.parent) && byId.has(get(current, aliases.parent)) && !visited.has(get(current, aliases.parent))) {
        visited.add(get(current, aliases.parent)); current = byId.get(get(current, aliases.parent));
      }
      return get(current, aliases.id) || get(row, aliases.id);
    };
    const threads = new Map();
    state.comments.forEach((row) => { const key = rootFor(row); if (key) threads.set(key, [...(threads.get(key) || []), row]); });
    const conversations = [];
    threads.forEach((thread, threadId) => {
      const ordered = [...thread].sort((a, b) => (validDate(get(a, aliases.created))?.getTime() || 0) - (validDate(get(b, aliases.created))?.getTime() || 0));
      const root = ordered.find((row) => get(row, aliases.id) === threadId) || ordered.find((row) => !get(row, aliases.parent)) || ordered[0];
      const readerMessages = ordered.filter((row) => !isOwnerMessage(row));
      const row = readerMessages.at(-1);
      if (!row) return;
      const id = get(row, aliases.id) || `unstable-${threadId}`;
      const reader = readerInfo(row);
      const author = reader.name;
      const date = validDate(get(row, aliases.created));
      const postId = get(row, aliases.postId) || get(root, aliases.postId);
      const post = state.posts.find((item) => item.id && item.id === postId);
      const directUrl = get(row, aliases.commentUrl) || get(root, aliases.commentUrl);
      const originalUrl = row.original_url || root.original_url || post?.url || '';
      const replyCount = numeric(get(root, aliases.replyCount));
      const explicitComplete = ordered.some((item) => /^(true|1|yes)$/i.test(get(item, aliases.historyComplete)));
      const historyComplete = explicitComplete || (replyCount !== null && ordered.length - 1 >= replyCount);
      const stableId = !id.startsWith('unstable');
      const knownAuthor = author !== 'Reader' && author !== 'Identity unavailable';
      const supported = historyComplete && stableId && knownAuthor && Boolean(date);
      const readerIndex = ordered.indexOf(row);
      const ownerBefore = ordered.slice(0, readerIndex).some(isOwnerMessage);
      const ownerAfter = ordered.slice(readerIndex + 1).some(isOwnerMessage);
      if (supported && ownerAfter) return;
      const type = supported ? (ownerBefore ? 'follow' : 'never') : 'unknown';
      const missing = [!knownAuthor && 'author identity', !stableId && 'stable comment ID', !date && 'timestamp', !historyComplete && 'complete reply history'].filter(Boolean);
      const originalType = row.original_type || root.original_type || 'post';
      const originalTitle = row.original_title || root.original_title || post?.title || get(row, aliases.title) || get(root, aliases.title) || '';
      conversations.push({
        id, name: knownAuthor ? author : 'Identity unavailable', initials: knownAuthor ? initials(author) : '?', type,
        tag: type === 'follow' ? 'Follow up' : type === 'never' ? 'Never replied' : 'Reply status unknown',
        message: get(row, aliases.body) || 'Message text not included in this export.',
        source: originalTitle || (originalType === 'note' ? 'Note excerpt unavailable' : 'Article title unavailable'),
        email: reader.email, handle: reader.handle, readerId: reader.userId, profileUrl: reader.profileUrl,
        url: directUrl || originalUrl, destinationLabel: directUrl ? 'Open conversation' : (originalType === 'note' ? 'Open original Note' : 'Open original article'),
        statusReason: missing.length ? `Missing ${missing.join(', ')}` : '',
        date: date ? date.toISOString() : '', age: date ? relativeDate(date) : 'Date not available'
      });
    });
    state.replies = conversations.filter((reply) => !state.dismissed.includes(reply.id)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  function isOwnerMessage(row) {
    if (/^(true|1|yes)$/i.test(String(row.is_owner || row.is_author || row.is_publication_author || ''))) return true;
    return commentIdentity(row).toLowerCase().includes(OWNER_NAME.toLowerCase());
  }

  function collectDescendants(id, children, seen = new Set()) {
    if (seen.has(id)) return [];
    seen.add(id);
    return (children.get(id) || []).flatMap((row) => {
      const childId = get(row, aliases.id);
      return [row, ...(childId ? collectDescendants(childId, children, seen) : [])];
    });
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
    if (type === 'subscribers') return rows.map((row) => ({ email: get(row, aliases.email), name: get(row, aliases.name), handle: get(row, aliases.handle), user_id: get(row, aliases.userId), profile_url: get(row, aliases.profileUrl), status: get(row, aliases.status), plan: get(row, aliases.plan), subscriber_revenue: get(row, aliases.subscriberRevenue), currency: get(row, aliases.currency), created_at: get(row, aliases.created) }));
    if (type === 'posts') return rows.map((row) => ({ post_id: get(row, aliases.postId) || get(row, aliases.id), title: get(row, aliases.title), subtitle: get(row, aliases.subtitle), created_at: get(row, aliases.created), open_rate: get(row, aliases.openRate), views: get(row, aliases.views), opens: get(row, aliases.opens), likes: get(row, aliases.likes), comments: get(row, aliases.commentCount), url: get(row, aliases.url) }));
    if (type === 'comments') return rows.map((row) => { const noteUrl = get(row, ['note_url']); return { id: get(row, aliases.id), parent_id: get(row, aliases.parent), root_id: get(row, aliases.rootId), thread_id: get(row, aliases.threadId), post_id: get(row, aliases.postId), author_name: get(row, aliases.name), author_handle: get(row, aliases.handle), author_id: get(row, aliases.userId), user_email: get(row, aliases.email), profile_url: get(row, aliases.profileUrl), comment_url: get(row, ['comment_url', 'thread_url', 'reply_url', 'permalink']), original_url: noteUrl || get(row, ['post_url']), original_type: noteUrl ? 'note' : 'post', original_title: get(row, ['post_title', 'thread_title', 'note_title']), reply_count: get(row, aliases.replyCount), history_complete: get(row, aliases.historyComplete), is_owner: get(row, ['is_owner', 'is_author', 'is_publication_author']), body: get(row, aliases.body), title: get(row, aliases.title), created_at: get(row, aliases.created) }; });
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
    const subscriberRevenueRows = state.subscribers.map((row) => numeric(row.subscriber_revenue)).filter((value) => value !== null);
    const subscriberRevenue = subscriberRevenueRows.length ? subscriberRevenueRows.reduce((sum, value) => sum + value, 0) : null;
    const datedPosts = state.posts.map((post) => ({ ...post, parsedDate: validDate(post.date) })).filter((post) => post.parsedDate);
    return {
      importedAt: new Date().toISOString(), files: state.files, sources: state.sources, capabilities: state.capabilities, datasets: state.datasets, range: state.range,
      subscribers: state.subscribers.length ? activeSubscribers.length : null,
      newSubscribers: state.subscribers.length ? newSubscribers : null,
      paid: state.subscribers.length && state.subscribers.some((row) => get(row, aliases.plan)) ? paid.length : null,
      conversion: activeSubscribers.length && state.subscribers.some((row) => get(row, aliases.plan)) ? paid.length / activeSubscribers.length : null,
      openRate: postRates.length ? postRates.reduce((sum, rate) => sum + rate, 0) / postRates.length : null,
      revenue, subscriberRevenue, revenueKind: revenue !== null ? 'transactions' : (subscriberRevenue !== null ? 'subscriber-cumulative' : null),
      currency: recentRevenue.find((row) => row.currency)?.currency || state.subscribers.find((row) => row.currency)?.currency || 'USD',
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
    const displayedRevenue = data.revenueKind === 'subscriber-cumulative' ? data.subscriberRevenue : data.revenue;
    $('#revenueLabel').textContent = data.revenueKind === 'subscriber-cumulative' ? 'Cumulative revenue' : (state.range === 'all' ? 'All-time revenue' : `${state.range}-day revenue`);
    $('#revenueTotal').textContent = available(displayedRevenue, (value) => new Intl.NumberFormat('en', { style: 'currency', currency: data.currency || 'USD' }).format(value));
    $('#revenueDetail').textContent = data.revenueKind === 'subscriber-cumulative'
      ? 'Cumulative revenue from exported subscribers.'
      : data.revenue === null
      ? (state.capabilities.revenue ? `No revenue transactions found in ${rangeLabel}` : 'No revenue or payout fields found in imported files')
      : `From imported transactions in ${rangeLabel}`;
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
    const unknown = state.replies.filter((reply) => reply.type === 'unknown').length;
    const confirmed = never + follow;
    $('#navCount').textContent = state.replies.length;
    $('#allCount').textContent = state.replies.length;
    $('#neverCount').textContent = never;
    $('#followCount').textContent = follow;
    $('#unknownCount').textContent = unknown;
    if (state.capabilities.comments) {
      $('#attentionTitle').innerHTML = `<strong id="waitingTotal">${confirmed} confirmed conversation${confirmed === 1 ? '' : 's'}</strong> waiting on you`;
      const dated = state.replies.filter((reply) => reply.type !== 'unknown').map((reply) => validDate(reply.date)).filter(Boolean).sort((a, b) => a - b);
      $('#attentionDetail').textContent = `${dated.length ? `Oldest confirmed unanswered message: ${relativeDate(dated[0]).toLowerCase()}.` : 'No confirmed unanswered messages.'}${unknown ? ` ${unknown} conversation${unknown === 1 ? ' has' : 's have'} unknown reply status.` : ''}`;
    }
    $('#waitingAvatars').innerHTML = state.replies.slice(0, 3).map((reply) => `<span>${escapeHTML(reply.initials)}</span>`).join('') + (state.replies.length > 3 ? `<span>+${state.replies.length - 3}</span>` : '');
    $('#replyList').innerHTML = visible.length ? visible.map((reply) => `
      <article class="reply-item"><div class="reply-avatar">${escapeHTML(reply.initials)}</div><div class="reply-body">
      <div class="reply-meta"><strong>${escapeHTML(reply.name)}</strong><span class="badge ${reply.type}">${reply.tag}</span></div>
      <div class="reader-details">${reply.handle ? `@${escapeHTML(reply.handle.replace(/^@/, ''))}` : ''}${reply.email ? `<span>${escapeHTML(reply.email)}</span>` : ''}${safeUrl(reply.profileUrl) ? `<a href="${escapeHTML(safeUrl(reply.profileUrl))}" target="_blank" rel="noopener">Reader profile ↗</a>` : ''}${!reply.handle && !reply.email ? `<span>Comment ID ${escapeHTML(reply.id)}</span>` : ''}</div>
      <p>${escapeHTML(reply.message)}</p><small>On “${escapeHTML(reply.source)}” · ${escapeHTML(reply.age)}</small>${reply.statusReason ? `<small class="status-reason">${escapeHTML(reply.statusReason)}</small>` : ''}</div>
      <div class="reply-actions">${safeUrl(reply.url) ? `<a class="reply-action primary-reply-action" href="${escapeHTML(safeUrl(reply.url))}" target="_blank" rel="noopener">${escapeHTML(reply.destinationLabel || 'Open in Substack')} ↗</a>` : ''}<button class="reply-action" data-id="${escapeHTML(reply.id)}" data-name="${escapeHTML(reply.name)}">Mark replied</button></div></article>`).join('')
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
  function safeUrl(value) { try { const url = new URL(value, 'https://smmoulder.substack.com'); return value && ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
  function escapeHTML(value) { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; }

  function firstValue(object, keys) {
    for (const key of keys) if (object?.[key] !== undefined && object[key] !== null && object[key] !== '') return object[key];
    return '';
  }

  function payloadList(payload, keys = []) {
    if (Array.isArray(payload)) return payload;
    for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
    return [];
  }

  function feedItem(entry) { return entry?.item?.comment || entry?.comment || (entry?.item && typeof entry.item === 'object' ? entry.item : entry); }

  function authorFrom(record) {
    const author = record?.user || record?.author || record?.commenter || record?.profile || {};
    return {
      id: String(firstValue(author, ['id', 'user_id']) || firstValue(record, ['user_id', 'author_id', 'commenter_id']) || ''),
      name: String(firstValue(author, ['name', 'display_name']) || firstValue(record, ['name', 'author_name', 'commenter_name']) || 'Reader'),
      handle: String(firstValue(author, ['handle', 'username']) || firstValue(record, ['handle', 'author_handle']) || '')
    };
  }

  function verifiedSubstackUrl(record, keys = ['canonical_url', 'permalink', 'url', 'post_url', 'note_url']) {
    const candidate = firstValue(record, keys);
    const url = safeUrl(candidate);
    if (!url) return '';
    try { return /(^|\.)substack\.com$/i.test(new URL(url).hostname) ? url : ''; } catch { return ''; }
  }

  function normalizeLiveComment(record, context, parentId = '') {
    const author = authorFrom(record);
    const id = String(firstValue(record, ['id', 'comment_id', 'reply_id']) || '');
    return {
      id,
      parentId: String(firstValue(record, ['parent_id', 'parent_comment_id', 'reply_to_id']) || parentId || ''),
      rootId: String(firstValue(record, ['root_id', 'root_comment_id', 'thread_root_id']) || ''),
      authorId: author.id,
      name: author.name,
      handle: author.handle,
      message: String(firstValue(record, ['body', 'comment', 'text', 'content', 'message']) || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      date: String(firstValue(record, ['created_at', 'date', 'published_at', 'timestamp']) || ''),
      url: verifiedSubstackUrl(record, ['comment_url', 'thread_url', 'reply_url', 'permalink']),
      context
    };
  }

  function flattenCommentPayload(payload, context) {
    const output = [];
    const seenObjects = new WeakSet();
    const seenIds = new Set();
    const visit = (value, parentId = '') => {
      if (!value || typeof value !== 'object' || seenObjects.has(value)) return;
      seenObjects.add(value);
      if (Array.isArray(value)) { value.forEach((item) => visit(item, parentId)); return; }
      const author = authorFrom(value);
      const id = String(firstValue(value, ['id', 'comment_id', 'reply_id']) || '');
      const body = firstValue(value, ['body', 'comment', 'text', 'message']);
      const looksLikeComment = id && body && (author.id || author.name !== 'Reader' || firstValue(value, ['parent_id', 'parent_comment_id', 'root_comment_id']));
      let nextParent = parentId;
      if (looksLikeComment) {
        const normalized = normalizeLiveComment(value, context, parentId);
        const signature = normalized.id || `${normalized.authorId}:${normalized.date}:${normalized.message}`;
        if (!seenIds.has(signature)) { seenIds.add(signature); output.push(normalized); }
        nextParent = normalized.id || parentId;
      }
      Object.entries(value).forEach(([key, child]) => {
        if (child && typeof child === 'object' && !['user', 'author', 'commenter', 'profile', 'post'].includes(key)) visit(child, /replies|children/i.test(key) ? nextParent : parentId);
      });
    };
    visit(payload);
    return output;
  }

  function conversationCards(comments, context, evidence = {}) {
    const byId = new Map(comments.filter((comment) => comment.id).map((comment) => [comment.id, comment]));
    const rootOf = (comment) => {
      if (comment.rootId) return comment.rootId;
      let current = comment; const visited = new Set();
      while (current.parentId && byId.has(current.parentId) && !visited.has(current.parentId)) { visited.add(current.parentId); current = byId.get(current.parentId); }
      return current.id;
    };
    const groups = new Map();
    comments.forEach((comment) => { const root = rootOf(comment); if (root) groups.set(root, [...(groups.get(root) || []), comment]); });
    return [...groups.values()].map((thread) => {
      const ordered = thread.filter((item) => validDate(item.date)).sort((a, b) => new Date(a.date) - new Date(b.date));
      const latest = ordered.at(-1);
      if (!latest || (evidence.ownerVerified && latest.authorId === OWNER_ID)) return null;
      const latestIndex = ordered.length - 1;
      const ownerBefore = ordered.slice(0, latestIndex).some((item) => item.authorId === OWNER_ID);
      const stableEvidence = Boolean(evidence.ownerVerified && evidence.complete && latest.id && latest.authorId && validDate(latest.date));
      const type = stableEvidence ? (ownerBefore ? 'follow' : 'never') : 'unknown';
      const exact = latest.url;
      const fallback = context.url;
      return {
        id: latest.id, name: latest.name, handle: latest.handle, initials: initials(latest.name), message: latest.message || 'Comment text unavailable.',
        type, tag: type === 'follow' ? 'Follow up' : type === 'never' ? 'Never replied' : 'Reply status unknown',
        source: context.title, date: new Date(latest.date).toISOString(), age: relativeDate(new Date(latest.date)),
        url: exact || fallback, destinationLabel: exact ? 'Open in Substack' : context.kind === 'note' ? 'Open original Note' : 'Open original article',
        statusReason: stableEvidence ? '' : [!evidence.ownerVerified && 'owner ID not verified from archive author data', !evidence.complete && 'full thread history not confirmed', !latest.authorId && 'latest author ID missing', !latest.id && 'stable comment ID missing'].filter(Boolean).join(' · ')
      };
    }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  }

  function normalizeLiveData(payload) {
    const publicPosts = (payload.posts || []).map((post) => ({
      id: String(firstValue(post, ['id', 'post_id']) || ''),
      title: String(firstValue(post, ['title', 'post_title']) || 'Untitled post'),
      subtitle: String(firstValue(post, ['subtitle', 'description']) || ''),
      date: String(firstValue(post, ['post_date', 'published_at', 'created_at']) || ''),
      views: numeric(firstValue(post, ['views', 'web_views', 'view_count'])), opens: numeric(firstValue(post, ['opens', 'email_opens'])),
      likes: numeric(firstValue(post, ['likes', 'reaction_count'])), comments: numeric(firstValue(post, ['comment_count', 'comments_count'])),
      openRate: null, url: verifiedSubstackUrl(post)
    }));
    const postReplies = [];
    (payload.postComments || []).forEach((capture) => {
      const post = publicPosts.find((item) => item.id === String(capture.postId));
      if (!post || !capture.data) return;
      postReplies.push(...conversationCards(flattenCommentPayload(capture.data, { kind: 'post', title: post.title, url: post.url }), { kind: 'post', title: post.title, url: post.url }, { complete: capture.complete === true, ownerVerified: payload.ownerEvidence?.verified === true }));
    });
    const notes = (payload.notes || []).map((entry) => {
      const note = feedItem(entry); const author = authorFrom(note);
      const text = String(firstValue(note, ['body', 'text', 'content', 'comment']) || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return { id: String(firstValue(note, ['id', 'comment_id']) || firstValue(entry, ['comment_id']) || ''), text, title: noteLabel(text), date: String(firstValue(note, ['created_at', 'date', 'published_at']) || firstValue(entry, ['date']) || ''), url: verifiedSubstackUrl(note) || verifiedSubstackUrl(entry), authorId: author.id };
    }).filter((note) => note.id && validDate(note.date));
    const noteReplies = [];
    (payload.noteReplies || []).forEach((capture) => {
      const note = notes.find((item) => item.id === String(capture.noteId));
      if (!note || !capture.data) return;
      const context = { kind: 'note', title: note.title, url: note.url };
      const replies = flattenCommentPayload(capture.data, context).filter((comment) => comment.id !== note.id);
      const root = { id: note.id, parentId: '', rootId: note.id, authorId: note.authorId || OWNER_ID, name: OWNER_NAME, handle: '', message: note.text, date: note.date, url: note.url, context };
      noteReplies.push(...conversationCards([root, ...replies], context, { complete: capture.complete === true, ownerVerified: payload.ownerEvidence?.verified === true }));
    });
    return { fetchedAt: payload.fetchedAt, publicPosts, postReplies, notes, noteReplies, warnings: payload.warnings || [], coverage: payload.coverage || { postLimit: 100, postsChecked: publicPosts.length, notesDays: 15 }, ownerEvidence: payload.ownerEvidence || { verified: false } };
  }

  function renderLive(live, staleMessage = '') {
    state.live = live;
    live.publicPosts.forEach((post) => mergePosts([post]));
    state.replies = live.postReplies.filter((reply) => !state.dismissed.includes(reply.id));
    state.capabilities.comments = true;
    state.sources.publicAt = live.fetchedAt;
    const saved = loadSaved(); const dashboard = mergeAvailable(saved, deriveDashboard());
    dashboard.replies = state.replies; dashboard.sources = state.sources; render(dashboard);
    $('#dataAsOf').textContent = `Data as of ${new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(live.fetchedAt))}`;
    $('#postsCoverage').textContent = `${live.coverage?.postsChecked ?? live.publicPosts.length} newest posts checked (limit ${live.coverage?.postLimit || 100})`;
    $('#liveWarning').hidden = !staleMessage && !live.warnings.length;
    $('#liveWarning').textContent = staleMessage || (live.warnings.length ? `Some live data could not be refreshed: ${live.warnings.join(' · ')}` : '');
    renderNotes(live);
  }

  function replyCards(replies) {
    return replies.length ? replies.map((reply) => `<article class="reply-item"><div class="reply-avatar">${escapeHTML(reply.initials)}</div><div class="reply-body"><div class="reply-meta"><strong>${escapeHTML(reply.name)}</strong><span class="badge ${reply.type}">${escapeHTML(reply.tag)}</span></div>${reply.handle ? `<div class="reader-details">@${escapeHTML(reply.handle.replace(/^@/, ''))}</div>` : ''}<p>${escapeHTML(reply.message)}</p><small>On “${escapeHTML(reply.source)}” · ${escapeHTML(reply.age)}</small>${reply.statusReason ? `<small class="status-reason">${escapeHTML(reply.statusReason)}</small>` : ''}</div><div class="reply-actions">${reply.url ? `<a class="reply-action primary-reply-action" href="${escapeHTML(reply.url)}" target="_blank" rel="noopener">${escapeHTML(reply.destinationLabel)} ↗</a>` : '<span class="link-unavailable">Exact link unavailable</span>'}<button class="reply-action" data-live-dismiss="${escapeHTML(reply.id)}">Mark replied</button></div></article>`).join('') : '<div class="empty"><strong>You’re all caught up.</strong>No conversations in this view are waiting on you.</div>';
  }

  function renderNotes(live) {
    const today = new Date().toDateString();
    $('#notesToday').textContent = live.notes.filter((note) => new Date(note.date).toDateString() === today).length;
    $('#notesTotal').textContent = live.notes.length;
    $('#notesWaiting').textContent = live.noteReplies.length;
    $('#notesWaitingBadge').textContent = live.noteReplies.length;
    $('#notesList').innerHTML = live.notes.length ? live.notes.map((note) => `<article class="note-item"><p>${escapeHTML(note.text || 'Note text unavailable.')}</p><small>${formatDate(new Date(note.date))}</small>${note.url ? `<a href="${escapeHTML(note.url)}" target="_blank" rel="noopener">Open Note ↗</a>` : ''}</article>`).join('') : '<div class="empty"><strong>No Notes found.</strong>No public Notes were returned for the last 15 days.</div>';
    $('#notesReplyList').innerHTML = replyCards(live.noteReplies.filter((reply) => !state.dismissed.includes(reply.id)));
  }

  async function refreshLiveData() {
    try {
      const response = await fetch('/api/live', { cache: 'no-store' });
      if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.error || `HTTP ${response.status}`); }
      const live = normalizeLiveData(await response.json());
      localStorage.setItem(LIVE_STORAGE_KEY, JSON.stringify(live)); renderLive(live);
    } catch (error) {
      const cached = JSON.parse(localStorage.getItem(LIVE_STORAGE_KEY) || 'null');
      if (cached) renderLive(cached, `Live refresh failed (${error.message}). Showing the last good data from ${formatDate(new Date(cached.fetchedAt))}.`);
      else { $('#liveWarning').hidden = false; $('#liveWarning').textContent = `Live data is unavailable: ${error.message}. The local service solves browser cross-origin restrictions only; it still needs a network path that can reach Substack.`; $('#dataAsOf').textContent = 'Live data unavailable'; }
    }
  }
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

  function walkRecords(value, visit, seen = new WeakSet(), ancestors = []) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (!Array.isArray(value)) visit(value, ancestors);
    Object.values(value).forEach((child) => walkRecords(child, visit, seen, Array.isArray(value) ? ancestors : [...ancestors, value]));
  }

  function recordKind(row, url = '') {
    const keys = Object.keys(row).map(normalizeHeader);
    const has = (...names) => names.some((name) => keys.includes(name));
    const entityType = String(row.type || row.entity_type || row.object_type || '').toLowerCase();
    if (has('subscription_status', 'subscriber_status', 'is_paid') && has('email', 'email_address')) return 'subscriber';
    if (/^(note|post|publication)$/.test(entityType)) return entityType === 'post' ? 'post' : '';
    if (/comment|reply/.test(entityType) || has('comment_id', 'parent_comment_id', 'reply_to_id', 'root_comment_id') || (has('body', 'comment', 'text') && has('id') && /comment|repl/i.test(url))) return 'comment';
    if (has('post_id', 'published_at', 'post_date', 'email_open_rate', 'open_rate') && has('title', 'post_title', 'subject')) return 'post';
    return '';
  }

  function normalizeCapturedRecord(record, captureUrl = '', ancestors = []) {
    const normalized = {};
    Object.entries(record).forEach(([key, value]) => {
      const cleanKey = normalizeHeader(key);
      if (value === null || typeof value !== 'object') normalized[cleanKey] = String(value ?? '');
      else if (/^(user|author|commenter|profile)$/.test(cleanKey)) {
        if (value.name || value.display_name) normalized.author_name = String(value.name || value.display_name);
        if (value.email) normalized.user_email = String(value.email);
        if (value.id) normalized.author_id = String(value.id);
        if (value.handle || value.username) normalized.author_handle = String(value.handle || value.username);
        if (value.profile_url || value.url) normalized.profile_url = String(value.profile_url || value.url);
      } else if (/^(post|publication|thread|note)$/.test(cleanKey)) {
        if (value.id) normalized.post_id = String(value.id);
        const isNote = cleanKey === 'note' || /note/i.test(String(value.type || value.entity_type || ''));
        const originalText = value.title || value.name || (isNote && (value.body || value.text || value.content));
        if (originalText) normalized.original_title = isNote ? noteLabel(originalText) : String(originalText);
        if (value.canonical_url || value.url || value.permalink) normalized.original_url = String(value.canonical_url || value.url || value.permalink);
        normalized.original_type = isNote ? 'note' : 'post';
      } else if (/^(replies|children)$/.test(cleanKey) && Array.isArray(value)) {
        normalized.captured_reply_count = String(value.length);
      }
    });
    if (!normalized.original_url || !normalized.original_title) applyAncestorContext(normalized, ancestors, captureUrl);
    const declaredReplies = numeric(get(normalized, aliases.replyCount));
    const capturedReplies = numeric(normalized.captured_reply_count);
    const hasMore = record.has_more_replies ?? record.has_more_children ?? record.has_more;
    if (capturedReplies !== null && hasMore === false && (declaredReplies === null || capturedReplies >= declaredReplies)) normalized.history_complete = 'true';
    if (!normalized.comment_url) {
      const candidate = record.comment_url || record.thread_url || record.reply_url || record.permalink || record.canonical_url;
      if (typeof candidate === 'string' && /comment|reply|notes\//i.test(candidate)) normalized.comment_url = candidate;
    }
    return normalized;
  }

  function applyAncestorContext(normalized, ancestors, captureUrl) {
    for (const ancestor of [...ancestors].reverse()) {
      if (!ancestor || Array.isArray(ancestor)) continue;
      const type = String(ancestor.type || ancestor.entity_type || ancestor.object_type || '').toLowerCase();
      const looksLikeNote = type === 'note' || (!/comment|reply/.test(type) && /notes/i.test(captureUrl) && (ancestor.body || ancestor.text) && (ancestor.user || ancestor.author));
      const looksLikePost = /post|publication/.test(type) || Boolean(ancestor.title && (ancestor.canonical_url || ancestor.post_url));
      if (!looksLikeNote && !looksLikePost) continue;
      const url = ancestor.canonical_url || ancestor.post_url || ancestor.note_url || ancestor.permalink || ancestor.url;
      const text = ancestor.title || ancestor.name || (looksLikeNote && (ancestor.body || ancestor.text || ancestor.content));
      if (!normalized.original_url && url) normalized.original_url = String(url);
      if (!normalized.original_title && text) normalized.original_title = looksLikeNote ? noteLabel(text) : String(text);
      normalized.original_type ||= looksLikeNote ? 'note' : 'post';
      if (!normalized.post_id && ancestor.id) normalized.post_id = String(ancestor.id);
      if (normalized.original_url && normalized.original_title) break;
    }
  }

  function noteLabel(value) {
    const text = String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const excerpt = text.length > 88 ? `${text.slice(0, 85).trim()}…` : text;
    return excerpt ? `Note: “${excerpt}”` : 'Note excerpt unavailable';
  }

  function ingestConnectorPayload(payload) {
    const before = { subscribers: state.subscribers.length, posts: state.posts.length, comments: state.comments.length };
    (payload.captures || []).forEach((capture) => {
      if (/comment|note|repl/i.test(capture.url || '')) state.capabilities.comments = true;
      if (/subscriber|audience|member/i.test(capture.url || '')) state.capabilities.subscribers = true;
      walkRecords(capture.data, (record, ancestors) => {
      const normalized = normalizeCapturedRecord(record, capture.url, ancestors);
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
    ['subscribers', 'newSubscribers', 'paid', 'conversion', 'openRate', 'revenue', 'subscriberRevenue'].forEach((key) => { if (fresh[key] === null && previous[key] !== undefined) result[key] = previous[key]; });
    if (!fresh.revenueKind && previous.revenueKind) result.revenueKind = previous.revenueKind;
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
  $('#replyList').addEventListener('click', (event) => { const button = event.target.closest('button.reply-action'); if (!button) return; state.dismissed.push(button.dataset.id); state.replies = state.replies.filter((reply) => reply.id !== button.dataset.id); const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); saveDerived({ ...saved, replies: state.replies, dismissed: state.dismissed }); renderReplies(); showToast(`${button.dataset.name} marked as replied`); });
  $('#notesReplyList').addEventListener('click', (event) => { const button = event.target.closest('[data-live-dismiss]'); if (!button) return; state.dismissed.push(button.dataset.liveDismiss); renderNotes(state.live); showToast('Conversation removed from this local inbox'); });
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

  function selectPublicationView(view) {
    state.activeView = view;
    $('#postsView').hidden = view !== 'posts'; $('#notesView').hidden = view !== 'notes';
    $('#postsTab').classList.toggle('active', view === 'posts'); $('#notesTab').classList.toggle('active', view === 'notes');
    $('#postsTab').setAttribute('aria-selected', String(view === 'posts')); $('#notesTab').setAttribute('aria-selected', String(view === 'notes'));
  }
  $('#postsTab').addEventListener('click', () => selectPublicationView('posts'));
  $('#notesTab').addEventListener('click', () => selectPublicationView('notes'));

  $('#todayLabel').textContent = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  restoreDerived();
  renderReplies();
  refreshLiveData();
})();
