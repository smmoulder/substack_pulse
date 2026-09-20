# Substack Pulse Local Connector

This Manifest V3 Chrome extension observes JSON responses already loaded by the signed-in Substack publisher dashboard. It removes fields whose names suggest credentials or secrets, keeps at most 30 responses in `chrome.storage.local`, and makes them available only to the local Pulse dashboard or the configured GitHub Pages origin.

## Install

1. Open `chrome://extensions` in Chrome, Edge, Brave, or another Chromium browser.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this `extension` directory.
4. Sign in to Substack and browse the publisher dashboard pages containing analytics, subscribers, posts, and comments.
5. Return to Pulse and choose **Sync now**.

The connector does not read or store passwords, cookies, request headers, or session tokens. It relies on undocumented dashboard response shapes, so Substack changes may require updates to the normalizer.

Use **Export redacted diagnostics** in the extension popup to download the locally stored, already-redacted response shapes when a thread is missing identity, title, history, or link information. Review the JSON before sharing it; although credentials are removed, it can still contain reader and publication content.
