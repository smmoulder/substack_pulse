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

## Importing a Substack export

1. In Substack, request or download your publication export.
2. Extract the downloaded archive.
3. Open **Import data** in Pulse and select all of the extracted CSV files together, or drag them onto the import area.

Pulse recognizes subscriber, post/statistics, comment/reply, note, and payment/revenue CSV files by filename and column headers. Export formats can vary; metrics whose supporting columns are absent remain marked **Not available**. For reply detection, a thread is considered waiting when a reader's root comment has no reply authored by **Stuart Moulder**. No selected file is uploaded or sent over the network.

## Run locally

No build step or dependencies are required. From the project directory, run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.
