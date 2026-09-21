'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const PUBLICATION = 'https://smmoulder.substack.com';
const SUBSTACK = 'https://substack.com';
const OWNER_ID = '4912487';
const MAX_POSTS = 100;

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'SubstackPulse/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${response.status} from ${new URL(url).hostname}`);
  return response.json();
}

function records(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function numberFrom(row, keys) {
  for (const key of keys) if (Number.isFinite(Number(row?.[key]))) return Number(row[key]);
  return 0;
}

function idFrom(row) {
  return row?.comment?.id ?? row?.comment?.comment_id ?? row?.item?.comment?.id ?? row?.item?.comment?.comment_id ?? row?.id ?? row?.comment_id ?? row?.post_id ?? row?.item?.id ?? row?.item?.comment_id;
}

function authorIdFrom(row) {
  return String(row?.user?.id ?? row?.user?.user_id ?? row?.author?.id ?? row?.author?.user_id ?? row?.user_id ?? row?.author_id ?? '');
}

function responseIsComplete(payload) {
  if (Array.isArray(payload)) return false;
  const hasMore = payload?.has_more ?? payload?.hasMore ?? payload?.more;
  if (hasMore === false) return true;
  const next = payload?.next_offset ?? payload?.next_cursor ?? payload?.next;
  return next === null && (hasMore === false || payload?.total !== undefined);
}

async function inBatches(items, worker, width = 6) {
  const output = [];
  for (let index = 0; index < items.length; index += width) {
    output.push(...await Promise.all(items.slice(index, index + width).map(worker)));
  }
  return output;
}

async function collectLiveData(fetchJson = getJson) {
  const warnings = [];
  const posts = [];
  for (let offset = 0; offset < MAX_POSTS; offset += 25) {
    const payload = await fetchJson(`${PUBLICATION}/api/v1/archive?sort=new&offset=${offset}&limit=25`);
    const page = records(payload, ['posts', 'items', 'results']);
    posts.push(...page);
    if (page.length < 25) break;
  }

  const postsWithComments = posts.filter((post) => numberFrom(post, ['comment_count', 'comments_count', 'num_comments']) > 0 && idFrom(post));
  const postComments = await inBatches(postsWithComments, async (post) => {
    const postId = String(idFrom(post));
    try {
      const data = await fetchJson(`${PUBLICATION}/api/v1/post/${encodeURIComponent(postId)}/comments`);
      return { postId, data, complete: responseIsComplete(data) };
    } catch (error) {
      warnings.push(`Comments for post ${postId}: ${error.message}`);
      return { postId, error: error.message };
    }
  });

  let notes = [];
  let noteReplies = [];
  try {
    const feed = await fetchJson(`${SUBSTACK}/api/v1/reader/feed/profile/${OWNER_ID}`);
    const cutoff = Date.now() - 15 * 86400000;
    notes = records(feed, ['items', 'feed_items', 'results']).filter((entry) => {
      const item = entry?.item?.comment || entry?.comment || entry?.item || entry;
      const type = String(entry?.type || item?.type || item?.entity_type || '').toLowerCase();
      const date = new Date(item?.date || item?.created_at || item?.published_at || entry?.date || 0).getTime();
      return type === 'comment' && Number.isFinite(date) && date >= cutoff;
    });
    noteReplies = await inBatches(notes.filter((entry) => idFrom(entry)), async (entry) => {
      const noteId = String(idFrom(entry));
      try {
        const data = await fetchJson(`${SUBSTACK}/api/v1/reader/comment/${encodeURIComponent(noteId)}/replies?comment_id=${encodeURIComponent(noteId)}`);
        return { noteId, data, complete: responseIsComplete(data) };
      } catch (error) {
        warnings.push(`Replies for Note ${noteId}: ${error.message}`);
        return { noteId, error: error.message };
      }
    });
  } catch (error) {
    warnings.push(`Notes feed: ${error.message}`);
  }

  const ownerPost = posts.find((post) => String(idFrom(post)) === '216473740') || posts.find((post) => authorIdFrom(post));
  const observedOwnerId = ownerPost ? authorIdFrom(ownerPost) : '';
  if (observedOwnerId && observedOwnerId !== OWNER_ID) warnings.push(`Configured owner ID ${OWNER_ID} did not match archive author ID ${observedOwnerId}.`);
  return {
    fetchedAt: new Date().toISOString(), ownerId: OWNER_ID,
    ownerEvidence: { verified: observedOwnerId === OWNER_ID, observedUserId: observedOwnerId, postId: ownerPost ? String(idFrom(ownerPost)) : '' },
    coverage: { postLimit: MAX_POSTS, postsChecked: posts.length, notesDays: 15 },
    posts: posts.slice(0, MAX_POSTS), postComments, notes, noteReplies, warnings
  };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
async function handler(request, response) {
  if (request.url === '/api/live') {
    try {
      const data = await collectLiveData();
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(data));
    } catch (error) {
      response.writeHead(502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error: `Live Substack refresh failed: ${error.message}` }));
    }
    return;
  }
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const filename = path.resolve(ROOT, relative);
  if (!filename.startsWith(`${ROOT}${path.sep}`)) { response.writeHead(403); response.end('Forbidden'); return; }
  try {
    const body = await fs.readFile(filename);
    response.writeHead(200, { 'content-type': TYPES[path.extname(filename)] || 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
}

if (require.main === module) http.createServer(handler).listen(PORT, () => console.log(`Substack Pulse: http://localhost:${PORT}`));

module.exports = { collectLiveData, handler, records, responseIsComplete };
