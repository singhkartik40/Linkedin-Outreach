# Local security review — 28 October 2026

## 29 October 2026 — v0.6.0

Google founder discovery, a cached public job board and per-job contact searches are implemented. Public feed requests use fixed HTTPS endpoints, a timeout and a response size check; HTML is rendered as plain text. No new secret is required. Founder imports require a LinkedIn profile, visible current founder/company evidence and an Indian location. Candidate URLs are normalized to the permitted LinkedIn host. Google verification prompts are reported for the user to complete, never bypassed. Sending and delivery confirmation gates are unchanged.

Validation: 60 unit/API tests, production build, desktop/mobile Chrome UI smoke and unpacked-extension fixture smoke passed. Live Jobicy and Remotive endpoints returned HTTP 200. Live Google displayed a verification page in the isolated browser, so signed-in live founder discovery remains dependent on the user's Chrome session. The full security scan found no source credential patterns and no dependency advisories; static analysis still reports 105 errors and 74 warnings (largely complexity, regex and code-pattern review items), so the full lint check is not clean. Focused checks on the new discovery/feed modules have no errors. Reports are local under `security-reports/` and are excluded from Git.


Reviewed the Node API, React dashboard, Chrome extension, Google Sheet writer and dependencies. Local fixes are applied and the app server has been restarted. The Apps Script source is fixed locally, but there is no configured live Sheet writer to redeploy.

Version 0.5.1 removes funding-report and metro-only requirements from founder discovery. Founder pitches do not claim funding. The static-analysis counts below are from the v0.5.0 scan; functional tests have been updated for founders outside metros without funding evidence and direct job links.

## Results

| Check | Result |
| --- | --- |
| SonarJS 4.2.2 + ESLint 10.13.0 + eslint-plugin-security 3.0.1 | Completed on 46 files: 95 errors and 64 warnings remain. These are rule severities, not 159 confirmed vulnerabilities. |
| npm audit, including development dependencies | 0 known vulnerabilities at scan time. |
| Limited source-secret pattern check | 0 matches across 64 source/configuration files. Private `.env`, runtime data, dependencies, logs and build output are excluded. |
| Unit/API regression suite | 57 tests passed. |
| Production build | Passed. |
| Chrome dashboard smoke test | Passed on an isolated test server with fixtures. No real invitations or Sheet writes were performed. |
| Extension integration smoke | Passed in Chromium with the actual unpacked helper: two cities × two job roles, 20 team contacts plus 10 founders outside metros without funding reports, full note, and completion following a fixture success signal. |

The dependency/static analysis completed on 28 October at 21:22 IST. The local scanner is not a SonarQube Server/Cloud analysis or quality-gate certification. SonarJS exposes only part of Sonar's analysis capabilities; see the [official SonarJS documentation](https://github.com/SonarSource/eslint-plugin-sonarjs/blob/master/README.md).

The new automatic-completion route requires a random, one-use, 15-minute receipt bound to the contact, profile, and exact prepared message. The extension reports a send only after the final user click and a new LinkedIn success signal. Opening the dialog leaves the contact active. Existing localhost Host/Origin restrictions remain enforced; no Chrome extension origins were added to the API allowlist. Receipt replay, expiry, and changed-message cases are tested.

