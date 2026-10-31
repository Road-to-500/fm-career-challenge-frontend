# FM Career Challenge — Frontend

Independent Vue 3 + TypeScript application for the FM Career Challenge platform.

## Requirements

- Node.js 24.15+ (or a supported current LTS release)
- The ASP.NET API running at `http://localhost:5195`

## Local development

```powershell
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173` and proxies `/api` and `/hubs` to the backend. Set `API_PROXY_TARGET` when the API runs elsewhere. Copy `.env.example` to `.env.local` only when a separate API origin is required.

Sign-in uses Google OAuth through the backend. Configure the Google client ID and secret on the API as described in the backend README; the frontend does not contain provider credentials.

## Guided workspace

The public product example explains the challenge target, not a pretend personal score or progress widget.

The signed-out dashboard is a public landing page with Google sign-in and a short product guide; personal challenge counts, invitations and create actions appear only after the profile succeeds. Initial session loading is neutral, including when retrying without a cached profile. Only HTTP 401 means signed out: denied access (403), network and server failures show explanations and retry, not a misleading landing page. A failed refetch also removes cached personal workspace chrome and closes its dialogs. Account actions explicitly offer **Edit profile** and **Sign out**.

An invitation query remains on the URL through dashboard navigation. Before Google sign-in, its token is also kept in this tab's session storage for up to one hour and restored to Invitations when the callback returns without the query. This requires browser storage; the token is removed from storage after restoration and never automatically accepted. Joining or accepting an invitation offers a confirmed **Open joined challenge** destination. Invitation, notification, creation and sign-out actions lock while pending and report failures without inventing success.

After sign-in, Overview, My challenges, Invitations and How it works are URL-backed dashboard views (`/dashboard?view=challenges`, `invitations` or `help`). Existing `#active-challenges`, `#invitations` and `#about` links are redirected to their matching views. Browser back and forward navigate between workspace views. Mobile navigation uses a two-column grid so every destination is visible, rather than hiding full-width buttons in a horizontal scroller.

Challenge navigation prioritizes Overview, Career, Seasons and Achievements. Transfers, Activity and Rules are in the secondary More menu, which identifies the selected task; transfers are also linked from Seasons. Sections are shareable as `?section=career|seasons|achievements|transfers|activity|rules`; Overview omits the query. Reload and browser history retain supported sections, invalid values fall back to Overview, and Draft gameplay sections also fall back to Overview. Moving between challenge IDs creates separate view/query/realtime lifecycles; changing sections within one challenge does not remount it.

Read availability is distinct from permission to write. Published records remain readable while a rival or required career start is missing, and after completion or archive. Gameplay writes, including country-match evidence, need an Active challenge, a loaded career and any required starting declaration. Club creation and career setup remain available while awaiting a rival, avoiding a circular starting-club prerequisite. Add the club from the setup prompt first if needed; saving it returns to setup with the new eligible club selected. Existing careers where a start is not required remain unblocked. Changing section or losing write eligibility closes stale gameplay dialogs without discarding readable navigation. Archive/restore remain confirmed administrator actions under **Manage challenge**.

Season choices display a calendar season and a one-based ordinal (for example, `2026/27 — Season 1`). All forms can choose the full supported API range, indices 0–100, within their contextual start/end constraints; unset values remain available where optional. New season entry includes an explicit season choice; editing an existing season keeps its identity/version, and new entry cannot silently overwrite another saved season. The frontend still sends zero-based indices to the API. Field guidance includes concise instructions and expandable examples. `FieldHelp` associates descriptions with enclosing controls or an explicit `for` target for sibling-labelled fields; evidence checkboxes reference their shared self-attestation guidance.

International career, timeline totals/actions and manual milestone evidence are expandable. Collapsing them does not remove records; saved records and invalid warnings stay discoverable, while irrelevant calculated milestone panels wait until setup is complete and relevant records exist. Switching between quick season entry and per-club details retains the entered breakdown; saved breakdowns remain stored when a quick summary is saved unless their removal is explicitly requested.

Rules uses focused **Invitations**, **Version and change history**, **Continental competitions**, **Custom achievement** and **Scoring rules** expanders. Draft values survive collapsing a task; catalog CRUD, rule previews, scheduled versions and confirmations remain unchanged. Unknown routes offer a useful home link. Challenge failures distinguish sign-in required, denied access, missing records and retryable failures, with a dashboard recovery action.

