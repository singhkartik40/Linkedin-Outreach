# Chrome helper — v0.6.0

This helper lets Outreach Desk open LinkedIn, find people, and fill outreach messages in your signed-in Chrome profile.

## Install it

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** and click **Load unpacked**.
3. Select this **chrome-extension** folder.
4. Make sure the helper is enabled and can access LinkedIn and `http://127.0.0.1:4318/`.
5. Refresh Outreach Desk in the same Chrome profile.

Already installed? Click **Reload**, then refresh the dashboard. Check that the helper shows **0.6.0**. The helper does not work inside Codex's built-in browser.

## How it works

Every scan looks for recent full-time design jobs, then finds designers, HR/recruiters, and founders at those companies. Founders do not need funding news or a metro-city location. The usual job/company checks, location rules, duplicate checks and two-founders-per-company limit still apply.

People appear in the dashboard as they are found. Keep the dashboard and LinkedIn search tab open, with the local app service running. The two audience tabs show different results from the same search.

## Sending a message

Click **Send outreach** to open the person's profile and prepare the connection/message box where LinkedIn allows it. Review the message and click LinkedIn's final **Send** button yourself.

The app marks the matching person done when it can see LinkedIn confirm the send. Otherwise, check delivery yourself and use **Mark done**. Just opening a dialog does not mean a message was sent.

If LinkedIn does not offer a note field, the message remains available to copy in Outreach Desk. The helper cannot bypass account limits, pending invitations, or sign-in checks.

See the [main README](../README.md) for app setup, API keys, the Google Sheet, automatic scans and troubleshooting.

Version 0.6.0 adds Google startup/founder discovery and per-job contact searches. Reload at chrome://extensions and allow access to https://www.google.com/search as well as LinkedIn. Founder candidates are checked on their visible LinkedIn profile before import. Google verification challenges are left for you to complete.
