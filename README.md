# Substack Pulse

A calm, human-first analytics dashboard for Stuart Moulder's Substack publication. Pulse processes Substack export CSV files locally and surfaces the readers waiting for a response alongside every publication metric that can be supported by the export.

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

Reply cards retain and display every traceable reader field supplied by the connector: name, handle, email, stable comment ID, post/thread title, timestamp, and verified profile/comment/post URL. When a URL is available, **Open in Substack** takes you back to the exported conversation location. Pulse labels a conversation **Never replied** or **Follow up** only when the capture supplies a stable ID, identifiable author, timestamp, and complete reply history. Incomplete captures are labeled **Reply status unknown** with the missing evidence shown. Subscriber and post CSVs alone do not establish individual comment threads.

## Optional local live connector

The [`extension`](extension/) directory contains an unpacked Manifest V3 browser extension. It observes JSON responses that the signed-in Substack publisher dashboard already loads, removes credential-like fields, stores a limited local snapshot, and retrieves the public feed for `smmoulder.substack.com`. Pulse's **Sync now** button reads that snapshot without uploading it to an application server.

1. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
2. Select the project's `extension` folder.
3. Sign in to Substack and visit the publisher dashboard pages containing the desired analytics, subscriber, post, and comment data.
4. Return to Pulse and select **Sync now**.

This connector intentionally does not handle passwords, cookies, authorization headers, or session tokens. It depends on the response formats used by Substack's publisher dashboard, which are not a stable public API and may change. The CSV snapshot remains the reliable fallback.

After every sync, Pulse reports how many post, subscriber, and comment records it recognized. A successful connection with zero recognized comments does **not** mean there are zero unanswered replies; the reply inbox remains unavailable until a comments or Notes response has actually been captured. Browse those pages in Substack and sync again.

## Run locally

No build step or dependencies are required. From the project directory, run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.
