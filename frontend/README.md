# IT Operations Hub — Frontend

Same UI, same features as the original prototype, split into a maintainable
project — and now actually wired to the real backend (`../backend`). This
app never fabricates infrastructure data: if there's nothing to show, it
says so.

**Data precedence for most services:** an explicit CSV/Excel/JSON import (if
you've used a section's Import panel) always wins; otherwise each service
tries the real backend. If neither an import nor a reachable backend exists,
the service returns an empty result with mode `none` — an honest "no data"
state, never a fabricated placeholder. The data-source badge always reflects
which of the three (`none`/`imported`/`live`) actually served the data on
screen. Printers are the one exception — no import panel, since "Add printer
by IP" configures the real backend directly instead (see below); its badge
only ever shows `none`/`live`.

## Run it

Plain ES modules (`import`/`export`) require a real HTTP origin — opening
`index.html` directly via `file://` will fail with CORS errors. Double-click
`Start App.command` (macOS), or run its server directly:

```bash
cd frontend
python3 serve.py 8080
# then open http://localhost:8080/index.html
```

`serve.py` is a plain `http.server` with one difference: every response
carries `Cache-Control: no-store`, so browsers always re-fetch the current
file instead of caching a stale copy of some `.js`/`.css` module — this app
has no build step or hashed filenames, so without that header a browser can
keep serving an old cached file after you've edited it on disk, and reloading
normally won't fix it (only a hard refresh / new private window would). Plain
`python3 -m http.server`, `npx serve .`, or the "Live Server" VS Code
extension all still work fine, they just don't have that guarantee. No build
step, no npm install either way — it's plain HTML/CSS/JS.

For the backend link to do anything, also run `../backend` (see its own
README) — by default this points at `http://localhost:8081/api` (set in
`index.html`); change `window.IT_OPS_HUB_API_BASE` there to point at a real
deployment.

## Architecture

```
Page  →  Service  →  Backend API  →  (falls back to) Imported data / localStorage  →  (else) empty / "no data"
```

- **`js/pages/*.page.js`** — one module per route. Each exports `render()`
  (async, returns an HTML string), `getActions()` (a `{action: handler}` map),
  and optionally `postRender()`. Pages call **only** services — never
  `mock-data.js` or `localStorage` directly.
- **`js/services/*.service.js`** — one per domain (Active Directory,
  FortiGate, Printers, Toner, Knowledge Base, Reports, Alerts, Assistant).
  Every exported function returns a `Promise` and tries an explicit import
  first, then the real backend (via `js/api-client.js`), and returns an
  empty result if neither is available. This is the *only* layer that talks
  to the backend or to imported data — pages never do either directly.
- **`js/api-client.js`** — the one `fetch()` wrapper every service uses,
  pointed at `window.IT_OPS_HUB_API_BASE` (see `index.html`).
- **`js/mock-data.js`** — static reference/business-logic tables only
  (departments, the alert-type/KB linking table, Knowledge Base articles) —
  never fabricated infrastructure data.
- **`js/storage.js`** — the only file touching `localStorage`. Services import
  it; pages never do.
- **`js/state.js`** — a tiny shared store (`getState`/`setState`/`subscribe`)
  for cross-cutting UI state: current route, per-domain data-source mode,
  filters, the open Knowledge Base article, the Assistant conversation, and
  the toner transaction log.
- **`js/router.js`** — hash router (`#/dashboard`, `#/active-directory`, …)
  plus a single delegated click/keydown/change listener on `#view`. Pages
  never attach their own DOM listeners; their markup carries
  `data-action="name"` (click), `data-enter="name"` (Enter key in an input),
  or `data-change="name"` attributes, and `getActions()` maps those names to
  handlers. This keeps inline JS out of HTML and avoids manual listener
  cleanup between renders.
- **`js/app.js`** — the single entry point. Owns the sidebar nav, the
  data-mode/refresh/updated-time badges in the topbar, and starts the router.
- **`js/components/*.js`** — presentation-only, reusable across pages: stat
  cards, the data table, status/data-source badges, the natural-language
  query box, the CSV/Excel/JSON import panel, a modal, and the
  Loading/No Data/Error states.

## Services and what they do

