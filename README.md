# Outreach Desk

Find people to contact about Product Designer and UX Designer jobs, write a message, and keep track of who you have contacted.

The app runs on your computer. Your code is saved in this [private GitHub repository](https://github.com/singhkartik40/Linkedin-Outreach).

## What happens when I click Find 20 new people?

The app:

1. Looks for recent full-time design jobs in your chosen locations.
2. Finds designers and HR/recruiters at those companies, then searches Google for startups and checks their founder profiles on LinkedIn.
3. Adds people to your list as the search runs.
4. Writes a message with your portfolio and résumé links.
5. Checks your tracker to help avoid contacting the same person twice.

Each company can add up to **2 designers, 2 HR/recruiters, and 2 founders**. Each run aims for up to **20 designers/HR contacts plus 20 founders**. Some searches will find fewer people.

**Founders do not need funding news or a metro-city location.** Founders can be discovered without a job opening. Their LinkedIn profile must show a current founder role at the startup and a location in India. Founder messages are a pitch; employee messages ask about a referral.

The two tabs, **Designers & HR** and **Founders & co-founders**, show different parts of the same search. A full scan searches both groups. Clicking Find 20 new people while viewing the Founders tab runs the Google founder search directly.

## Open the app on this computer

1. Double-click **Start Outreach Desk.cmd** in the project folder.
2. Open [Outreach Desk](http://127.0.0.1:4318/) in Chrome.
3. Make sure you are signed in to LinkedIn in the same Chrome profile.

You can close Codex. The app does not need this chat to stay open.

## Set it up on a new computer

You need **Node.js 24 or newer** and **Google Chrome**.

1. Download the project from GitHub and unzip it, or use the optional Git command below.
2. Open a terminal in the project folder. On Windows, you can right-click inside the folder and choose **Open in Terminal**.
3. Run these commands, one at a time:

```powershell
npm ci
npm run build
npm start
```

4. Open [Outreach Desk](http://127.0.0.1:4318/) in Chrome.
5. Install the helper using the steps below.

Keep the terminal running while using the app. Later, you can use **Start Outreach Desk.cmd** instead.

<details>
<summary>Optional: download using Git</summary>

Sign in with a GitHub account that can access the private repository, then run:

```powershell
git clone https://github.com/singhkartik40/Linkedin-Outreach.git
cd Linkedin-Outreach
```

GitHub stores the project files. It does not run the app or your LinkedIn searches for you.

</details>

## Install or reload the Chrome helper

The helper lets the app open LinkedIn, find people, and fill in a message.

1. In Chrome, enter `chrome://extensions` in the address bar.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the project's **chrome-extension** folder.
5. Check that **Outreach Desk LinkedIn Helper v0.6.1** is enabled.
6. Refresh the Outreach Desk page.

**Already installed?** Click the helper's **Reload** button, then refresh Outreach Desk. You do not need to remove and install it again.

**Install Chrome Helper.cmd** opens the extension page and folder for you. Use the Chrome profile where LinkedIn is signed in. This helper does not work inside Codex's built-in browser.

## Find people and send outreach

1. Open **Outreach** and choose the cities you want, or **All India**.
2. Click **Find 20 new people**. Leave the LinkedIn search tab and dashboard open.
3. Watch the progress bar. People appear in the table while the search continues.
4. Read the message and check the person's profile. Use **Copy message** or **Details & edit** if needed.
5. Click **Send outreach**. The helper opens LinkedIn and tries to open the connection/message box and fill the message.
6. Review it and click **Send on LinkedIn yourself**.
7. When LinkedIn confirms the send, the app marks the person done. If it cannot see that confirmation, check LinkedIn yourself and use **Mark done**.

Messages are at most 290 characters and keep both links. LinkedIn may allow fewer characters or restrict notes for some accounts.

In **Job research**, each row has **Open on LinkedIn** to open the original job in a new tab. Click the job title to see the app's saved details instead.

**Refresh people** replaces unfinished drafts with a fresh search across both groups. Completed, skipped and deleted records are kept. Deleted contacts can be restored. You can also search the table, filter by company, copy details, and download a CSV file.

## Let it search every two hours

Automatic scans look for designers, HR/recruiters, and founders. Use **Pause auto-scan** or **Enable auto-scan** to control them.

For this to work, keep:

- Your computer on and awake.
- The app's local service running.
- Chrome open, signed in to LinkedIn, with the helper enabled.
- Outreach Desk open in a Chrome tab.

Codex can be closed. Searches stop if the computer shuts down or the dashboard/Chrome closes. A missed search does not trigger a burst of catch-up searches.

<details>
<summary>Optional: start the app's service when Windows starts</summary>

Run this once from a terminal in the project folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-outreach-startup.ps1
```

It creates and starts a Windows task named **Outreach Desk** under your own Windows account. The app starts quietly after sign-in, also works on battery, and restarts if its server exits. Bookmark http://127.0.0.1:4318/ in Chrome and open it whenever you need it. No daily batch file or Codex window is needed. To turn automatic startup off, disable the task in Windows Task Scheduler. Keep this project folder in its current location.

</details>

## Add an AI key — optional

Open **Settings**, choose your provider, paste its key, and click **Save provider**. Then use **Test saved connection** to check it.

Supported providers include NVIDIA, Gemini, OpenAI, Anthropic, Groq, OpenRouter, and Chutes. For these providers, the app chooses the model for you.

For a different OpenAI-compatible service, enter its website's API address and model name as well. A key from one provider will not work with every other provider.

You can search LinkedIn and create standard message drafts without an AI key. AI extraction and connection tests may use the provider's credits.

Keys entered in Settings are forgotten when the app's service restarts. To keep a key between restarts, copy `.env.example` to a file named `.env`, fill in your provider's key, and restart the service. Keep that file private; it is not uploaded to GitHub. The example file lists the supported key names.

## Connect the Google Sheet

The app uses [Kartik's outreach tracker](https://docs.google.com/spreadsheets/d/1M61OSpGnYkTYEbZbsaABS4j7QsxaHRV9L24PXniwIIY/edit).

To read it, keep the sheet shared as **Anyone with the link → Viewer**, then click **Tracker → Refresh tracker**. This checks previous contacts before outreach. No Google login setup is needed for these public reads.

A public sheet can be read, but that does **not** let the app change it. To update the sheet after Mark done, complete the one-time setup below.

<details>
<summary>One-time setup: let Mark done update the Sheet</summary>

1. In the Sheet, choose **Extensions → Apps Script**.
2. Paste the contents of [`sheets/OutreachWriter.gs`](sheets/OutreachWriter.gs) into the script.
3. Create a long random secret token. You can generate one locally with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

4. In Apps Script settings, add a Script property named **OUTREACH_WRITE_TOKEN** with that value.
5. Deploy it as a **Web app**, running as yourself, with access set to **Anyone**. Keep the token secret: it protects this public web address.
6. In the app's **Tracker** page, save the deployment's `/exec` address and the same token.

To keep these settings after restarting the service, add `SHEET_WRITE_WEB_APP_URL` and `SHEET_WRITE_TOKEN` to your private `.env` file.

The writer updates the matching contact's status/date, or adds a new row if needed, then checks the result. If it fails, the app keeps delivery recorded locally. Use **Retry Sheet update**; do not resend the LinkedIn message.

</details>

Tracker refreshes can run every five hours if enabled under **Automation**. This is separate from the two-hour people search.

## Update the app

After getting the latest files from GitHub:

1. Run `npm ci`, then `npm run build`.
2. Restart the app's service.
3. Reload the Chrome helper.
4. Refresh the dashboard.

If you used Git to download the project, `git pull --ff-only` gets the latest files first. If you downloaded a ZIP, keep your private `.env` and `.data` folder when replacing project files.

If the service is running in a terminal, press Ctrl+C to stop it, then run `npm start`. A service started by the Windows launcher runs in the background; identify the Node process with `server/index.mjs` in Task Manager before stopping it. Avoid stopping other Node apps.

## Common problems

| Problem | What to do |
| --- | --- |
| The app will not open | Start it with **Start Outreach Desk.cmd**. Check that no other app is using port 4318. |
| Helper disconnected or needs reloading | Reload it at `chrome://extensions`, then refresh Outreach Desk. |
| LinkedIn opens but the search stops | Check sign-in, helper access to LinkedIn, and whether the search tab is waiting for something. Leave it open. |
| Fewer than 20 people | The app skips people already saved and needs matching jobs/company information. Try another location or scan later. |
| No note box | LinkedIn may restrict notes or already have an invitation pending. Use the copied message/manual steps. |
| Send outreach is disabled | Refresh the tracker and check whether the person is already listed or completed. |
| Sheet update pending | Check the Sheet writer setup and click **Retry Sheet update**. |
| A change does not appear | Rebuild, restart the service, reload the helper, and refresh the dashboard. |

## What stays private?

Your API keys, saved contact history, logs and screenshots stay out of GitHub. Back up `.env` and `.data` privately: downloading the project again does not restore those files.

This is a personal app for your own computer, not a public website. LinkedIn can limit automated activity; the helper cannot bypass its account limits or login checks.

The portfolio/résumé links and message wording are in `server/outreach-message.mjs`. Change them before using the app for someone else.

<details>
<summary>For developers: tests and security checks</summary>

```powershell
npm test
npm run build
npm run security:scan
```

Browser tests use Playwright. Install it locally, or supply its location through `PLAYWRIGHT_PACKAGE`. `test:ui` uses Chrome; `test:extension` uses an isolated Chromium profile with fake LinkedIn pages and does not contact real people.

```powershell
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:ui
npm run test:extension
```

If needed, set `CHROME_EXECUTABLE` to the Playwright Chromium executable. For frontend work, run `npm start` and `npm run dev` separately. The development page uses port 5173, but extension scans need the built dashboard on port 4318.

Security reports go into `security-reports/`. Static warnings are documented in [SECURITY_REVIEW.md](SECURITY_REVIEW.md); a nonzero security-scan exit is not the same as a confirmed vulnerability. This is local analysis, not a SonarQube upload.

</details>

## Job board and finding people for one job

The refreshed interface uses a compact sidebar, quieter status displays, simpler filters and clearer row actions on desktop and mobile.

Open **Job research** to see saved LinkedIn jobs alongside jobs from **Jobicy** and **Remotive**. Filter by source, location, age or company name. Use **Open on…** to visit the original listing.

The service checks public job feeds when it starts and every six hours while running. **Refresh jobs** uses cached results if checked recently. Jobicy delays public listings by three hours; Remotive by 24 hours. Each source shows its status, including network problems. These feeds cover remote jobs; they do not cover every India job board. Original sources remain credited and linked.

Feed references: [Jobicy API](https://jobicy.com/jobs-rss-feed) · [Remotive API](https://github.com/remotive-com/remote-jobs-api).

Click **Find 4 people for this job** to search only that company: up to **2 designers and 2 HR/talent contacts**. Contacts arrive in **Outreach** as they are found. Existing people are skipped, so a run can return fewer than four. This action uses jobs from the past 24 hours. Older saved jobs remain available for review.

## How the Google founder search works

1. Google searches for startup company pages.
2. It searches for those companies’ founders on LinkedIn.
3. The helper opens each profile and checks the visible name, current founder role, company and Indian location.
4. Verified contacts appear in **Founders & co-founders** with a design pitch, portfolio and résumé links. No job or funding claim is invented.

Reload helper **v0.6.1** in Chrome and allow its access to **Google Search** as well as LinkedIn. If Google asks for verification or LinkedIn asks you to sign in, complete that yourself and retry. Empty or blocked results are reported; the app cannot guarantee 20 matches.


### What changed in v0.6.1

- In Job research, choose **Ready for outreach** to see roles that meet the 24-hour contact-search rule. Older jobs stay available to read, but their contact-search button explains why it is unavailable.
- **Refresh job feeds** checks Jobicy and Remotive (with their existing cache). **Scan recent LinkedIn jobs** starts a fresh Chrome scan and finds contacts too.
- A person must have an explicit current role at the hiring company. A past-company mention or search keyword alone does not qualify. Older drafts without current-company evidence show a warning and cannot be sent; a new scan can recheck them.
- Draft messages use varied, polite wording for designers, recruiters and founders. Both links remain intact within 290 characters. Existing unsent drafts are updated once, with their previous wording kept in message history. Completed and skipped contacts stay unchanged.

Reload the Chrome helper to **v0.6.1**, then refresh the dashboard.


### India jobs and company outreach limits (v0.6.2)

Job research now shows India-based roles only. Feed entries labelled only Worldwide or Remote are left out until India eligibility is explicit.

The tracker is refreshed on startup, before scans and outreach preparation when its copy is more than five minutes old, and in the background every five minutes. If a required refresh fails, a new scan/send preparation stops with an explanation.

Five distinct people marked Sent, Invitation pending or otherwise confirmed reached for a company and posting is the limit. Confirmed local sends count too, including Sheet writes still pending. Extra drafts move out of Active into **Company limit**; they are not deleted. Separate known job links are separate postings. Historical rows without a job link count conservatively against the company. An explicit repost with a timestamp newer than the old sends allows a new round; refreshing the page alone never resets the count. Historical sends without dates remain counted. The same individual is still protected from duplicate outreach across postings.

The Chrome helper remains v0.6.1 for this update; refresh the dashboard only.