When creating a challenge, select the official achievements that should initially be enabled. Choose **Save as draft** to configure rules and competitions before publishing and inviting a rival. Gameplay is unavailable until publication. An administrator can enable other official achievements or create challenge-specific custom achievements in the challenge's Rules tab.

Administrators can customize achievement names, descriptions and categories through the versioned rule editor. These are display labels only: they do not change the official scoring conditions. The achievement list shows the latest configured text, including scheduled changes, while score breakdown labels follow the rule version for each event. Enter the catalog wording explicitly to restore it.

Supported manual achievements can also have their frequency changed through the rule editor. The preview shows the scoring impact; earlier eligible records count when the new frequency applies. Recording and correcting a claim uses the frequency for its selected season. Automatic milestones and the club-move milestone keep their fixed semantics.

The rule editor also supports a versioned minimum number of managed cup matches for G008, G009 and G015. The final must still be managed. A preview shows the effect on recorded claims, and claim entry uses the minimum applicable to the selected season.

The Rules tab also lets administrators preview and version the points and enabled state for first bonuses, season duels and fixed checkpoints.

New users complete profile onboarding before using the dashboard. The profile can be edited later, including an optional HTTPS avatar URL. A challenge overview includes a detailed score-event breakdown with pending and exclusion explanations.

For new careers that require it, record the starting situation in the Career tab before entering results: either unemployed or a starting club below the first division. The setup prompt can open the club form before the starting club has been recorded, avoiding a circular prerequisite. Managing a first-division club after an unemployed start is allowed. Existing careers can add this self-reported information without losing historical data.

New league-title, national and league cup, super cup, promoted-club, continental-participation and two-club continental title claims request the player's relevant self-attested participation and result details. Older claims are preserved; missing details must be supplied when correcting them.

Club- and country-move claims require the starting club and destination in the career, including 20 matches. Select the starting club from the recorded career to link its catalog identity when available, or enter its details manually. Club matches are combined across stints at the same club; country matches are combined across clubs in the country. Complete active season allocations establish the 20-match season; otherwise record the attested milestone on a stint active when it was reached. Correcting career records can change an existing claim's score.

Club-frequency claims distinguish the same club name in different countries when both country codes are supplied. Without a country code, the name may match a club in any country.

Career stints can select a club from the shared searchable catalog or add an entered name and catalog country to it. Achievement forms can select a career club and link its catalog ID. Existing free-text records remain usable and are resolved to a matching catalog ID when possible.

First-division and higher-division move claims request self-attested career details; the higher-division move also requires the previous best and new division levels. Claims are rejected or lose points when an earlier recorded stint or detailed season contradicts the stated first division or previous best division. Incomplete records and ordering within a season cannot be independently verified.

The third-to-first-division achievement requires a self-attested continuous progression with one club. Recorded matches at another club strictly between those seasons contradict the claim; incomplete records and ordering within the boundary seasons cannot be independently verified.

The first-major-club-trophy achievement is cross-checked against earlier attested titles or cups with the same identified club. Records with missing identities, unattested older results and the order of trophies within the same season remain uncertain.

Club stints can be edited or removed from the career timeline. Removal requires confirmation and can change scores.

For a season, choose the quick league summary or a per-club breakdown tied to recorded career stints. Detailed league totals are aggregated for the annual duels. Switching back to the quick summary preserves the breakdown unless you explicitly remove it. Allocated official matches across seasons cannot exceed each stint's recorded total.

National-team stints can optionally include official-match allocations by season. When allocations cover all recorded national-team matches, the 20-match milestone season is calculated; otherwise, the player can attest it manually. Complete club and national-team season allocations with known countries also calculate the three-continent milestone.

Challenge administrators can maintain a continental competition catalog under Rules. Supported continental claims may optionally link to a competition of the appropriate tier; unlinked claims retain conservative same-season exclusions. Catalog tiers and results are self-reported.

The interface defaults to dark theme. Use the theme button in the header to switch to light; the preference is stored in this browser and synchronized between tabs.

## Checks

```powershell
npm test
npm run build
```

For browser journeys, install Chromium with `npx playwright install chromium` and start the backend's **test-only E2E host** on `127.0.0.1:5196` as described in the backend README. Playwright starts a loopback-only Vite server and runs desktop and mobile Chromium tests in both themes against that host. These tests use a dedicated database and test identities, not OAuth; they add data and do not clear it.

