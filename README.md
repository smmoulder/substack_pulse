# Substack Pulse

A calm, human-first analytics dashboard for Substack publishers. Pulse surfaces the readers waiting for a response alongside subscriber growth, open rates, revenue, publishing cadence, and top-performing content.

## Features

- Reply inbox with **never replied** and **follow up** filters
- At-a-glance publication metrics and publishing cadence
- Content performance ranked by engagement
- Responsive desktop and mobile layout
- Local CSV import flow (the current prototype does not upload data to a server)

## Run locally

No build step or dependencies are required. From the project directory, run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Data notes

The dashboard currently ships with representative demo data so the full experience can be evaluated immediately. The import flow accepts CSV files and is ready to be connected to Substack export parsing or a secure backend integration.
