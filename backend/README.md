# IT Operations Hub — Backend

PowerShell + [Pode](https://badgerati.github.io/Pode/) REST API implementing the endpoints
the [frontend](../frontend) already expects, backed by SQL Server Express for
Toner Inventory.

## What's real vs. not yet wired up

| Domain | Status |
|---|---|
| **Toner Inventory** | Fully real. SQL Server Express, atomic preview→confirm transactions, unit-tested (Pester). |
| **Knowledge Base** | Fully real (static authored content — not "live infrastructure" by nature). |
| **IT Assistant** | Fully real (rule engine + KB fallback search). |
| **Alerts** | Fully real — computed from whatever the other services actually return, not a fixed demo list. |
| **Reports / Management Summary** | Fully real — aggregates the above; reports honestly which data sources aren't reachable. |
| **Active Directory** | Real `ActiveDirectory` module calls. Needs this server to run on a host with RSAT installed and domain-controller reachability. Off-domain, every endpoint returns `{available:false, error:"..."}` rather than fake data. |
| **FortiGate** | Real REST API calls (`Invoke-RestMethod`). Needs `ITHUB_FORTIGATE_BASE_URL` / `ITHUB_FORTIGATE_API_TOKEN` set and a reachable device. Otherwise, same honest `unavailable` response. |
| **Printers** | Real SNMP polling (standard Printer-MIB/Host-Resources-MIB OIDs) via the `SnmpTools` module. Verified end-to-end against a real local SNMP agent during development — see `modules/Printer.Service.psm1`'s header for exactly what was and wasn't validated. Needs printers listed in `config/printers.psd1` (empty by default → `{available:false}`). |

This mirrors the frontend's own rule: never fabricate data for something that should be live. When AD/FortiGate/Printers/DB aren't reachable, the API says so — it doesn't fall back to demo values.

## Run it

```bash
pwsh                                    # PowerShell 7+ required (works on Windows/macOS/Linux)
Install-Module Pode -Scope CurrentUser
Install-Module SqlServer -Scope CurrentUser   # brings in Microsoft.Data.SqlClient too
Install-Module SnmpTools -Scope CurrentUser   # only needed for printer polling
Install-Module Pester -Scope CurrentUser -MinimumVersion 5.0   # only needed to run tests

./server.ps1
```

It listens on `http://0.0.0.0:8081` by default (`/api/health` to check status).

### Configuration

Static defaults live in `config/app.config.psd1` (safe to commit — no secrets).
Real per-deployment values come from environment variables, which always
override the file:

| Variable | Purpose |
|---|---|
| `ITHUB_AD_DOMAIN` | Active Directory domain, e.g. `contoso.local` |
| `ITHUB_FORTIGATE_BASE_URL` | FortiGate REST API base URL, e.g. `https://10.0.0.1:443` |
| `ITHUB_FORTIGATE_API_TOKEN` | FortiGate REST API token (System > Administrators > REST API Admin) |
| `ITHUB_DB_CONNECTION_STRING` | SQL Server Express connection string |
| `ITHUB_SNMP_COMMUNITY` | SNMP community string used for every printer in `config/printers.psd1` |
| `ITHUB_PORT` | Override the listening port (default 8081) |

Set these on the actual host (IIS app pool env vars, a systemd unit, Azure App
Service configuration) — never edit real values into the `.psd1` file.

### Setting up a real AD domain to test against

`ITHUB_AD_DOMAIN` needs an actual Active Directory domain to point at, which
means running this backend on a machine with the `ActiveDirectory` PowerShell
module (RSAT) and network access to a domain controller — that module is
Windows-only, so it can't be tested from a Mac. See
`../windows-domain-setup/` for a from-scratch guide (promote a Windows
machine to a test DC, seed a few test users including a deliberately locked
one, run this backend there, point the frontend at it).
### Printer setup

Two ways to tell the backend which printers to poll:

- **Edit `config/printers.psd1`** (ships with an empty list, `Printers = @()`,
  which is why `/api/printers` returns `{available:false}` by default):
  ```powershell
  Printers = @(
      @{ name = 'PRN-FIN-01'; ip = '192.168.10.31'; port = 161; manufacturer = 'HP'; model = 'LaserJet Ent M507'; department = 'Finance'; location = 'HQ - 2nd Floor' }
  )
  ```
  Requires a backend restart to take effect.
- **Add one from the frontend's Printers page** ("Add printer by IP") — calls
  `POST /api/printers` (`DELETE /api/printers/:ip` to remove it), which takes
  effect immediately with no restart. These persist in
  `config/printers.local.json` (git-ignorable, not the hand-edited `.psd1`)
  and are merged with the `.psd1` list on every request — see
  `Sync-PrinterList` in `modules/Printer.Service.psm1`. A printer added this
  way can be removed again from the UI; one listed in `printers.psd1` can't
  (editing that file is the only way to remove it), which is how the UI
  decides whether to show a Remove button at all.

Only `ip` is required either way — `port` defaults to 161, everything else is
inventory metadata SNMP itself can't provide (department/location/friendly
name); live fields (online, toner %, page count) are polled fresh on every
request.