Functional journeys cover the public landing/help, URL navigation and history, provider-return invitation recovery, initial-club setup, saved-data preservation, two-manager scoring/reconnection, notifications, authorization and correction lifecycle. The provider-return case substitutes only the external Google redirect; it does not validate real Google credentials or OAuth configuration.

### Action and state evidence

`scripts\verify-ux-inventory.mjs` inventories every template action, form submit, disclosure and editable/output control in the two views and shared controls. It records source locations, handler/route bindings, role/status gates, pending bindings, field context/bounds and handler bodies with API calls, confirmations and failure-state assignments. It fails on actionless buttons or editable controls lacking field context. This static wiring evidence is not a claim that every action was clicked in every state.

```powershell
node scripts\verify-ux-inventory.mjs
# Optional: pass an absolute path to save the JSON inventory outside the repository.
```

| Surface / actions | Regression evidence |
| --- | --- |
| Landing, public help, Google CTA, pending invitation, dashboard sections and legacy links | `guided-workspace.spec.ts`: anonymous state without counters/create, help/back/forward, preserved invite, simulated provider return; `DashboardView.test.ts`: initial loading, 401/403/503, cached-profile failure and empty/unavailable counters |
| Challenge section links, More, A-to-B identity, invalid URLs, archive/restore, Draft publication, completion/reopen | `final-action-flows.spec.ts`, `lifecycle-notifications.spec.ts`, `correction-lifecycle.spec.ts`: in-app identity/history/reload, read-only sections, participant restrictions, management confirmations; route and eligibility unit regressions |
| Join, accept/decline, generated invitation, managed creation/revoke, notifications | `two-manager.spec.ts`, `lifecycle-notifications.spec.ts`, `final-action-flows.spec.ts`: successful destinations and persisted state; dashboard unit cases: pending join/accept/decline/sign-out, failures without success, notification read persistence and clipboard-denied fallback |
| Career start, club creation/edit/removal, catalog/manual identities, match evidence, national teams and allocations | Guided setup and two-manager journeys, plus final state case: required start, pending rival, country-evidence unlock/save, stored zero-based index 100, correct challenge identity; career eligibility and required/legacy-state unit cases |
| Season create/edit, quick/detailed totals, saved breakdown preservation, reopen and transfer add/edit/delete/currency handling | Two-manager/correction journeys and final season-100 save; final action journey persists transfer CRUD, rejects mismatched currency, confirms season-driven currency relabel without converting fees, and cancels then confirms removal; existing unit cases preserve breakdowns and correction |
| Achievement claims/corrections/removal, evidence options and scoring-event breakdown | Two-manager and correction journeys; existing evidence/catalog/unit regressions preserve participation, frequency and versioned scoring semantics |
| Rules disclosures, competition create/edit/delete, custom achievement, version preview/apply/history | Final focused-Rules journey: collapse/reopen preserves entered values, CRUD persists, scheduling at index 100, publication and managed invites; two-manager journey exercises rule impact/scoring |
| Profile cancel/validation/save/reload, explicit sign-out, challenge 401/403/404 and unknown-route recovery | Final profile/recovery journeys; real logout endpoint called, then test-only identity cookie removed to simulate the production auth-cookie transition |
| National-team deletion and season allocation removal | Bounded `remaining national actions` journey: cancel both confirmations, remove an allocation then cancel the edit without changing saved rows, confirm/save removal and reload the remaining allocation, confirm stint removal and verify empty API/UI after reload |
| National-team, club, country and three-continent manual milestone clearing | Bounded `remaining` journeys first persist an attestation, cancel clearing and verify it survives, then explicitly save unset values and reload/reopen the forms to verify null remains stored; supporting club/team match totals remain unchanged |
| Per-club season row removal and explicit saved-breakdown removal | Bounded `remaining club allocation` journey: row removal is local until season save, Cancel preserves both saved rows, Save/reload retains the remaining row, cancel the permanent-breakdown confirmation preserves it, then confirm/save/reload leaves no breakdown without deleting career stints |
| Labels, field descriptions/examples, seasons and themes | Static control inventory, `FieldHelp.test.ts`, selector boundary unit cases, contextual labels used throughout browser forms; four desktop/mobile × dark/light projects and captured state screenshots |

