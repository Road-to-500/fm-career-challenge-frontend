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

When creating a challenge, select the official achievements that should initially be enabled. Choose **Save as draft** to configure rules and competitions before publishing and inviting a rival. Gameplay is unavailable until publication. An administrator can enable other official achievements or create challenge-specific custom achievements in the challenge's Rules tab.

Administrators can customize achievement names, descriptions and categories through the versioned rule editor. These are display labels only: they do not change the official scoring conditions. The achievement list shows the latest configured text, including scheduled changes, while score breakdown labels follow the rule version for each event. Enter the catalog wording explicitly to restore it.

Supported manual achievements can also have their frequency changed through the rule editor. The preview shows the scoring impact; earlier eligible records count when the new frequency applies. Recording and correcting a claim uses the frequency for its selected season. Automatic milestones and the club-move milestone keep their fixed semantics.

The rule editor also supports a versioned minimum number of managed cup matches for G008, G009 and G015. The final must still be managed. A preview shows the effect on recorded claims, and claim entry uses the minimum applicable to the selected season.

The Rules tab also lets administrators preview and version the points and enabled state for first bonuses, season duels and fixed checkpoints.

New users complete profile onboarding before using the dashboard. The profile can be edited later, including an optional HTTPS avatar URL. A challenge overview includes a detailed score-event breakdown with pending and exclusion explanations.

For new careers, record the starting situation in the Career tab before entering results: either unemployed or a starting club below the first division. Add the starting club first when selecting a club start. Managing a first-division club after an unemployed start is allowed. Existing careers can add this self-reported information without losing historical data.

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
