# Outreach Desk: complete operator and Open Code playbook

Updated 12 November 2026 for Outreach Desk and Chrome helper v0.6.15.

This is a handoff for a person or an AI agent operating Kartik's existing Outreach Desk. It explains the application, the Chrome connection, the actual clicks, how to prove a send happened, how to update the tracker, and how to resume safely after a failure. Read the whole document before sending real invitations.

## Contents

1. [What the application does](#1-what-the-application-does)
2. [Addresses, files and personal links](#2-addresses-files-and-personal-links)
3. [Understand the three separate connections](#3-understand-the-three-separate-connections)
4. [Start and check the application](#4-start-and-check-the-application)
5. [Install or reconnect the Outreach Desk helper](#5-install-or-reconnect-the-outreach-desk-helper)
6. [Connect Open Code to the existing Chrome profile](#6-connect-open-code-to-the-existing-chrome-profile)
7. [The operating rules](#7-the-operating-rules)
8. [Find designers and recruiters](#8-find-designers-and-recruiters)
9. [Find startup founders](#9-find-startup-founders)
10. [Use Job research](#10-use-job-research)
11. [Review the queue before sending](#11-review-the-queue-before-sending)
12. [Send one invitation: exact click sequence](#12-send-one-invitation-exact-click-sequence)
13. [Send a direct message to an existing connection](#13-send-a-direct-message-to-an-existing-connection)
14. [Verify delivery and complete the tracker](#14-verify-delivery-and-complete-the-tracker)
15. [Process a batch and handle new arrivals](#15-process-a-batch-and-handle-new-arrivals)
16. [Message editing, copying and history](#16-message-editing-copying-and-history)
17. [Google Sheet setup and recovery](#17-google-sheet-setup-and-recovery)
18. [Troubleshooting](#18-troubleshooting)
19. [How I control Chrome in Codex](#19-how-i-control-chrome-in-codex)
20. [Developer reference and checks](#20-developer-reference-and-checks)
21. [Ready-to-paste Open Code instructions](#21-ready-to-paste-open-code-instructions)
22. [Completion report template](#22-completion-report-template)

## 1. What the application does

Outreach Desk is a personal outreach workspace. Its purpose is to start relevant professional conversations about product and UX design opportunities. It is not an automatic job-application submission service.

The normal flow is:

```text
Recent India design jobs
  → verify the role and hiring company
  → find current designers and HR/talent employees
  → save contacts in Outreach
  → prepare a polite, personalised message
  → cross-check the tracker and LinkedIn connection state
  → open the actual LinkedIn invitation or conversation
  → send when the user has authorised sending
  → verify LinkedIn delivery
  → mark complete and verify the Google Sheet update
```

The founder flow is separate:

```text
Google product/startup company discovery
  → find the company's LinkedIn founder profiles
  → verify current founder role, company and India location
  → prepare a design pitch
  → use the same delivery and tracker checks
```

The application uses a React dashboard, a local Node.js server, a private SQLite database, a custom Chrome extension, and an optional Google Apps Script Sheet writer. An AI provider can help with supported extraction tasks. An AI key is not a LinkedIn access token and does not make LinkedIn send requests.

The helper prepares forms; it does not itself press LinkedIn's final Send button. A human normally clicks that button. An agent can click it when the user has explicitly asked the agent to send the queued outreach.

## 2. Addresses, files and personal links

| Item | Value |
| --- | --- |
| Windows project directory | `E:\Linkdin Outrreach tool` |
| Built application | `http://127.0.0.1:4318/` |
| Health check | `http://127.0.0.1:4318/api/health` |
| Read-only app state | `http://127.0.0.1:4318/api/state` |
| Chrome helper directory | `E:\Linkdin Outrreach tool\chrome-extension` |
| Helper name | Outreach Desk LinkedIn Helper |
| Version in this checkout | Read `chrome-extension/manifest.json` for the current version, `0.6.15` |
| Private local storage | `.data` in the project; preserve it |
| Optional private environment settings | `.env` in the project; preserve it |
| Repository | https://github.com/singhkartik40/Linkedin-Outreach |
| Portfolio | https://karteek.work |
| Resume | https://drive.google.com/file/d/16hilLHZ3_4nvYX56vPKkKpMFjUqpk1oN/view?usp=sharing |
| Outreach tracker | https://docs.google.com/spreadsheets/d/1M61OSpGnYkTYEbZbsaABS4j7QsxaHRV9L24PXniwIIY/edit |

Keep the exact resume URL intact, including `?usp=sharing`. Do not use an old link, shorten it, cut it off, or replace it with an ellipsis. Both personal links are deliberately part of the outreach workflow. API keys, browser tokens and Sheet write tokens are not part of any message.

The local address works only on the computer running the service. GitHub stores source files; it does not host this local server. Opening Chrome cannot start a stopped Node server by itself.

## 3. Understand the three separate connections

| Connection | Purpose | What it does not do |
| --- | --- | --- |
| Outreach Desk Chrome helper | Connects the dashboard to LinkedIn/Google pages, scans, opens forms, fills notes, observes send confirmations | Does not give Open Code general browser control |
| Agent's browser integration | Lets Codex or Open Code inspect tabs and click visible controls, including the final Send | Does not replace the Outreach Desk helper or its tracker safeguards |
| Sheet writer | Writes a confirmed send to the tracker and checks the result | Does not send LinkedIn invitations |

All relevant browser components must use the **same signed-in Chrome profile**. A fresh Playwright test browser usually has neither the existing LinkedIn login nor the installed Outreach Desk helper. A dashboard opened in an embedded browser can display the app while still lacking the Chrome helper.

Do not confuse the Open Code model/provider key with the optional AI-provider key entered in Outreach Desk Settings. They configure separate applications.

## 4. Start and check the application

### Normal daily use

1. Open the existing Chrome profile where LinkedIn is signed in.
2. Open `http://127.0.0.1:4318/`.
3. If the dashboard loads, use that existing service; do not launch a second server.
4. If Chrome says connection refused, double-click **Start Outreach Desk.cmd** in the project directory.
5. Reopen or reload the dashboard.
6. Check the bottom-left helper status. It should show the helper version and **Connected**.

### Start from a terminal

Use PowerShell in the project directory:

```powershell
Set-Location -LiteralPath 'E:\Linkdin Outrreach tool'
node --version
npm start
```

Node.js 24 or newer is required. Keep the terminal/service running. On a new checkout, install and build first:

```powershell
npm ci
npm run build
npm start
```

`npm run dev` is a developer frontend on a different port. Use the built dashboard on **4318** for the installed helper flow.

### Read-only readiness check

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4318/api/health'
```

Expect `app: outreach-desk` and `ready: true`. This proves the local service is running; it does not prove LinkedIn login, helper connection or Sheet writing.

### Optional Windows startup

The repository includes `scripts/install-outreach-startup.ps1`. Its documented installation command is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-outreach-startup.ps1
```

This creates a Windows task for the service. Installing startup behaviour is a separate setup change, not a requirement for each outreach session. Do not repeatedly reinstall it. The machine must remain awake and Chrome/dashboard must remain open for browser-based automatic discovery.

## 5. Install or reconnect the Outreach Desk helper

### One-time install

1. In the correct Chrome profile, open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `E:\Linkdin Outrreach tool\chrome-extension`.
5. Enable **Outreach Desk LinkedIn Helper**.
6. Check its site access for the local dashboard, LinkedIn and Google Search.
7. Refresh the dashboard in that same Chrome profile.
8. Confirm the dashboard reports the installed version and **Connected**.

The manifest currently requests `storage`, `tabs`, `scripting` and `clipboardWrite`, with access to the loopback dashboard, LinkedIn, and Google Search. Do not broaden those permissions just to work around a stalled page.

### After extension files change

1. Check the version in `chrome-extension/manifest.json`.
2. Open `chrome://extensions`.
3. Click **Reload** on the Outreach Desk helper card.
4. Refresh the Outreach Desk dashboard.
5. If an old LinkedIn page is still using an invalidated content script, reload that specific page after preserving any unsent note.

Reloading the webpage alone does not reload the extension's service worker. Reloading the extension alone can leave an old dashboard bridge invalid until the dashboard is refreshed.

Browser automation may not have access to Chrome's protected extension-management page. In that case, the user must perform those few install/reload clicks. Do not claim that a source-file update is already active in Chrome.

## 6. Connect Open Code to the existing Chrome profile

This section is setup guidance. Writing this file has not installed or tested Open Code on this machine.

Open Code needs a browser-control MCP connection in addition to the Outreach Desk helper. One supported option is Microsoft's **Playwright Extension** with Playwright MCP in extension mode. It attaches to existing Chrome tabs and sessions. Use the extension link in the [official Playwright browser-connection documentation](https://playwright.dev/mcp/configuration/browser-extension); do not install an unrelated extension with a similar name.

### Standard Open Code configuration

For Open Code releases using the configuration described in its [MCP server documentation](https://opencode.ai/docs/mcp-servers/), merge this into the project's `opencode.json` or `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp@latest", "--extension"],
      "enabled": true
    }
  }
}
```

Preserve existing provider, model and other MCP settings. Open Code uses its own configuration structure; do not paste a generic `mcpServers` example into it unchanged. Configuration schemas can differ by release: if the installed version rejects this shape, consult its matching documentation rather than guessing keys. See [Open Code configuration](https://opencode.ai/docs/config/).

### Connection steps

1. Install the official Playwright Extension in the Chrome profile already used for Outreach Desk and LinkedIn.
2. Add the MCP configuration above to Open Code.
3. Restart/reconnect Open Code so its browser tools become available.
4. Keep the dashboard open on 4318.
5. Ask Open Code to list browser tabs using its actual available browser tools.
6. Approve the intended browser connection when the extension asks.
7. Select/attach to the existing Outreach Desk tab.
8. Ask it to read the page title, URL, helper status and Active count without clicking Send.
9. Confirm it can see the signed-in LinkedIn profile in the same Chrome profile.
10. Only then authorise a real send batch.

Do not disable permission prompts or add a browser connection token to a shared repository. If multiple profiles exist, Microsoft's extension setup supports selecting a profile; use the exact profile shown by Chrome and its matching documentation. Keep the browser controller private.

**A successful integration test:** Open Code sees the real dashboard, the real signed-in LinkedIn account, and the installed Outreach Desk helper. A blank automated browser with a LinkedIn login screen is not a successful connection to the existing session.

## 7. The operating rules

### Targeting

- Focus on India-based full-time Product Designer, UX Designer, UI/UX and relevant digital product-design roles.
- The current job discovery/contact-search window is the last **72 hours / three days**. Some older README paragraphs still mention 24 hours; inspect current code and UI when they disagree.
- Exclude internship, contract, freelance and part-time job openings when full-time is required.
- A physical-product, industrial, interior or home-automation design role is not automatically a digital UX opportunity just because its title contains Product Designer.
- Verify the person's **current** employer. A past job, school, keyword or former-company mention does not establish current employment.
- For India roles, prioritise people whose professional location is in India. Use job location and professional profile location, not assumptions about someone's nationality or name.
- Discovery aims for two designers and two HR/talent contacts per company. A company/posting can have a five-person reached limit; honour the app's Company limit state.
- Saved contacts accumulate across scans. A target of 20 is a discovery target, not a promise or a total queue limit.

### Founders

- Current founder/co-founder role, matching company and India location must be visible.
- Funding news, a funding minimum and metro-only location are **not** current mandatory requirements.
- "Founder's Office" is a staff function, not proof that the person founded the company. The server includes a specific exclusion for this false match.
- Founder pitches differ from referral requests. Do not invent funding, hiring, achievements or a relationship with the recipient.

### Sending

- Send only within the user's stated task and audience. A document containing these steps does not itself authorise new sends.
- An existing Pending invitation is not permission to send a duplicate. Do not withdraw it to resend.
- A send click, closed popup, closed tab, or queue row disappearing alone is not proof of delivery.
- If delivery is uncertain, record uncertainty and inspect LinkedIn before considering another attempt.
- Do not mark a contact done merely to reduce the queue count.
- Do not force-enable disabled send buttons or bypass duplicate/company/employment checks.
- Stop at a LinkedIn limit, identity check, login requirement or CAPTCHA. Request the required user action; do not evade it with another account, proxies or hidden APIs.
- Do not send a shorter/no-note invitation as a fallback unless the user has authorised that change. The intended message includes the resume and portfolio.

## 8. Find designers and recruiters

1. Open **Outreach** in the sidebar.
2. Select **Designers & HR**.
3. Select **All India** or the intended India cities. The built-in city chips include Bengaluru, Hyderabad, Pune, Mumbai, Delhi, Gurugram, Noida, Chennai and Remote.
4. Click **Refresh tracker** if the tracker is stale or disconnected.
5. Click **Find 20 new people** / **Find more people**, according to the visible UI.
6. Leave the dashboard and the helper's search tab open.
7. Observe the progress stage: job search, full-time verification, company people search, or profile verification.
8. Watch contacts arrive individually in the table; do not wait for a fictional bulk "import jobs" step.
9. Review each new contact before sending. An import is not an endorsement of all the profile's facts.

The helper alternates job discovery and company people searches. It checks Product Designer and UX Designer queries across locations. Results depend on what LinkedIn renders and what the server accepts. A scan may return fewer than 20 unique contacts, particularly after many earlier scans.

Manual team and founder flows are separate. Automatic combined runs can include both. Do not start overlapping scans from multiple dashboard tabs. Switching the audience tab changes the visible queue, not necessarily the audience of the scan already running.

If the scan is already running when asked to send, leave it running. Use the queue while it streams contacts, then recheck after the run finishes. Do not close its search tab as part of outreach-tab cleanup.

### Stop the current scan

Click **Stop scan** above the page content. It is available while discovery is running, including from Job research and after a dashboard refresh detects an existing run. The button changes to **Stopping scan…** until the helper acknowledges cancellation. It clears queued audience searches, closes only the helper's scan tab and keeps accepted contacts/imports already saved. It does not mark any outreach sent, change an invitation, or delete contacts.

**Stop scan** cancels this run. **Pause auto-scan** changes future automatic runs. Stopping retains hourly discovery but postpones the next automatic run so an overdue scan does not restart immediately. Use Pause as well if no later automatic discovery is wanted.

Reload the helper to **0.6.10** and refresh the dashboard to activate cancellation. An older helper cannot execute the new stop command; a failed acknowledgement must be reported rather than shown as a successful stop.

## 9. Find startup founders

1. Open **Outreach**.
2. Select **Founders & co-founders**.
3. Click **Find startup founders**.
4. Observe Google company discovery followed by LinkedIn founder lookup/profile checks.
5. Review the imported founder's company, headline, location and source.
6. Reject founder-office staff, former founders, unrelated-company founders and unverified old entries.
7. Review the design-pitch message and both links.
8. Use the same invitation, delivery and Sheet verification process as normal outreach.

Do not describe a run as successful just because the progress bar counted candidates. Candidate discovery, server acceptance, a saved row, an attempted send, LinkedIn confirmation and a Sheet write are separate stages.

## 10. Use Job research

1. Click **Job research**.
2. Use the source, location, posting-age and search filters.
3. The default board window is three days. Use the visible age filter for 24 hours, 48 hours, three days or unknown dates where available.
4. Use the row's **Open on LinkedIn** / **Open on…** link to view its original source. Clicking the job title can instead open saved app details.
5. Use **Refresh job feeds** to refresh configured feed sources, subject to their cache.
6. Use **Scan recent LinkedIn jobs** for a live Chrome scan.
7. On a qualifying job, click **Find 4 people for this job**.
8. Watch the Outreach queue for that company's contacts: up to two designers and two HR/talent people, with existing profiles skipped.

The app combines saved LinkedIn research with configured public Jobicy/Remotive feeds. These sources have caches and publication delays; it does not contain every LinkedIn job or a configured official LinkedIn jobs API. The local job board currently filters for India eligibility.

## 11. Review the queue before sending

1. Choose the correct audience.
2. Choose **Active**.
3. Clear text/company filters unless the task specifies a subset.
4. Set **Show → All contacts** so a 25-row display does not hide the rest of the batch.
5. Read each person's name, profile URL, current company/headline, location, linked job, message and tracker state.
6. Match by profile URL as well as name. Different people can share a name.
7. Confirm the message contains the correct recipient/company and the complete links.
8. Check **Clear to contact** and whether **Send outreach** is enabled.
9. Check the current LinkedIn state immediately before final Send.

### What the list states mean

| Display/state | Meaning and action |
| --- | --- |
| Draft ready / Active | Saved unfinished contact; still needs eligibility and live connection review |
| Needs live check | Connection state is not currently verified; inspect LinkedIn |
| Clear to contact | No tracker match under the current check; not proof that no LinkedIn invitation exists |
| Already in tracker | Skip duplicate outreach; inspect history if clarification is needed |
| Current company unverified | Rescan or verify; do not bypass the disabled gate |
| Company limit | Existing reached contacts fill this company/posting allowance |
| Send confirmed | Delivery recorded locally; Sheet sync is pending |
| Sent | Delivery recorded and Sheet write verified by the server |
| Skipped | Preserved but out of the normal active flow |
| Deleted | Recoverable local deletion; not an invitation withdrawal |

An Active count is not the number of sendable people. A queue of 28 may include old pending invitations, tracker duplicates, stale records and unsuitable roles. Report the actual disposition of all 28 rather than claiming 28 new sends.

## 12. Send one invitation: exact click sequence

### A. In Outreach Desk

1. Locate the exact row by person name **and profile URL**.
2. Read the row's current message. Use **Details & edit** if it needs correction.
3. Click that row's **Send outreach** once.
4. Read the dashboard notification and **Outreach handoff** panel.
5. Keep the dashboard open. The panel includes **Full outreach message to copy**, **Copy full message**, and **Open profile**.
6. Locate the LinkedIn tab by its URL/recipient. The helper may reuse and reload an existing tab for this profile instead of opening a new one. Do not assume it is the most recently opened tab: a discovery scan may also be opening tabs.
7. Preserve that matching tab while preparation is running. A profile tab opened earlier for inspection can become the helper's actual send tab; closing it as a supposed duplicate interrupts preparation.

The app validates the message, creates a short-lived receipt, copies the full message where possible, and asks the helper to prepare the form. None of those actions proves an invitation was sent.

### B. On the recipient's LinkedIn profile

1. Verify the visible person's name, current company, role and location.
2. Inspect the main profile actions, not suggested people in the sidebar.
3. If the main action is **Pending**, **Invitation pending**, or a control labelled **Pending, click to withdraw invitation…**, stop: there is already a request.
4. If **Connect** is visible, the helper should click it. If Connect is in **More**, open the profile's **More** menu and inspect that menu.
5. Do not select another person's Connect button from recommendations.
6. Wait for the invitation dialog to render. A loading dialog is not a note editor.
7. If the dialog offers **Add a note**, click it once unless the helper already did.
8. If the helper uses LinkedIn's standalone invitation page, verify it is still the same recipient. Do not construct guessed member identifiers or send through undocumented endpoints.

### C. In the note dialog

1. Read the heading, usually **Add a note to your invitation**.
2. Read the actual text inside the note textbox.
3. Compare it with the current handoff message, not a cached message from another row.
4. If blank, paste the exact approved handoff text using the textbox and ordinary typing/paste controls.
5. Confirm both URLs are intact and the note is no longer than **290 characters**. It need not be exactly 290 characters. Links count toward the limit.
6. If LinkedIn's available limit is lower than the full message length, stop for review rather than silently truncating links.
7. If the user authorised sending, click **Send invitation** / the final **Send** once.
8. Record that the send was attempted immediately. Inspect the resulting page before another final Send click.
9. Continue to delivery verification below.

If the helper already opened/focused the editor, do not click Add a note again. Read the fresh page after every action; the helper and LinkedIn can change the page between clicks.

### D. No note field or missing dialog

1. Check for a pending invitation, account restriction, loading state or helper error.
2. Preserve the exact full message in the handoff panel.
3. Use **Copy full message** if needed and verify copying actually succeeded before relying on the clipboard.
4. Do not assume an invitation without a note satisfies a task that requires the full pitch/resume.
5. Do not mark done because a dialog is open.
6. If no usable form is exposed, record the blocker and move to another eligible contact.

## 13. Send a direct message to an existing connection

**Message** alone does not prove the person is a first-degree connection: LinkedIn also exposes messaging/InMail entry points on some non-connected profiles.

1. Verify the actual relationship and correct recipient.
2. Review existing conversation history for a prior matching outreach message.
3. If a matching message was already sent, do not duplicate it.
4. Open **Message** for that person or let the helper do so.
5. Verify the conversation header and actual editor. A different conversation may already be open in a floating overlay.
6. Read the prepared message and check both links.
7. Use the visible **Send** button. If the UI only offers Enter-to-send, inspect **Open send options** before using Enter.
8. Verify a new matching outgoing message bubble with its current timestamp, or LinkedIn's new success signal.
9. Only then complete the contact and Sheet sync.

If LinkedIn asks for InMail credits or a paid upgrade, do not purchase or spend credits without appropriate user authorisation.

## 14. Verify delivery and complete the tracker

Use evidence tied to the exact recipient and current attempt.

### Accepted evidence

- A new LinkedIn invitation/message success notification.
- A newly visible Pending/Invitation pending action for that recipient after the send.
- A recipient-specific Pending control inside the profile's More menu.
- The recipient in LinkedIn's **My Network → Show all invitations → Sent** list, with the matching sent time/message where available.
- For a direct message, a newly added outgoing bubble matching the intended text.

### Not sufficient by itself

- The helper says the dialog is ready.
- The Send button was clicked.
- The note dialog closed or the standalone page became blank.
- A tab disappeared.
- An Active row disappeared without a corresponding confirmed delivery record.
- An old Pending state that existed before this attempt.
- No error appeared.

### Automatic completion

1. Keep the dashboard open.
2. Let the helper observe LinkedIn's new success/Pending state.
3. The helper sends the delivery receipt to the dashboard.
4. The server validates the receipt, records delivery and attempts the Sheet write.
5. The app shows **LinkedIn send confirmed. Contact marked done and Sheet row verified.** on success.
6. The matching contact moves to **Completed**. The helper can close its outreach tab after the dashboard acknowledges delivery.

The receipt is bound to the contact, profile and prepared message and expires after 15 minutes. Restarting the local server or repeatedly re-preparing the same contact can invalidate an older receipt. Avoid doing either while a send is unresolved.

### Manual Mark done fallback

1. First verify LinkedIn delivery using one of the accepted signals.
2. Return to the correct audience and find the exact same row.
3. Re-read the row's name/profile URL immediately before clicking.
4. Click its **Mark done** checkbox once.
5. Wait for the app's completion/Sheet result before clicking it again or doing another completion mutation.
6. A success notification can name the recipient and verified Master row number. Record that result.

This is a controlled checkbox used as an action, not a persistent tick. In browser automation, a normal click is more reliable than repeatedly calling a checkbox `check()` method that expects the tick to remain checked.

### Sheet-only retry

If delivery is recorded but the Sheet failed:

1. Open **Completed**.
2. Find the exact contact showing **Send confirmed** or Sheet update pending.
3. Click **Retry Sheet update**.
4. Verify the named contact and successful row readback.
5. Do not send a second LinkedIn invitation/message to fix a Sheet failure.

## 15. Process a batch and handle new arrivals

### Before the batch

1. Confirm which audience and whether the user authorised final sends.
2. Refresh tracker information.
3. Capture visible rows with profile URL, name, company, message and starting state.
4. Review previous run logs for uncertain attempts. Do not blindly retry those records.
5. Keep a set of attempted profile URLs for the current run.

### Per contact

```text
Choose one eligible, unattempted profile
→ read its current row and message
→ prepare through Send outreach
→ verify recipient and live relationship
→ inspect the actual note/message field
→ click the final Send once
→ record the attempt immediately
→ verify delivery
→ confirm automatic completion or use the verified manual fallback
→ verify Sheet result
→ close only that finished outreach tab
```

A useful per-contact state record is:

```json
{
  "profileUrl": "https://www.linkedin.com/in/example-person/",
  "name": "Example Person",
  "company": "Example company",
  "phase": "prepared | send-clicked | linkedin-confirmed | sheet-verified | skipped | uncertain",
  "evidence": "Recipient-specific visible result, not an assumption",
  "sheetStatus": "Sent | Send confirmed | unchanged"
}
```

Never replace an unresolved current recipient with the next one and lose their state. If the tool times out after a send action, inspect the live invitation/message state before deciding whether to retry.

**The helper keeps one active `pendingOutreach` and one `outreachSession` in extension storage.** Preparing another contact replaces that session. Finish the current person's LinkedIn verification and local completion before clicking another person's Send outreach. Research and scanning can continue independently.

### While discovery runs

1. Keep sending independently eligible saved contacts.
2. Read the queue again periodically; append new profile URLs to the run list.
3. Retain the attempted set so existing rows are not sent again.
4. Do not infer that a new row count means all rows are new.
5. Honour company limits even while Sheet updates are in progress; confirmed local sends count too.
6. Keep scan tabs open until that scan completes or fails.

### Final recheck

1. Wait for the current discovery run to complete or expose a concrete blocker.
2. Read Active again with filters cleared and All contacts selected.
3. Review any newly arrived profiles and process eligible ones once.
4. Reconcile all attempted sends with LinkedIn evidence and app/Sheet states.
5. Report confirmed sends, existing pending requests, duplicates, unsuitable contacts, capped companies, unconfirmed attempts and Sheet-pending writes separately.
6. Stop when the authorised queue/current scan's arrivals are exhausted or a concrete service/account blocker prevents progress. Do not silently turn a one-off request into permanent unattended sending.

### Speed without losing records

- Use names/roles and exact profile URLs instead of coordinates where possible.
- Read compact page changes rather than dumping every full page.
- Let independent research continue while Sheet syncing finishes.
- Keep final sends serial and tracked. Open only a small number of task tabs.
- Wait for an actual ready control or changed state rather than retrying Send in a loop.
- A slow page or account limit is not a reason to remove verification or increase sending concurrency.

## 16. Message editing, copying and history

In a contact row:

- **Copy message** copies the current draft.
- **Details & edit** opens the draft, evidence and message history.
- **Save message** keeps the previous version and saves the new draft.
- **Copy**, **Paste from clipboard**, **Copy version**, **Restore version** and version deletion operate on message text/history.
- **More actions → Copy profile link** copies the URL.
- **More actions → Copy all details** copies the contact/source/message.
- **More actions → Skip for now** preserves the contact outside Active.
- **Skipped → More actions → Return to queue** reverses skipping.
- **Delete contact** is recoverable through Deleted/Restore contact.
- **Export CSV** exports selected contacts or the filtered list.

Do not delete a contact as a substitute for proving delivery. Do not rewrite historical sent-message records to pretend a new resume URL was present in an old send.

## 17. Google Sheet setup and recovery

The tracker used here is the Sheet linked in section 2, normally its **Master** tab.

### Reading

Public viewer sharing allows the app to read the tracker. It does not authorise writes. Use **Tracker → Refresh tracker**, or **Refresh tracker** in Outreach, to recheck historical contact matches.

### Writing

The one-time setup is exposed under **Tracker → Automatic Master updates**:

1. Download the writer script from the app.
2. Open the Sheet's **Extensions → Apps Script**.
3. Save the supplied writer code.
4. Generate a private write token in Outreach Desk.
5. Add it as Apps Script property `OUTREACH_WRITE_TOKEN`.
6. Deploy the script as a Web app with the intended owner/account and access settings.
7. Put its deployment URL ending in `/exec` and matching token into the app.
8. Click **Save writer on this computer**.
9. Test by retrying the Sheet update for an already verified send, not by sending a fake invitation to a real person.

This particular account previously had writer setup completed. Inspect current configuration/status before redeploying anything. A new Google permission or endpoint-access change needs the user's approval; this playbook is not permission to expand Google access.

Saved writer settings survive server restarts in the private database. Existing `.env` fallback names are `SHEET_WRITE_WEB_APP_URL` and `SHEET_WRITE_TOKEN`. Never print their values, place them in the guide, commit them, or include them in browser screenshots.

The writer updates a matching historical row or appends a missing contact, then checks the returned Sheet identity, profile and row/status. A local confirmed send remains confirmed even if Google is unavailable.

## 18. Troubleshooting

| Symptom | What to inspect | Correct response |
| --- | --- | --- |
| Connection refused on 4318 | Local service/health check | Start the existing app; avoid duplicate server processes |
| Helper disconnected/version mismatch | Manifest, extension card and dashboard status | Reload the installed helper, then refresh dashboard |
| Message port closed/receiving end missing | Extension reloaded but old bridge/content script remains | Refresh affected dashboard/profile; preserve unfinished sends |
| Jobs tab opens but scan never advances | Sign-in, loading, permission, visible current stage | Observe that actual tab; do not claim zero jobs merely because a script failed |
| 75-second scan-stage timeout | Stalled page, challenge, changed layout, missing script | Keep partial results; report the stage/error; resolve the blocker before retrying |
| No recent jobs despite visible listings | Title/company/date/full-time/location extraction | Compare live cards with parser/server acceptance; retain targeting rules |
| No people while scanning | Current stage, duplicate history, current-employer gate, imports | Wait for verified people stages; distinguish candidates from saved imports |
| Old employer matched | Headline/Experience current role versus past jobs | Skip and fix extraction; do not weaken current-employment rules |
| Founder-office staff imported | Actual headline | Skip that match; test the server founder-role exclusion |
| Connect does not open a dialog | Profile More menu, loading, account/relationship state | Use visible controls/helper's supported fallback; preserve full message |
| No Add a note | Account limitation, pending request, wrong container | Do not silently send without the intended note |
| Note differs or link is cut off | Actual textbox value and full handoff message | Correct before Send; never invent a shorter resume URL |
| Send clicked but no confirmation | Live profile/More, Sent invitations, conversation bubble | Leave uncertain; do not mark done or repeatedly resend |
| Blank standalone invitation after Send | Same recipient's profile and Pending control | The helper can recheck; blank page is not proof |
| Old request already Pending | Recipient-specific control or Sent history | Skip new invitation; do not withdraw/reinvite |
| Tab closed unexpectedly | App delivery event and status | Reconcile receipt; do not assume the tab close itself proves delivery |
| Mark done has no persistent tick | Controlled action checkbox, in-progress Sheet write | Click once and read named completion result |
| Sheet update pending | Writer configuration/reachability and Completed entry | Retry Sheet update only |
| Scan tab disappeared | User/extension/tab lifecycle | Preserve results; do not keep referencing its stale tab ID |
| Google CAPTCHA or LinkedIn verification | Visible challenge | Request human action; do not bypass |
| LinkedIn account/invitation limit | Visible warning and account state | Stop further sends and report; do not invent a cooldown duration |

### Diagnose before changing code

1. Capture the exact visible error and stage.
2. Reproduce with one safe action.
3. Trace the boundary: dashboard → bridge → background worker → page script → result batch → server validation.
4. For send issues, inspect actual recipient-specific delivery evidence before experimenting.
5. Add a regression test reproducing the demonstrated bug.
6. Verify that test fails, make the smallest relevant change, and run appropriate tests.
7. Rebuild/restart/reload only the component changed, and only after unresolved sends and Sheet writes are recorded.
8. Distinguish a passing fixture test from a successful real LinkedIn run.

## 19. How I control Chrome in Codex

In this chat the browser-control runtime is Codex's `cua_repl`. It is separate from the custom Outreach Desk extension. **These exact `cua` methods are not automatically available in Open Code.** Open Code must use its own connected MCP tools to carry out the same visible actions.

My sequence is:

1. Inventory browsers and tabs.
2. Select the existing Chrome browser/profile rather than the embedded browser.
3. Bind/claim the existing dashboard tab.
4. Read a fresh accessibility tree or DOM snapshot.
5. Identify controls by role and visible name.
6. Click the named contact's Send outreach.
7. Inventory tabs again to find the matching recipient URL.
8. Attach to that tab and inspect the actual form.
9. Check the editor's text and recipient.
10. Click final Send only within the user's authorisation.
11. Inspect success/Pending/message evidence.
12. Reconcile app completion and Sheet status.
13. Close only the finished outreach tab; preserve the dashboard, active scan and unrelated user tabs.

Example **Codex-only** setup, when those documented tools are available:

```javascript
// Browser IDs and tab IDs come from a fresh inventory; never hardcode old IDs.
await cua.getState();
const dashboard = await cua.getTab(actualDashboardTabId, {
  browser: actualChromeBrowserId
});
```

Once that runtime has returned its supported Playwright API, I use page structure like this:

```javascript
const row = dashboard.playwright.getByRole('row').filter({
  has: dashboard.playwright.getByRole('button', {
    name: exactPersonName,
    exact: true
  })
});

// First verify that this single row has the expected profile URL and message.
await row.getByRole('button', {
  name: 'Send outreach',
  exact: true
}).click();
await dashboard.playwright.domSnapshot();
```

This is a locator pattern, not a complete bulk-send script. Names can collide; verify the row's profile link. Open Code's Playwright MCP can expose snapshot references rather than this same JavaScript wrapper. Use its actual tool schema and fresh references. Do not copy stale numeric element IDs or browser IDs from old logs.

Read-only DOM evaluation can inspect the message/visible rows. It must not be used to read cookies, browser tokens, hidden app stores, extension storage or private network responses. Use normal UI actions for website mutations. Do not inject JavaScript to press hidden controls or fake a delivery event.

## 20. Developer reference and checks

### Main components

| File | Responsibility |
| --- | --- |
| `src/main.tsx` | Dashboard, helper handshake, scan/import events, outreach preparation and delivery/Sheet actions |
| `src/OutreachBoard.tsx` | Queue tabs/filters, per-row actions, editor and versions |
| `server/index.mjs` | Loopback HTTP API, orchestration and tracker/Sheet operations |
| `server/store.mjs` | Private SQLite state |
| `server/discovery-policy.mjs` | Contact-role/current-employment policy and per-company discovery quota |
| `chrome-extension/employment.js` | Shared current-employer evidence matcher |
| `server/founder-discovery.mjs` | Founder acceptance and pitch records |
| `server/recent-jobs.mjs` | Three-day recency/contact-search gate |
| `server/company-limit.mjs` | Reached-company/posting cap and repost handling |
| `server/outreach-message.mjs` | Portfolio/resume constants, polite varied messages, message validation |
| `server/outreach-intents.mjs` | Fifteen-minute contact/profile/message-bound send receipts |
| `server/sheet-writer.mjs` | Token-protected Apps Script call and response verification |
| `sheets/OutreachWriter.gs` | Google Sheet write/readback implementation |
| `chrome-extension/manifest.json` | Installed version, permissions and script matches |
| `chrome-extension/bridge.js` | Same-origin dashboard/extension message bridge |
| `chrome-extension/background.js` | Scan state machine, tab lifecycle and delivery acknowledgement |
| `chrome-extension/jobs.js`, `search.js`, `discovery.js` | Job/people/Google/profile extraction |
| `chrome-extension/linkedin.js`, `invite.js` | Profile/standalone invitation preparation |
| `chrome-extension/send-watch.js` | Observes real Send clicks and new delivery evidence |

### Integration outline

```text
Dashboard Send outreach
  → POST /api/contacts/<id>/prepare
  → validated note + receipt token
  → same-origin prepare-outreach message
  → Chrome background worker
  → correct LinkedIn tab/content script
  → visible note filled
  → human/authorised agent clicks LinkedIn Send
  → send watcher observes new delivery evidence
  → outreach-delivered bridge event with receipt
  → server records delivery and attempts Sheet write
  → dashboard acknowledges delivery
  → helper closes the matching finished tab
```

`POST /api/send` is not a working bulk-send API; the current server rejects it. Do not treat `/prepare` as a send endpoint. Do not forge `/done` or delivery receipt calls as a substitute for actually sending. App mutation APIs require the expected local Origin; do not disable that guard.

### Read-only audit

Use a minimal projection of `/api/state` when reconciling local status. For example, from PowerShell:

```powershell
$outreachState = Invoke-RestMethod -Uri 'http://127.0.0.1:4318/api/state'
$outreachState.contacts |
  Select-Object name, company, profileUrl, status
```

Do not dump private configuration or read `.env` into chat. A status audit helps reconcile saved state; it cannot independently prove an external LinkedIn send.

### Checks after code changes

```powershell
npm test
npm run build
npm run security:scan
```

`npm run test:ui` and `npm run test:extension` are additional browser checks with their documented Playwright dependencies. Extension fixture tests use fake pages and are not proof of delivery to a real recipient. Never send to real people just to run a test unless that outreach itself is authorised.

A nonzero security-scan exit can reflect static findings; inspect its actual report. Do not claim a clean SonarQube server scan from local SonarJS/ESLint checks. The repository has `SECURITY_REVIEW.md` for limitations.

### Updates

- Frontend change: build, then refresh the dashboard when safe.
- Server change: restart only this app's verified Node process; preserve `.env` and `.data`.
- Extension change: reload the helper and refresh affected tabs.
- Never kill all Chrome or Node processes. Never restart during unresolved delivery/Sheet writes.
- Do not commit `.env`, `.data`, tokens, browser profiles, logs, contact exports or screenshots containing private data. Existing `.gitignore` excludes private runtime artifacts.
- Use tab-scoped browser controls while the user is working. Do not take over, restore, resize, close or navigate the whole Chrome window unless the user explicitly asks. If Chrome is minimized and the tab has a zero-size viewport, report that blocker rather than repeatedly clicking Send.
- `node tests/scan-stop-ui.cjs` runs the Stop scan UI regression in a separate headless Chrome with fixture data. It checks queued-search cancellation, an accepted in-flight contact, and stopping a run after a dashboard refresh. It does not use the user's Chrome profile or contact real people.

## 21. Ready-to-paste Open Code instructions

Paste this as a task prompt after connecting the browser. Adjust the batch size/audience if needed.

```text
Read OPEN_CODE_OUTREACH_PLAYBOOK.md in E:\Linkdin Outrreach tool first.

Operate my existing Outreach Desk at http://127.0.0.1:4318/ through the
connected, signed-in Chrome profile. Use the actual browser MCP tools
available in this Open Code session; do not assume Codex cua APIs exist.

I authorise you to send the current eligible outreach drafts to their
specified LinkedIn recipients, including my saved portfolio and exact
resume link. Keep the active discovery scan running. When it finishes,
check for newly added eligible contacts and process those too, then stop
and report the result. This is a bounded queue/current-scan task, not
permission to create perpetual unattended sending.

Before sending, check tracker duplicates, current employer, India job
relevance, role suitability and company/posting limits. A queue count
is not proof that all rows are sendable. Do not force disabled buttons.

For each exact profile URL:
1. Read the current message and recipient row.
2. Click its Send outreach once.
3. Locate the correct LinkedIn tab, not a simultaneous scan tab.
4. Check whether it is already Pending, connected, blocked or eligible.
5. Inspect the real note/message field and ensure the complete portfolio
   and resume URLs remain intact within 290 characters.
6. If eligible, click LinkedIn's final Send once.
7. Record the attempt immediately so it cannot be repeated accidentally.
8. Verify a new LinkedIn success/Pending signal, matching Sent invitation,
   or new matching outgoing message before counting delivery.
9. Let automatic completion run. Use Mark done only after positive live
   verification, on the exact same person's row.
10. Verify Sheet sync. If Sheet update alone fails, use Retry Sheet update
    and never resend the LinkedIn message to fix it.

Keep an append-only run log keyed by profile URL with prepared, attempted,
confirmed, Sheet-verified, skipped or uncertain outcomes. Re-read the
queue for scan arrivals and retain an attempted set. Do not replace old
contacts or lose unresolved send state when moving to the next person.

Do not withdraw invitations to resend. Do not guess private LinkedIn
APIs, fake receipts or mark unsent people done. Stop at CAPTCHA, sign-in,
security checks or platform limits and explain the exact blocker.
Preserve unresolved sends for verification instead of retrying blindly.

Close only finished task outreach/search tabs when no longer needed.
Keep my dashboard, active scan and unrelated work tabs open. Keep keys,
tokens, cookies and private configuration out of output and source control.

Finish with confirmed-send and Sheet-verified counts, a breakdown of
skips, any unconfirmed attempts or pending Sheet writes, and a final
queue/current-scan recheck. Do not call a click a successful send.
```

## 22. Completion report template

```text
Audience and date:
Starting Active count:
New contacts added during this run:
Confirmed new LinkedIn sends:
Sheet-verified sends:
Delivery confirmed, Sheet retry pending:
Existing invitations / already contacted:
Tracker duplicates:
Unsuitable or unverified contacts:
Company/posting-limited contacts:
Unconfirmed send attempts (profile URLs + last observed state):
Final scan result:
Final queue recheck:
Task tabs closed / intentionally left open:
Run log and screenshot paths:
Any action needed from the user:
```

Keep confirmed sends separate from attempts. If a request could not be verified, say so clearly even when the rest of the batch succeeded.
