# Outreach Desk

A local LinkedIn outreach dashboard: scan recent Product/UX design openings, find relevant employees and founders, prepare messages, review invitations, and record confirmed outreach in Google Sheets.

Repository: [singhkartik40/Linkedin-Outreach](https://github.com/singhkartik40/Linkedin-Outreach)

## Workflow

Every manual scan, Refresh people run, and automatic two-hour run searches both audiences:

1. Check Product Designer and UX Designer roles in the selected cities, using past-24-hours and full-time evidence.
2. Exclude internships, contract, part-time, freelance, temporary and unrelated titles. If LinkedIn drops its full-time filter, verify each candidate job's details. Viewed/applied cards can use the active past-day filter; explicitly older visible ages are excluded.
3. Find up to **2 designers and 2 HR/talent contacts per company**, targeting **20 new team contacts**.
4. Also find up to **2 founders/co-founders per company**, with a separate target of up to **20 founders**. Reaching the team target does not stop founder searches.
5. Import founders only when visibly based in an Indian metro and backed by a funding-news report of at least **US$2 million or ₹10 crore within 90 days**. Supported metros include Bengaluru/Bangalore, Mumbai, Delhi/NCR, Gurugram, Noida, Hyderabad, Pune, Chennai and Kolkata. News coverage is not exhaustive.
6. Stream verified contacts into the table during discovery. Reject saved profiles and explicit former-company headlines. Keep job evidence and, for founders, the funding source.
7. Prepare referral messages for employees and distinct design pitches for qualified founders, with the portfolio and résumé links intact.

The Designers & HR and Founders & co-founders tabs filter saved results; either scan button searches both. Targets are maximum goals, not guaranteed counts. If funding lookup fails, team contacts remain saved and unverified founders are excluded with a warning.

## Requirements

- Node.js **24+** with npm; the app uses built-in SQLite.
- Chrome signed in to LinkedIn, with the helper installed in that same profile.
- Internet access for LinkedIn, funding news and Sheets.
- Optional AI provider key for AI extraction/testing. Browser discovery and template-based message drafts do not require an AI request.

The service listens on **127.0.0.1:4318**. The extension expects this origin; changing `PORT` alone does not update the helper.

## First-time setup

```powershell
git clone https://github.com/singhkartik40/Linkedin-Outreach.git
cd Linkedin-Outreach
npm ci
Copy-Item .env.example .env
npm run build
npm start
```

The private repository requires an authorized GitHub account. Open [Outreach Desk](http://127.0.0.1:4318/) in Chrome and leave the server running.

### Chrome helper

1. Open `chrome://extensions` in the Chrome profile signed in to LinkedIn.
2. Enable Developer mode and click **Load unpacked**.
3. Select the repository's `chrome-extension` folder.
4. Confirm **Outreach Desk LinkedIn Helper v0.5.0** is enabled and can access LinkedIn and the local dashboard.
5. Refresh Outreach Desk in the same Chrome profile.

Windows shortcut: **Install Chrome Helper.cmd** opens the extension page and folder; it does not install automatically. The Codex in-app browser does not run this extension.

After updating extension files, click **Reload** on the helper card, then refresh Outreach Desk. Old dashboard tabs lose their extension connection when the helper reloads.

## Daily use

1. In **Outreach**, choose locations and click **Find 20 new people**. All India searches nationally and across supported metros; custom cities are available.
2. Keep the dashboard and scan tab open. Watch stage/progress and incoming rows. Founder funding verification can take longer.
3. Review either audience tab. Open job/profile sources and verify the message, connection state and tracker status.
4. Use search, company/status filters, sorting and CSV export. **Details & edit** saves message history; copy actions provide the message, profile link or full contact details.
5. Click **Send outreach**. The helper opens the profile, checks its relationship controls, opens the invitation or supported composer, and fills the full message where an editor is available. Notes are capped at **290 characters**; LinkedIn may enforce a lower account-specific limit.
6. Review LinkedIn's dialog and click its final **Send** yourself. Opening or filling a dialog does not count as delivery.
7. A reliable visible success signal marks the contact done automatically. Otherwise, verify delivery and use **Mark done**. Completed contacts leave the active queue.
8. With the Sheet writer configured, completion updates and verifies Master. A failed write leaves delivery confirmed locally; **Retry Sheet update** retries only the write.

**Refresh people** replaces both audiences' draft queue once, when the first batch arrives. Completed, skipped and deleted records are preserved. Contact/message-version deletion is recoverable from its deleted view.

This deployment is personalized for Kartik. Change portfolio/résumé links and message wording in `server/outreach-message.mjs` before using it for someone else. Workspace branding is in `src/main.tsx`. Shortening prose keeps URLs intact.

## Automatic scans and running without Codex

Discovery runs every **two hours**, including designers, HR/talent and founders. Use **Pause auto-scan** / **Enable auto-scan** on Outreach. A shared lease prevents overlapping dashboard runs; manual scans reset the next interval. Missed intervals are not replayed in a burst.

Discovery requires the computer awake, the local server running, Chrome signed in to LinkedIn, the helper enabled and Outreach Desk open in a Chrome tab. **Codex can be closed.** Discovery stops when Chrome/dashboard closes or the computer shuts down. Running the server alone does not run a browser scan.

### Windows shortcuts/startup

Double-click **Start Outreach Desk.cmd** to start the server hidden and open the app. To start the service at Windows sign-in, run from the repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-outreach-startup.ps1
```

This creates a Windows scheduled task named **Outreach Desk**. Open the Chrome dashboard afterward. Disable/remove that task in Windows Task Scheduler to stop startup behavior.

For a server running in a terminal, Ctrl+C stops it; `npm start` restarts it. A launcher-started server runs hidden: identify its Node process by the `server/index.mjs` command line in Task Manager before stopping it. Avoid stopping unrelated Node processes.

## AI provider setup

In **Settings**, choose a provider, paste its key, save, and optionally use **Test saved connection**. Named providers choose a default model; no model ID is required.

| Provider | Persistent environment variable |
| --- | --- |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Gemini | `GEMINI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| NVIDIA NIM | `NVIDIA_API_KEY` |
| Chutes AI | `CHUTES_API_KEY` |
| OpenAI-compatible/local server | `COMPATIBLE_API_KEY` |

An unlisted compatible service needs its API base URL and exact model ID; an arbitrary key does not identify a service. Custom endpoints require HTTPS except localhost model servers, which may omit a key. Native-provider endpoints are fixed.

Settings keys stay in server memory and clear on restart. For persistence, edit local `.env` from `.env.example`, then restart. Keys are not returned by the state API or saved in browser storage/SQLite. `.env` is plaintext and must remain private.

Provider tests and AI extraction send requests to the selected provider and may consume credits/quota. The repository includes no keys. Free quotas and model availability are provider-controlled.

## Google Sheets

The default tracker is configured in `server/index.mjs`:

`https://docs.google.com/spreadsheets/d/1M61OSpGnYkTYEbZbsaABS4j7QsxaHRV9L24PXniwIIY/edit`

### Reads and duplicate checks

Keep the sheet shared as **Anyone with the link · Viewer**, then choose **Tracker → Refresh tracker**. Public CSV reads require no OAuth. Master history and required headers are checked; normalized names/profile URLs prevent duplicate outreach. The table shows the cached refresh time. Public readability does not grant write access.

Enable **Automation → Refresh the tracker automatically** for five-hour reads while the server runs. This is separate from two-hour people discovery.

### Writes after confirmed delivery

1. In the spreadsheet, open **Extensions → Apps Script**.
2. Paste [`sheets/OutreachWriter.gs`](sheets/OutreachWriter.gs) into the bound project.
3. Generate a long random token locally, for example:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

4. Set Script property **OUTREACH_WRITE_TOKEN** to that token.
5. Deploy a **Web app**, execute as yourself, with **Anyone** access. The public endpoint relies on the secret token; keep it private.
6. Save the deployment's `/exec` URL and token in **Outreach Desk → Tracker**. This session configuration clears on restart.
7. For persistence, set `SHEET_WRITE_WEB_APP_URL` and `SHEET_WRITE_TOKEN` in `.env`, then restart.

The writer matches LinkedIn profiles, changes only Status/Sent on (IST) on an existing row, or appends a missing contact. It reads back identity/status before reporting success. Ambiguous identities stop the write. Tokens and upstream request bodies are excluded from UI errors.

## Updating from GitHub

For an authenticated cloned checkout:

```powershell
git pull --ff-only
npm ci
npm run build
```

Restart the server after backend/environment changes. Reload the helper after extension changes, then refresh the dashboard. The dashboard checks the expected helper version before scanning.

## Development and tests

```powershell
npm ci
npm test
npm run build
npm start
```

For frontend development, run `npm start` and `npm run dev` separately. Vite serves `http://127.0.0.1:5173`; use the built dashboard on **4318** for extension discovery.

Browser tests need Playwright installed locally or supplied via `PLAYWRIGHT_PACKAGE`:

```powershell
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:ui
npm run test:extension
```

`test:ui` uses installed Chrome and a simulated helper. `test:extension` loads the real helper in isolated Chromium with mocked LinkedIn/funding pages. Set `CHROME_EXECUTABLE` to Playwright Chromium if necessary; ordinary Chrome can disallow command-line extension loading. Screenshots stay in `test-results/`. Test databases are temporary; tests do not send invitations through your real LinkedIn account.

Coverage includes recency, role exclusions, audience quotas, founders in every run, funding qualification, live imports/deduplication, receipts, tracker readback, credential redaction and local API protections.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Dashboard unavailable | Start the service; inspect `server.log`/`server-error.log`; confirm port 4318 and a production build. |
| Helper disconnected/context invalidated | Reload the helper, then refresh the dashboard in the same Chrome profile. |
| Scan tab opens but stalls | Check sign-in, visible page, helper site access/version; keep the scan tab open. |
| No jobs | Check cities and past-day/full-time evidence. Diagnostics distinguish unreadable cards from rejected ones. |
| No founders | Candidates need metro location, recent qualifying funding and an unsaved profile. News coverage is not exhaustive. |
| Funding warning | Team results stay saved; unverified founders are excluded. Retry later. |
| No invitation note editor | Account restrictions, pending invitations or UI variants can prevent it. Use the copied message/manual flow. The helper cannot create an editor LinkedIn does not offer. |
| Tracker blocks outreach | Refresh the tracker and resolve duplicate/history checks. |
| Sheet update pending | Check writer URL/token/deployment, then retry the Sheet write without resending. |
| Changes invisible | Rebuild, restart backend for server changes, reload helper for extension changes, and refresh the dashboard. |

## Security and local data

The service binds to loopback with Host/Origin checks and a content-security policy. Do not expose it publicly without authentication and a deployment security review. LinkedIn may restrict automated account activity; the helper does not bypass login, account limits or CAPTCHAs and cannot guarantee account immunity.

```powershell
npm run security:scan
```

This runs local SonarJS/ESLint security rules, a limited credential-pattern check and npm audit. Reports stay in `security-reports/`. Static findings are review items, not confirmed vulnerability counts; the command returns nonzero while lint findings remain. It does not upload code to SonarQube. See [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md).

Git excludes `.env`, `.data/` databases, dependencies, builds, logs, screenshots, security reports, private keys and the original personal PRD. Back up `.data/` and `.env` privately: cloning GitHub does not restore local history or credentials. Publishing source does not host the local server, browser session or scheduled scans.

## Layout

```text
src/                 React dashboard and outreach table
server/              API, SQLite, providers, rules, funding and tracker
chrome-extension/    Manifest V3 jobs/people scanning and invitation helper
sheets/              Google Apps Script writer
scripts/             Windows launchers and security checks
tests/               Unit/API/browser tests and isolated fixtures
public/              Static assets
```