LinkedIn account restrictions are a separate risk from application security. LinkedIn prohibits extensions that automate site activity, including this type of scanning. Manual final sending and input validation do not guarantee account safety. See [LinkedIn's automated activity policy](https://www.linkedin.com/help/linkedin/answer/a1340567/automated-activity-on-linkedin?lang=en). Pause automatic scans if you do not accept that account risk.

## Confirmed issues and fixes

| Finding | Impact and conditions | Fix and evidence |
| --- | --- | --- |
| Unhandled malformed request URL | A client able to reach the loopback service could crash the Node process using an invalid absolute request target. Local availability issue. | URL parsing is caught before routing; invalid URLs return 400. Regression reproduced a connection reset before the patch and now verifies the next state request succeeds. |
| Formula injection in the generated `Normalised name` column | With a configured writer and an imported formula-like name, marking a contact done could write a spreadsheet formula. The original Person cell was escaped but the transformed name was not. | Escape every string cell immediately before writing, after transformations. Regression reproduced `=1+1` in the normalized cell and now requires literal text in every affected column. No live Sheet was modified. |
| Sheet-writer error discloses upstream text | An upstream writer returning an error that echoes its token could expose the token in a dashboard error. | Return a fixed local error; never forward upstream error contents. Regression failed before the patch and passes afterward. |
| Malformed AI response can disclose response contents | JSON parsing errors from an HTTP 200 provider response could contain a snippet of that response, including an echoed credential. | Catch JSON parse failures and return a fixed error. Regression verifies echoed test credentials do not escape. Also replaced the fenced-JSON regex with string operations. |

## Remaining findings and triage

Raw, unsuppressed findings are in `security-reports/sonarjs.json`. `npm run security:scan` intentionally exits nonzero while static errors remain; it must not be represented as a clean security gate.

- Complexity and nested conditionals: the API router, React App, LinkedIn preparation flow and Apps Script handler should be split into smaller units. These findings are maintainability concerns, not evidence of an exploit by themselves.
- Dynamic object access: most findings are fixed schema keys or numeric array indexes, not attacker-controlled property writes. They remain visible for review when the surrounding code changes.
- File access: the HTTP static-file handler checks the resolved path stays under `dist`; store and test paths come from local configuration or generated temporary directories. The scanner itself reads workspace files and writes reports under a fixed workspace directory. Regression coverage should be retained if these boundaries change.
- Dynamic execution/imports in tests: fixtures use `node:vm` to execute local extension/Apps Script source and load Playwright from the configured local package path. These are test-harness findings; do not use these helpers with untrusted files.
- Regex findings include role classifiers, LinkedIn URL validation, funding amount extraction, and test source-extraction patterns. They remain review hotspots, not demonstrated ReDoS exploits in this review. Prefer bounded inputs and URL/string parsing in future changes.
- `Math.random()` is used for a scan correlation identifier, not an authentication token. It is not a permission boundary; do not reuse it for credentials.
- The clear-text-protocol finding is the deliberately malformed HTTP request target in the loopback API crash regression. Production provider configuration requires HTTPS except explicitly local model servers.

Security controls checked include loopback-only listening, Host/Origin validation, CSP and frame restrictions, parameterized SQLite operations, provider endpoint validation, credential redaction, extension sender checks, and a final user-controlled LinkedIn Send action. The helper's self-repairing script injection is limited to its declared LinkedIn/localhost hosts and fixed packaged files. This is a scoped local review, not an exhaustive penetration test.

## Follow-up actions

1. Rotate any credentials exposed outside local configuration. Replace them locally and revoke the old values with the provider; this review did not alter or revoke credentials.
2. When enabling the Google Sheet writer, deploy the updated `sheets/OutreachWriter.gs`, including its formula guard. The current app reports `writeConfigured: false`, so there is no deployed writer fix verified here.
3. Keep the app bound to loopback. The current Host/Origin checks are not a substitute for authentication if the app is later exposed to a network.
4. Address the remaining static findings incrementally, beginning with the large API router and explicit input bounds; do not disable the rules merely to obtain a green result.

## Repeat the checks

```powershell
npm run security:scan
npm test
npm run build
```

`security:scan` runs local SonarJS/security lint and a limited secret-pattern scan, then queries the npm advisory registry. No source is uploaded to SonarQube. Reports are written to the ignored `security-reports/` directory:

- `summary.json`: completion status and counts.
- `sonarjs.json`: full file/line/rule findings.
- `npm-audit.json`: dependency advisory results.
- `secrets.json`: scoped matches as file/line/rule only, with no matched secret values.

An unavailable registry is reported as an incomplete audit, never as zero vulnerabilities. `npm run lint:security` prints the static findings directly.
