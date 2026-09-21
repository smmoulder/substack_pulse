# Substack Pulse

A calm, human-first analytics dashboard for Stuart Moulder's Substack publication. Pulse processes Substack export CSV files locally and surfaces the readers waiting for a response alongside every publication metric that can be supported by the export.

> **Current source release: Pulse Live Tabs 0.2.0 — published 21 September 2026.** The current interface has **Posts** and **Notes** navigation, the Node `/api/live` bridge, and connector version 0.2.0. This repository does not have GitHub Pages enabled, so GitHub stores the source but does not host a running copy. Pull `main` and start it with `node server.js`; the app's **Running** field will show the exact commit and checkout directory being served.

## Features

- Parses multiple Substack CSV export files entirely in the browser
- Reply inbox derived from comment and note threads, with **never replied** and **follow up** filters
- Subscriber totals, recent subscriber growth, paid conversion, post open rate, and revenue when those fields are present
- Twelve-week publishing cadence calculated from post dates
- Top content ranked using the best engagement measure available in the export
- Clear **Not available** states instead of fabricated data
- Responsive desktop and mobile layout
- Derived dashboard data saved only in the browser's local storage
- Public post-feed and private dashboard synchronization through the optional local Chrome extension
- Fresh public Posts and Notes data loaded from Substack whenever the app opens

## Live Posts and Notes

Pulse now uses Stuart's public Substack endpoints through its small same-origin Node server. It loads up to 100 archive posts, each post's public comments, Stuart's profile Notes from the last 15 days, and each Note's replies. The **Posts** and **Notes** tabs have separate reply inboxes. A thread is waiting only when its newest captured comment is from someone other than Stuart's stable user ID (`4912487`); **Follow up** means Stuart appeared earlier in that same history, while **Never replied** means he did not.

Conversation actions use a permalink returned by Substack when one is available. If Substack returns only the verified original post or Note URL, Pulse labels that fallback accurately. It never fabricates a comment URL, opens a profile/feed in its place, drafts a reply, or sends anything.

Every page load requests fresh public data and displays a **Data as of** time. The last successful response is cached in this browser. If a later request fails, Pulse keeps showing that snapshot and displays a warning rather than replacing it with empty data.

The Posts inbox states exactly how many archive posts were checked, capped at 100, and the Notes inbox is explicitly limited to the last 15 days. “Never replied” is used only when the response explicitly confirms complete pagination/reply history and the archive author data confirms Stuart's user ID as `4912487`. An array response without completeness metadata is deliberately treated as incomplete and produces **Reply status unknown**, not a confident unanswered label.

### Endpoint verification status

On 20 September 2026, the Codex execution environment could not reach any of the four supplied URLs: its outbound Envoy CONNECT proxy returned HTTP 403 before a TLS connection to Substack was created. That is a Codex network restriction—not a Substack response, login challenge, or browser CORS result. Stuart separately confirmed that the archive URL loads JSON in his browser and that its array contains “Book Festival!” (`id: 216473740`, `comment_count: 5`) with author `user_id: 4912487`. The comments and Notes response shapes remain unverified until their bodies are successfully received; Pulse therefore parses defensively and does not claim those endpoints are public or complete merely because they were proposed.

The included Node service is specifically a same-origin bridge for browser CORS restrictions: the browser calls `/api/live`, and that local process makes the upstream request. It cannot bypass a host/network firewall, Substack authentication, or an upstream error. If the machine running it cannot reach Substack, Pulse retains the last good browser snapshot and shows the failure.

## Importing a Substack export

1. In Substack, request or download your publication export.
2. Extract the downloaded archive.
3. Open **Import data** in Pulse and select all of the extracted CSV files together, or drag them onto the import area.

Pulse recognizes subscriber, post/statistics, comment/reply, note, and payment/revenue CSV files by filename and column headers. Export formats can vary; metrics whose supporting columns are absent remain marked **Not available**. For reply detection, a thread is considered waiting when a reader's root comment has no reply authored by **Stuart Moulder**. No selected file is uploaded or sent over the network.

Imports are cumulative: selecting or dropping another CSV adds it to the existing local snapshot rather than replacing previously imported data. You can also select or drag several CSV files at once. Re-importing a file with the same filename replaces that file's older rows, while preserving the other imported files.

If the file picker appears to do nothing, confirm that the downloaded Substack archive has been extracted first. Select the `.csv` files inside the extracted folder rather than the `.zip` file. A spreadsheet with columns such as **Title, Artist, Album, Genre, Plays** is an Apple Music library export—not a Substack export—and Pulse now rejects it with a specific explanation. The import dialog reports the number of recognized files and rows, identifies skipped files, and can import the same filenames again after a newer export is downloaded.

