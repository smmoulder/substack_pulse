# Substack Pulse Local Connector

This Manifest V3 Chrome extension observes JSON responses already loaded by the signed-in Substack publisher dashboard. It removes fields whose names suggest credentials or secrets, keeps at most 30 responses in `chrome.storage.local`, and makes them available only to the local Pulse dashboard or the configured GitHub Pages origin.

## Install

1. Open `chrome://extensions` in Chrome, Edge, Brave, or another Chromium browser.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this `extension` directory.
4. Sign in to Substack and browse the publisher dashboard pages containing analytics, subscribers, posts, and comments.
5. Return to Pulse and choose **Sync now**.

## Updating an existing installation

The connector is an **unpacked** extension, so Chrome does not update it automatically from Git or GitHub.

1. Pull or download the latest repository files, keeping all files in the `extension/` directory together.
2. Open `chrome://extensions`.
3. Find **Substack Pulse Local Connector** and select its circular **Reload** button.
4. Reload any already-open Substack dashboard tabs so the updated content scripts are injected.
5. Reload the Pulse dashboard, browse the relevant Substack pages once, and then select **Sync now**.

You do not need to remove and re-add the extension unless its folder moved or Chrome reports that the unpacked extension is missing. Changes limited to `pulse.js`, `index.html`, `styles.css`, or `server.js` do not require an extension reload; refresh Pulse and restart `node server.js` when `server.js` changed.

The connector does not read or store passwords, cookies, request headers, or session tokens. It relies on undocumented dashboard response shapes, so Substack changes may require updates to the normalizer.

Use **Export redacted diagnostics** in the extension popup to download the locally stored, already-redacted response shapes when a thread is missing identity, title, history, or link information. Review the JSON before sharing it; although credentials are removed, it can still contain reader and publication content.

The popup displays the installed connector version and Chrome extension ID. For this release it must show **Extension 0.2.0**. Chrome does not expose an unpacked extension's filesystem directory to extension JavaScript; confirm the **Loaded from** path on the extension's details page in `chrome://extensions`.
