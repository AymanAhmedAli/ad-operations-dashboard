# IT Operations Dashboard — AD Integration, Authentication & Audit Logging

A PowerShell/Pode backend + vanilla JS frontend for a real-time IT operations
dashboard, integrated with a live Active Directory domain controller. Built
as a hands-on project to learn AD-based authentication, session security,
and audit logging patterns from the ground up.

## What This Project Does

- **Live Active Directory integration** — Users, locked/disabled accounts,
  password expiry, and computer objects pulled directly from a domain
  controller via the ActiveDirectory PowerShell module
- **AD-based authentication** — sign in with real domain credentials,
  validated against the DC (no hardcoded passwords)
- **Role-based access control** — access restricted to a specific AD
  security group (configurable)
- **Full audit trail** — every login, logout, failed attempt, and
  privileged action (like unlocking an account) is logged with who,
  what, and when
- **Idle session timeout** — automatic sign-out after a period of
  inactivity, with a warning first
- **Same-origin reverse proxy** — frontend and backend served from one
  origin to avoid cross-origin cookie issues entirely

## Stack

- **Backend:** PowerShell 7 + [Pode](https://badgerati.github.io/Pode/)
  (REST API framework)
- **Frontend:** Vanilla JS (ES modules, no build step, no framework)
- **Data source:** Live Active Directory (via `ActiveDirectory` RSAT module)

## Why I Built This

This started as an internal IT dashboard integration task at work, then
grew into a deeper dive into authentication and security engineering:
session management, CORS with credentials, race conditions in concurrent
logging, and diagnosing a cross-origin cookie bug down to its root cause
(a CORS preflight request was generating its own session, causing
intermittent login failures).

The full breakdown of every bug found and fixed is documented in the
code comments and commit history.

## Key Engineering Problems Solved

1. **Pode worker runspace isolation** — modules imported outside
   `Start-PodeServer` never reach the worker runspaces that handle
   requests. Fixed by moving imports inside the server scriptblock.
2. **Credential validation reliability** — `PrincipalContext.ValidateCredentials()`
   was unreliable in testing; switched to an authenticated `Get-ADUser`
   call instead.
3. **Race condition in audit log IDs** — concurrent writes to a CSV-based
   log could produce duplicate IDs; fixed with a named Mutex.
4. **Cross-origin session cookies** — CORS preflight (`OPTIONS`) requests
   were creating their own session, causing a mismatch with the following
   request. Solved with a same-origin reverse proxy instead of trying to
   patch around cookie `SameSite`/`Secure` flag limitations.

## Setup

### Prerequisites
- PowerShell 7+ (`pwsh`)
- [Pode](https://www.powershellgallery.com/packages/Pode) module
- Python 3 (for serving the frontend)
- A Windows Server with the `ActiveDirectory` PowerShell module (for live AD data)

### Run the backend
```bash
cd backend
pwsh ./server.ps1
```

### Run the frontend
```bash
cd frontend
python3 serve.py 8080
```
Then open `http://localhost:8080/index.html`.

The frontend's `serve.py` proxies any `/api/*` request to the backend,
so both are served under a single origin — set the backend address in
`serve.py`'s `BACKEND_BASE` variable.

## Notes

- This is a portfolio/learning project. All company-specific references
  (domain names, IPs, branding) have been genericized.
- Authentication is currently optional/toggleable in `server.ps1` and
  `index.html` — see the comments marking where the auth guard is
  enabled/disabled.
- Not production-hardened as-is: see comments in `AuditLog.Service.psm1`
  about audit log storage needing access control before real deployment.

## License

MIT