The source strip explains where displayed values came from. Publishing cadence can come from the public Substack feed even when subscriber and engagement analytics remain unavailable. Use **Clear data** in that strip to remove an incorrect or stale import before trying again.

The date-range control supports **Last 30 days**, **Last 90 days**, and **All time**. It recalculates recent subscribers, open rate, revenue, cadence, and top content from records in the selected period. Current total and paid subscriber counts remain current totals. **What's resonating** uses views when any view data is available for the selected period, otherwise opens, then open rate, then combined likes and comments; the metric in use is displayed in the card heading.

Revenue uses two deliberately separate sources. A subscriber export's **Revenue** column is summed across subscribers and labeled **Cumulative revenue from exported subscribers**; it is never filtered by the dashboard date range. Payment, payout, or transaction files are summed separately for the selected date range. Pulse ignores post `estimated_value` and never substitutes it for either revenue measure.

Reply cards retain and display every traceable reader field supplied by the connector: name, handle, email, stable comment/root/thread IDs, article title or original Note excerpt, timestamp, and verified comment/thread/post/Note URL. Pulse groups messages by their root conversation and displays the latest relevant reader message separately from the original article or Note. The primary action prefers an exact comment/thread permalink; when only a verified original URL exists it is accurately labeled **Open original article** or **Open original Note**. Reader profiles are never substituted for conversation links.

Pulse labels a conversation **Never replied** or **Follow up** only when the capture supplies a stable ID, identifiable author, timestamp, and complete reply history. It determines follow-up status from Stuart's own stable author evidence in that conversation—not from another reader's reply. Incomplete captures are labeled **Reply status unknown** with the missing evidence shown, while any independently verified conversation link remains available. Subscriber and post CSVs alone do not establish individual comment threads.

## Optional local live connector

The [`extension`](extension/) directory contains an unpacked Manifest V3 browser extension. It observes JSON responses that the signed-in Substack publisher dashboard already loads, removes credential-like fields, stores a limited local snapshot, and retrieves the public feed for `smmoulder.substack.com`. Pulse's **Sync now** button reads that snapshot without uploading it to an application server.

1. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
2. Select the project's `extension` folder.
3. Sign in to Substack and visit the publisher dashboard pages containing the desired analytics, subscriber, post, and comment data.
4. Return to Pulse and select **Sync now**.

Because this is an unpacked extension, reload it from `chrome://extensions` after pulling changes to anything inside `extension/`, and then refresh open Substack tabs. Dashboard-only changes do not require an extension reload: refresh Pulse, and restart `node server.js` if the server file changed. Full update instructions are in [`extension/README.md`](extension/README.md#updating-an-existing-installation).

This connector intentionally does not handle passwords, cookies, authorization headers, or session tokens. It depends on the response formats used by Substack's publisher dashboard, which are not a stable public API and may change. The CSV snapshot remains the reliable fallback.

After every sync, Pulse reports how many post, subscriber, and comment records it recognized. A successful connection with zero recognized comments does **not** mean there are zero unanswered replies; the reply inbox remains unavailable until a comments or Notes response has actually been captured. Browse those pages in Substack and sync again.

## Run locally

No install or build step is required. Node 18 or newer is needed because the local service provides the same-origin `/api/live` bridge used when browser cross-origin rules prevent a direct request. The machine running it must itself be able to reach Substack. From the project directory, run:

```bash
node server.js
```

Then open <http://localhost:8000>.

Do not open `index.html` directly and do not use `python -m http.server`: those launch the visual shell but cannot provide `/api/live`. The source strip shows the short Git commit and absolute directory reported by the running Node process, making it possible to confirm exactly which checkout is serving Pulse. **Sync now** refreshes the public Posts and Notes endpoints first, then supplements analytics from the optional connector; it no longer means “connector captures only.”

After updating this checkout:

1. Stop the old Node process and run `node server.js` from the updated repository directory.
2. Open <http://localhost:8000> and hard-refresh it; verify the **Running** entry shows the expected commit and directory.
3. If files under `extension/` changed, open `chrome://extensions`, reload **Substack Pulse Local Connector**, then refresh every open Substack tab.
4. The extension popup should report version **0.2.0** and its extension ID. Browse relevant Substack pages and return to Pulse.
5. Select **Sync now**. Pulse will either display a fresh **Data as of** timestamp or retain the previous timestamp with a visible source-specific warning.
