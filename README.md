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

## Checks

```powershell
npm test
npm run build
```

## Deployment

Build with `npm run build` and serve `dist/` behind HTTPS. Route `/api` and `/hubs` through the same public origin to the ASP.NET backend, with WebSocket support enabled for SignalR. Set `VITE_API_BASE_URL` only when the API is intentionally hosted on a different origin and configure credentialed CORS accordingly.

The client contains no provider secrets or authoritative scoring logic. Authentication uses the backend's HttpOnly cookie; all writes require its CSRF token.
