# Chrome helper — v0.6.12

This helper lets Outreach Desk open LinkedIn, find people, and fill outreach messages in your signed-in Chrome profile.

## Install it

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** and click **Load unpacked**.
3. Select this **chrome-extension** folder.
4. Make sure the helper is enabled and can access LinkedIn and `http://127.0.0.1:4318/`.
5. Refresh Outreach Desk in the same Chrome profile.

Already installed? Click **Reload**, then refresh the dashboard and any open outreach profile tabs. Check that the helper shows **0.6.12**. Use the helper in Chrome.

## Stop a running scan (v0.6.10)

Click **Stop scan** in Outreach Desk. The helper cancels its scan, closes only that scan tab and prevents pending page callbacks from restarting it. Contacts already accepted by the app remain saved. Invitation/message tabs and delivery receipts are untouched. Queued audience searches are cancelled by the dashboard. Use **Pause auto-scan** separately to disable future automatic runs.

### Founder discovery (v0.6.9)

Founder searches now look for product and SaaS companies instead of startup directories and news pages. Company results do not need to contain the literal word “startup.” The helper reads both current LinkedIn profile headings and the older layout, then checks the founder’s current company and Indian location before importing a pitch draft.

## How it works

Every scan looks for recent full-time design jobs, then finds designers, HR/recruiters, and founders at those companies. Founders do not need funding news or a metro-city location. The usual job/company checks, location rules, duplicate checks and two-founders-per-company limit still apply.

People appear in the dashboard as they are found. Keep the dashboard and LinkedIn search tab open, with the local app service running. The two audience tabs show different results from the same search.

## Sending a message

Click **Send outreach** to open the person's profile and prepare the connection/message box where LinkedIn allows it. Review the message and click LinkedIn's final **Send** button yourself.

The helper waits for LinkedIn’s note field and checks that it retained the full note. After you click **Send**, a new Pending status, including one under **More**, can confirm delivery. The app then marks the person done and closes the matching outreach tab. If you verify delivery yourself, **Mark done** also closes the matching tab while its outreach session is active.

If delivery is unverified, check **My Network → Invitations → Sent** before retrying or marking the contact done. You can use Outreach Desk for manual outreach by pausing discovery, using **Copy message** and **Open profile**, and recording the result after you verify it. LinkedIn prohibits unauthorized automation and may restrict accounts that use it. [LinkedIn's automation rules](https://www.linkedin.com/help/linkedin/answer/a1340567/automated-activity-on-linkedin)

If LinkedIn does not offer a note field, the message remains available to copy in Outreach Desk. The helper cannot bypass account limits, pending invitations, or sign-in checks.

See the [main README](../README.md) for app setup, API keys, the Google Sheet, automatic scans and troubleshooting.

Version 0.6.0 adds Google startup/founder discovery and per-job contact searches. Reload at chrome://extensions and allow access to https://www.google.com/search as well as LinkedIn. Founder candidates are checked on their visible LinkedIn profile before import. Google verification challenges are left for you to complete.

Version 0.6.1 requires explicit current-employment evidence in each contact card. Past experience and company keyword matches no longer qualify. Reload the helper and refresh Outreach Desk.

Version 0.6.3 tracks edited notes and Send without a note after a new LinkedIn success signal. It retains confirmation receipts until the dashboard acknowledges them (within the 15-minute session), so temporary connection failures can retry without another send. Google Sheet writing still requires the separate one-time Tracker setup.

Version 0.6.4 separates manual team and founder searches and closes helper scan tabs on completion. Reload the helper and refresh the app.

The current jobs-detail layout no longer needs the legacy AboutTheJob marker for full-time verification. v0.6.8 also searches the past three days and retains verified partial results.

The helper now alternates paired job searches with contact discovery, emits one contact per batch, and resumes later locations after streaming those results.

### Automatic completion without a toast (v0.6.8)
After you click LinkedIn Send, the helper also detects Pending links and accessible labels such as “Invitation pending” or “Pending, click to withdraw invitation”. A confirmation toast is not required. The contact moves to Completed and its Sheet update starts automatically. An old Pending state or simply closing the dialog does not count as a new send.

For standalone invitation pages that become blank after Send, v0.6.8 returns to that same person's profile to check Pending. Scans also skip an extra company-filter step when two visible current-employee matches already prove the company and role. Send detection checks every 250 milliseconds.

### Close the outreach tab automatically (v0.6.8)
The helper closes the matching LinkedIn profile or invitation tab after the dashboard acknowledges that delivery was recorded. It waits for that acknowledgement, so a disconnected dashboard cannot lose an unrecorded send. If you navigate the tab elsewhere, it stays open. Reload the helper after updating these files, then refresh the dashboard.