### Database setup

```bash
sqlcmd -S localhost\SQLEXPRESS -i db/schema.sql
```
Creates the `ITOperationsHub` database, `TonerItems`/`TonerTransactions`
tables, and seeds the same starting inventory the frontend's demo data uses.

### Tests

```bash
Invoke-Pester ./tests
```
Unit tests for the Toner service's business logic (stock math, validation,
insufficient-stock rejection) with the database call mocked — these run
without a live SQL Server instance.

## Architecture

```
routes/*.routes.ps1   → registers Pode HTTP routes, thin (parse request, call a service, return JSON)
modules/*.Service.psm1 → the actual logic (AD cmdlets, FortiGate REST calls, SQL queries, KB search, rules)
modules/Database.psm1  → the only file that opens a SQL connection
modules/SharedState.psm1 → the only file that stores cross-request config (see callout below)
config/app.config.psd1 → static config, overridden by environment variables at startup
```

**A real bug worth understanding if you add another `Initialize-X`
function:** Pode dispatches every route handler to its own worker runspace,
each with its own independent copy of every imported module. A plain
`$script:` variable set by calling `Initialize-Database`/`Initialize-FortiGate`/
etc. in the main thread (before `Start-PodeServer`) is **invisible** inside
route handlers — this was found and fixed during development: every
`Initialize-X` call appeared to succeed, `Test-*Available` even looked
correct when called right after, but every actual HTTP request still saw
empty/default config, because it ran in a different runspace that never got
initialized. The fix has two parts, and both matter:
1. Every `Initialize-X` function stores its value via `Set-SharedConfig`
   (`modules/SharedState.psm1`), which wraps Pode's own `Set-PodeState` /
   `Get-PodeState` — the one mechanism that actually is shared across every
   runspace of a running server (falls back to a plain local variable when
   Pode isn't running at all, so modules still work standalone for direct
   testing/Pester).
2. Every `Initialize-X` call in `server.ps1` happens **inside**
   `Start-PodeServer`'s scriptblock, not before it — `Set-PodeState` itself
   throws `"Pode has not been initialised"` if called any earlier.

If you add a new service module with its own configuration, follow the same
two steps or it will silently misbehave exactly like this did.

Every service function that talks to real infrastructure (AD, FortiGate, the
database) returns a consistent shape: `{ available: bool, error: string|null,
data: ... }` (or, for the DB-backed Toner routes, a `503` with a clear error
body). The frontend can treat "unavailable" identically regardless of which
backend dependency is the cause.

## Security notes

- No credentials are hard-coded anywhere in this repo — everything sensitive
  comes from environment variables set on the actual deployment host.
- Toner transactions are validated **twice**: once when previewed, and again
  atomically (inside a SQL transaction with row locking) when confirmed — a
  stale or tampered preview can never drive stock negative.
- `Unlock-AdUserAccount` should run under a service account delegated only
  the "unlock account" right in AD — never Domain Admin.
- Put this server behind Entra ID Application Proxy (or a VPN) rather than
  exposing it directly to the internet — see the frontend README for the
  full access architecture this was designed against.

## Known gaps / next steps

1. **Printer supply index simplification** — `Printer.Service.psm1` reads
   `prtMarkerSuppliesTable` index 1 (correct for most monochrome printers)
   rather than walking the full table, so color printers with separate
   C/M/Y/K supply levels are under-reported to just one value. Documented
   in the module's header, with where to extend it.
2. **Password expiry** (`passwordExpiry` field) — `Get-AdUsers` doesn't yet
   compute this from `msDS-UserPasswordExpiryTimeComputed`; it's left `null`.
   Straightforward to add once tested against a real domain.
3. **Authentication** — this server currently trusts whatever reaches it.
   It's designed to sit behind Entra ID Application Proxy, which handles
   authentication before traffic ever reaches this process — if you deploy
   it any other way, add your own auth middleware first.
