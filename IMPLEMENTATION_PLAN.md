# LinkedIn outreach app implementation plan

Historical planning document. For current v0.5.0 behavior and setup, see README.md. Every current scan includes designers, HR/talent and qualified founders; messages use the full note rather than a separate short note.

Prepared 23 October 2026 from Kartik_LinkedIn_Outreach_App_PRD.docx.

## Recommendation

Build a private local outreach assistant in stages. The first usable release should import job evidence, apply eligibility rules, check the complete existing tracker, prepare verified contacts, generate valid notes, and support manual outreach with reliable tracker reconciliation. Integrated sending is a separate capability gated by an available supported interaction path.

The current local application implements an outreach-first dashboard, SQLite research storage, configurable AI providers, evidence-based job screening, a role-linked people queue, personalized drafts, full-Master duplicate checks, public Sheet loading, and optional five-hour tracker refresh. The Chrome helper can open a visible LinkedIn connection dialog, fill a short note, and copy the full message; the user makes the final Send click. Mark done records user-attested delivery and removes the person from the active queue. A token-protected Apps Script writer can update or append the matching Master row and read it back once deployed and configured. Until then, Sheet updates remain pending locally. Automatic LinkedIn sending and several PRD evidence checks remain unimplemented.

Each Find new people run now checks LinkedIn Product Designer and UX Designer search cards with visible ages under 24 hours, then scans people at those companies with stage and count progress. Every imported person must carry an exact job URL from that run; an older stored job can no longer be used as a fallback. Newly found cards are saved as To verify; a search card's relative age does not establish an exact posting timestamp or full eligibility.

## Proposed implementation choices

- Use React with TypeScript for the dashboard, a Node.js ES-module backend, and SQLite. The initial store contains research, settings, and audit events; draft versions and pending sync operations will be added with their workflows.
- Keep Google Sheets authoritative for outreach identity, historical notes, and confirmed tracking status. SQLite holds cached Sheet data and local workflow state, with conflicts exposed for review.
- Support OpenAI, Anthropic, Gemini, Groq, OpenRouter, NVIDIA NIM, Chutes AI, and custom OpenAI-compatible endpoints through backend adapters. The user chooses the provider and key; a default model is selected for supported providers. Other protocols need dedicated adapters; arbitrary keys are not interchangeable.
- Bind the server to localhost. Keep API keys out of client code, logs, and version control. Restrict local mutation endpoints to the app's origin. The current public Sheet reader needs no OAuth configuration.
- Begin with pasted job/post text plus its source URL. A URL alone is not evidence that its contents or posting date have been read. Add permitted career-page integrations after the core flow works.
- Make founder research optional. Require explicit hiring evidence; define the funding-recency rule before implementing that track.

## Build sequence and completion criteria

### 1. Local foundation and tracker inspection

Build the app shell, configuration checks, SQLite migrations, and read-only tracker connection. The current reader loads public CSV views of Master, By date, Jobs to research, and Instructions without OAuth. Inspect A:R headers, formulas, validation, and current statuses before implementing writes. Identify records by stable serial number and normalized identity, never by assuming serial number equals row number.

Deliverable: a local dashboard showing connection health, actual tracker counts, sync time, and configuration problems. No production Sheet writes in this milestone.

Completion check: the entire populated Master is loaded, schema mismatches are explained, and missing credentials do not crash the app.

### 2. Job import and evidence-based eligibility

Accept pasted text, source URL, and posting-date evidence. Extract structured fields with Gemini, retaining the original text and evidence snippets. Store all researched jobs, including exclusions and unresolved records. Deduplicate by source listing ID or canonical URL.

Implement named rules for the three-day posting window, India locations, experience, role exclusions, disclosed pay below INR 12 LPA, and Saturday work. Unknown facts remain unresolved. Do not substitute discovery time or search-result age for the actual posting date. Propose a rolling 72-hour window as the initial date interpretation, and label date-only evidence conservatively until this is settled.

Deliverable: Jobs screen with eligible, excluded, and unresolved filters, and a clear reason for each result.

Completion check: stale jobs, inflexible minimum 5+ experience, UI-only roles, and low disclosed pay fail correctly; missing date or workweek is never presented as verified.

### 3. Contact verification and full-tracker deduplication

Add contact entry/import, profile URLs, company/title, source evidence, job association, relationship type, and employment-history notes. Normalize names conservatively and canonicalize LinkedIn profile slugs. Match against all Master rows regardless of status and against the current local batch. A match on either normalized name or slug blocks automatic classification as new; ambiguous name matches need review.

Implement the excluded-employer list and aliases from the PRD, checking past as well as current employment. Enforce at most two contacts per company per batch. Record conversations/invitations checks with timestamp and evidence; if unavailable, show To verify. Absence from the Sheet alone does not establish that someone is new.

Deliverable: contact review queue with Ready, To verify, Duplicate, Excluded, and Skipped states and separate evidence completeness indicators.

Completion check: duplicates in old tracker rows and within a new run are blocked; unknown employment history or connection status cannot silently become Ready.

