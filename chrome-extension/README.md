# Outreach Desk LinkedIn Helper — v0.5.0

Connects `http://127.0.0.1:4318/` to the visible, signed-in LinkedIn Chrome session.

## Install/update

1. Open `chrome://extensions` in the Chrome profile signed in to LinkedIn.
2. Enable Developer mode and choose **Load unpacked**.
3. Select this `chrome-extension` folder.
4. Confirm the helper is enabled with access to LinkedIn and the local dashboard.
5. Refresh Outreach Desk in the same profile.

For updates, click **Reload**, then refresh the dashboard. Helper/dashboard version: **0.5.0**. The Codex in-app browser does not run this extension.

## Discovery

Every manual scan, Refresh people run and automatic two-hour run checks recent full-time Product/UX design jobs, then searches designers, HR/talent and founders. The team target of 20 is separate from the founder target, so reaching it does not stop founder stages. Per company: at most 2 designers, 2 HR/talent contacts and 2 founder candidates. Founders must show an Indian metro location; the server also requires qualifying recent funding before importing them.

Batches stream into the dashboard as they are verified. Audience tabs filter saved results; both audiences are searched in every run. Leave the dashboard/scan tab open and the server running. Saved profiles are excluded. Reloading the helper interrupts a running scan.

The parser supports modern/legacy cards, redirects with/without trailing slashes, rendering transitions, viewed/applied cards with hidden ages, and job-detail employment verification when LinkedIn drops Full-time. Per-search diagnostics remain in extension storage as `lastScanDiagnostics`.

## Outreach

Send outreach opens the profile, checks relationship controls and prepares an invitation/message editor where available. The full note is filled; an invitation-page fallback handles Connect buttons that fail to expose a dialog. The message stays copyable in Outreach Desk.

Review and click LinkedIn's final **Send** yourself. A reliable success signal marks the matching prepared contact done. Otherwise, verify delivery before using Mark done. Opening a dialog is not delivery. Sheet writes require the separate writer described in the [main README](../README.md).

Requests are accepted only from the local dashboard origin. Pending outreach expires after 15 minutes. The helper cannot bypass sign-in, account limits, pending invitations or missing note editors.

See [README.md](../README.md) for full setup, provider keys, startup, tracker, tests and troubleshooting.