| Service | Responsibility |
|---|---|
| `active-directory.service.js` | AD users/computers, derived insights (locked, disabled, expiring passwords, inactive, recently created), keyword-based `askQuestion()` — no CSV/JSON import for this domain, live backend or nothing |
| `fortigate.service.js` | Device/interfaces/VPN tunnels/VPN users/connected devices/security events, overall health, import, `askQuestion()` |
| `printer.service.js` | Printer fleet, toner-percentage status rule, `askQuestion()`, `addPrinter()`/`removePrinter()` (backend polling list — no CSV/JSON import for this domain, see below) |
| `toner.service.js` | Inventory, transaction log, `previewTransaction()`/`confirmTransaction()` (nothing is ever applied without an explicit confirm) plus the semantic `issueToner()`/`receiveStock()`/`returnToner()`/`adjustStock()` wrappers |
| `knowledge-base.service.js` | Article search (scored keyword match), category list, single article lookup, related-articles lookup |
| `alert.service.js` | The alert feed + the alert-type → KB/impact/first-checks linking table |
| `assistant.service.js` | The rule-based diagnostic engine; falls back to a Knowledge Base search when no rule matches |
| `report.service.js` | The 21 report types, filtering, natural-language report requests, and the Management Summary aggregation |

## How the backend link actually works

Every service's data-fetching function follows the same shape — here's
`fortigate.service.js`'s `resolveData()`, representative of the services that
still support import (FortiGate, Toner):

```js
async function resolveData(){
  if(isImported){ return importedData; }              // an explicit import always wins
  try{
    const live = await fetchLive();
    if(live){ return live; }                          // real backend data
  }catch(err){ /* backend unreachable */ }
  return EMPTY_DATA;                                   // honest "no data" - never fabricated
}
```

Active Directory and Printers have no import step at all — they're either
live backend data or nothing (Printers has "Add printer by IP" instead,
which configures the backend directly rather than staging a local override;
see its own section below).

Nothing in `js/pages/` had to change for any of this — pages already did
`await activeDirectoryService.getUsers()` (etc.) and rendered whatever came
back, so swapping what's inside these functions was invisible to every page.

`toner.service.js` is the one exception worth knowing: it's the only domain
that's genuinely *this app's own data* rather than a read-only mirror of
external infrastructure, so once the backend is reachable it's used as the
real system of record for both reads and writes (`previewTransaction()` /
`confirmTransaction()` call the backend's endpoints, which re-validate
server-side against the actual database) — a local import only overrides
that if you explicitly choose to stage your own data instead.

`report.service.js` deliberately does **not** call the backend's own
`/api/reports/*` endpoints, even though they exist — it composes from the
other already-linked services instead, so a report always agrees with
whatever its own page is showing (live, imported, or none), rather than
risking a second, independently-resolved view of the same data.

## API endpoints in use

Actually called by this frontend today:

```
GET  /api/active-directory/users
GET  /api/active-directory/computers

GET  /api/fortigate/device
GET  /api/fortigate/interfaces
GET  /api/fortigate/vpn-tunnels
GET  /api/fortigate/vpn-users
GET  /api/fortigate/connected-devices
GET  /api/fortigate/security-events

GET    /api/printers          (real SNMP polling — see ../backend/README.md)
POST   /api/printers          add a printer to the backend's polling list (Printers page "Add printer by IP")
DELETE /api/printers/:ip      remove a printer that was added via POST (not one from config/printers.psd1)

GET  /api/toner/inventory
GET  /api/toner/transactions
POST /api/toner/transactions/preview
POST /api/toner/transactions/confirm

GET  /api/knowledge-base/articles
GET  /api/knowledge-base/categories
GET  /api/knowledge-base/articles/:code
GET  /api/knowledge-base/articles/:code/related
GET  /api/knowledge-base/search?q=...

GET  /api/alerts

POST /api/assistant/diagnose  { text }
```

The backend also exposes `/api/active-directory/insights`,
`/api/active-directory/ask`, `/api/active-directory/users/:username/unlock`,
`/api/fortigate/ask`, and `/api/reports/*` — all real and working, just not
called from here (the natural-language query logic and report aggregation
intentionally stay client-side; see `report.service.js`'s comment above for
why). See `../backend/README.md` for those.

## Data source indicator

Every section shows **No Data**, **Imported**, or **Live** via the shared
`dataSourceBadge()` component and the topbar/sidebar mode badges. Live means
what it says: the backend actually answered with real data. No Data means
exactly that — nothing has been imported and no live backend is reachable —
never a fabricated placeholder.

## Functional parity with the original single-file prototype

Everything from the original `it-ops-hub.html` still works: the dashboard
summary cards and section shortcuts; Active Directory views and natural-
language queries; FortiGate device/interfaces/VPN/connected-devices/events
and queries; Printer status rules and queries; Toner stock calculations and
the full preview-before-confirm transaction flow (now in a modal); the
Knowledge Base with search, category filter, tags, article detail, and (new)
related articles; the Report Center's 21 report types, natural-language
report requests, and the Management Summary; Alerts with the recommended-
response linking table; and the IT Assistant's rule-based diagnosis with
Knowledge Base fallback. CSV/Excel/JSON import, secret redaction, and
localStorage persistence are all preserved behind their respective services.