### 4. Message drafting and reliable Sheet writes

Generate referral notes for non-founders and consideration notes for founders. Require the exact phrase “I believe I’d be a strong fit.”, the current resume URL, and the portfolio URL. Validate fewer than 290 characters (maximum 289), both links, and the required phrase after every edit. Preserve previous message versions. Do not truncate URLs to make notes fit. Check the actual channel's live limit separately before sending.

Add copy note, open profile, skip, and verification actions. Implement narrow Sheet appends and updates that preserve historical text, IDs, formulas, and validation. Re-read identities before writing, serialize app writes, and read back the changed record afterward. Treat simultaneous manual Sheet edits as a possible conflict.

Deliverable: end-to-end preparation of a small outreach batch with valid notes and verified tracker updates.

Completion check: repeated save/retry actions do not create duplicate rows, and existing formulas and notes survive an update.

### 5. Manual send evidence and daily operation

Keep manual mode usable without browser control. Copying a note or opening a profile never marks a contact Sent. Capture a user-provided record of visible delivery success and identify it as user-attested evidence, distinct from adapter-observed evidence. If evidence is missing, retain an unconfirmed state.

Separate delivery state from Sheet sync state. If delivery succeeds but Sheet write/readback fails, retain Delivery confirmed / Sync pending locally, count it against outreach limits, and retry only the tracker update. Never retry delivery automatically. Publish final tracker-confirmed Sent or Invitation pending only after evidence and successful readback.

Add dashboard totals for researched jobs, verified jobs, eligible/new contacts, sent outcomes, India-day totals, campaign totals, pending checks, shortfalls, and blockers. Use Asia/Kolkata day boundaries. Treat 20 contacts as a target dependent on evidence, never a quota to fill with unverified records. Apply the PRD's 50/session and 50/India-day invitation caps as internal ceilings, subject to lower live restrictions.

Deliverable: a usable manual MVP with audit history, restart recovery, and visible sync failures.

Completion check: a simulated delivery-success/Sheet-failure scenario cannot cause a second send, and crossing midnight in India resets only the appropriate daily counter.

### 6. Optional supported sending integration

Investigate available account/API/browser capabilities before selecting an adapter. Visible interaction alone does not demonstrate that a path is supported. Keep this milestone out of the core MVP dependency chain.

The user requested automatic sending when a supported integration permits it. This updates the PRD's original per-contact-click requirement. Before enabling an automatic campaign, define its approved recipients, final notes, action types, and limits; recheck live profile and connection state before dispatch and record reliable success evidence. Stop on CAPTCHA, warnings, restriction, unexpected login, missing Connect, uncertain delivery, or failed confirmation. Prevent parallel dispatch and retries from duplicating actions. The current build only saves the preference and rejects send requests because no adapter is available.

Deliverable: controlled per-contact sending only after capability validation; otherwise retain the fully usable manual workflow.

## Screens and core records

Screens: Setup, Dashboard, Jobs, Contact review, Message preview, and Activity/sync history.

Core records: jobs, evidence, contacts, campaigns, campaign contacts, draft versions, verification checks, tracker mappings, send attempts, sync operations, and append-only audit events. Keep eligibility, delivery, and synchronization states separate.

## Validation plan

Use focused unit tests for rule boundaries, employer aliases, name/slug normalization, message validation, company caps, and India-day counters. Use integration fixtures for full-tracker reads, moved rows, preserved formulas, stale data, duplicate writes, and retry reconciliation. Exercise the complete paste-job to reviewed-contact to manual-evidence to Sheet-readback flow using a test spreadsheet before production writes. Test missing credentials, invalid AI output, unavailable services, and app restart with pending sync operations.

## Decisions to settle during implementation

1. Existing spreadsheet ID and actual tab/header/status mapping; inspect Instructions before finalizing behavior.
2. Whether future Sheet writes should use Google OAuth; the current fixed tracker is public and read-only. Configure any AI provider key locally; do not place secrets in planning files or chat.
3. Three-day recency semantics: rolling 72 hours versus three India calendar dates.
4. Founder-track evidence requirements and funding-recency window.
5. Whether user-attested success evidence meets the desired manual workflow acceptance standard; otherwise manual records stay unconfirmed until separately verified.
6. What evidence is sufficient to resolve unknown pay, workweek, employment history, and conversation/invitation state.

## Suggested first development increment

The manual outreach path is implemented through visible LinkedIn preparation, a user-attested Mark done action, and Sheet readback after a manual update. The tracker is already fixed and publicly readable. Next, validate the extension against a real connection dialog, verify one real role and contact end to end, and inspect formulas and validation before any Sheet-write implementation. Test data remains isolated from the user's local research database.

## Integration references checked

- Google Sheets OAuth scopes apply at spreadsheet-file level, not individual-tab level. Enforce tab and cell restrictions in application code: https://developers.google.com/workspace/sheets/api/scopes?hl=en
- LinkedIn documents communication APIs and a separate access process. Verify actual access before designing sending around an API: https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/overview and https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access