The bounded follow-up covers national-team removal, national-team and per-club allocation-row removal, saved-breakdown removal, and clearing every manual milestone type through real isolated API writes and reloads across all four projects. Clearing a manual attestation is not an instruction to erase an automatically calculated milestone: complete allocations can still establish eligibility under the existing backend rules.

The national milestone dialog gets a fresh session when reopened, so a preceding close animation cannot remove the new dialog during cancel/reopen/save. Its values and concurrency version are still populated from the current career record.

Remaining unexercised branches: every scoring-rule subtype is not exhaustively browser-exercised. Live Google consent/callback and production-cookie expiry/logout, storage-disabled behavior, browser-specific clipboard success permissions, all network/CSRF/concurrency failure permutations, and every confirmation-cancel branch remain unverified. Static handler evidence and existing validation guards cover wiring, not those outcomes. Accessibility auditing remains deferred to V4; context-association regressions do not constitute a WCAG audit.

Accessibility checks remain available for V4. While accessibility testing is deferred, run functional browser journeys without axe audits or keyboard/reduced-motion checks:

```powershell
$env:FMCC_SKIP_ACCESSIBILITY = "true"
npm run test:e2e
Remove-Item Env:FMCC_SKIP_ACCESSIBILITY
```

Leave the variable unset when accessibility checks are scheduled for V4.

## Deployment

Build with `npm run build` and serve `dist/` behind HTTPS. Route `/api`, `/signin-google` and `/hubs` through the same public origin to the ASP.NET backend, with WebSocket support enabled for SignalR. Set `VITE_API_BASE_URL` only when the API is intentionally hosted on a different origin and configure credentialed CORS accordingly.

The client contains no provider secrets or authoritative scoring logic. Authentication uses the backend's HttpOnly cookie; all writes require its CSRF token.

### Fly.io

`fly.toml` targets `road-to-500-web-prod` in Frankfurt (`fra`). Fly terminates HTTPS and forwards requests to Nginx on port 80. The frontend stays running, initially with one shared CPU and 256 MB RAM. The TOML does not enforce a single replica; use `--ha=false` at the authorized first deployment if only one frontend Machine is intended.

The Fly build selects `nginx.fly.conf`; a default Docker build still selects the original static-only `nginx.conf`. The Fly build explicitly keeps `VITE_API_BASE_URL` empty so the browser uses the public origin `https://road-to-500-web-prod.fly.dev`. The Docker build context excludes local environment files and certificate files. Do not supply backend credentials as frontend build arguments.

The production Nginx configuration rejects unexpected Hosts and proxies `/api`, `/signin-google` and `/hubs` to `road-to-500-api-prod.internal:8080`, preserving paths, queries and the public Host. It resolves the private IPv6 address through Fly DNS at request time, allowing the frontend to start without a running backend. Backend failures remain HTTP gateway errors, not SPA fallback responses. SignalR supports WebSocket upgrades and unbuffered long-running requests.

The proxy overwrites forwarded scheme and address headers instead of trusting browser-supplied values. It sends `X-Forwarded-Proto: https` because the public Fly service enforces HTTPS. For now, `X-Forwarded-For` contains Nginx's immediate peer address, not a verified original browser IP: anonymous API rate limits can therefore be shared by users behind the same Fly ingress. Original-client-IP handling requires a separately verified ingress trust configuration; do not simply trust incoming forwarded headers.

Before deployment:

- Keep both applications in the same Fly organization/private network and the backend running; `.internal` traffic cannot autostart a stopped backend.
- Set the backend's `ReverseProxy__KnownProxies__0` and further indexes to the verified source IPv6 addresses of the frontend Machines. Recheck these after Machine replacement or network changes. Until this is configured, forwarded HTTPS is ignored and OAuth cannot be considered ready.
- Complete the backend volume, certificate and explicit database migration prerequisites described in the backend README.
- Register `https://road-to-500-web-prod.fly.dev/signin-google` in the Google production OAuth client. No Google or Neon secrets are needed in the frontend app.

Validate the Fly configuration without deploying:

```powershell
fly config validate --strict
```

The `/health` check reports Nginx liveness only; it does not verify backend connectivity, database access or Google sign-in. Do not run `fly deploy` or `fly secrets deploy` until the remaining prerequisites have been completed.
