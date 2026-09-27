<#
    IT Operations Hub - backend entry point.

    Run with:  pwsh ./server.ps1
    Requires:  Install-Module Pode, Install-Module SqlServer  (both from PSGallery)

    This process should run on a host that can reach:
      - a domain controller (for the ActiveDirectory module), and
      - the FortiGate device's management interface, and
      - the SQL Server Express instance for toner inventory.
    Put it behind Entra ID Application Proxy (or a VPN) rather than exposing
    it directly to the internet - see ../frontend/README.md for the access
    architecture this was designed against.
#>

Import-Module Pode

$root = $PSScriptRoot
$config = Import-PowerShellDataFile -Path (Join-Path $root 'config/app.config.psd1')
$printersConfig = Import-PowerShellDataFile -Path (Join-Path $root 'config/printers.psd1')

if($env:ITHUB_AD_DOMAIN){ $config.ActiveDirectory.Domain = $env:ITHUB_AD_DOMAIN }
if($env:ITHUB_FORTIGATE_BASE_URL){ $config.FortiGate.BaseUrl = $env:ITHUB_FORTIGATE_BASE_URL }
if($env:ITHUB_FORTIGATE_API_TOKEN){ $config.FortiGate.ApiToken = $env:ITHUB_FORTIGATE_API_TOKEN }
if($env:ITHUB_DB_CONNECTION_STRING){ $config.Database.ConnectionString = $env:ITHUB_DB_CONNECTION_STRING }
if($env:ITHUB_SNMP_COMMUNITY){ $printersConfig.Community = $env:ITHUB_SNMP_COMMUNITY }
if($env:ITHUB_PORT){ $config.Server.Port = [int]$env:ITHUB_PORT }

. (Join-Path $root 'routes/active-directory.routes.ps1')
. (Join-Path $root 'routes/fortigate.routes.ps1')
. (Join-Path $root 'routes/printers.routes.ps1')
. (Join-Path $root 'routes/toner.routes.ps1')
. (Join-Path $root 'routes/knowledge-base.routes.ps1')
. (Join-Path $root 'routes/alerts.routes.ps1')
. (Join-Path $root 'routes/assistant.routes.ps1')
. (Join-Path $root 'routes/reports.routes.ps1')
. (Join-Path $root 'routes/auth.routes.ps1')
. (Join-Path $root 'routes/audit.routes.ps1')

Start-PodeServer -Threads 4 {
    # Import modules inside server scriptblock so all worker runspaces can access them
    Import-Module (Join-Path $root 'modules/Database.psm1')
    Import-Module (Join-Path $root 'modules/ActiveDirectory.Service.psm1')
    Import-Module (Join-Path $root 'modules/FortiGate.Service.psm1')
    Import-Module (Join-Path $root 'modules/Printer.Service.psm1')
    Import-Module (Join-Path $root 'modules/Toner.Service.psm1')
    Import-Module (Join-Path $root 'modules/KnowledgeBase.Service.psm1')
    Import-Module (Join-Path $root 'modules/Alert.Service.psm1')
    Import-Module (Join-Path $root 'modules/Assistant.Service.psm1')
    Import-Module (Join-Path $root 'modules/Report.Service.psm1')
    Import-Module (Join-Path $root 'modules/AuditLog.Service.psm1')

    Initialize-Database -ConnectionString $config.Database.ConnectionString
    Initialize-ActiveDirectory -Domain $config.ActiveDirectory.Domain
    Initialize-FortiGate -BaseUrl $config.FortiGate.BaseUrl -ApiToken $config.FortiGate.ApiToken -ValidateCertificate $config.FortiGate.ValidateCertificate
    Initialize-Printers -Printers $printersConfig.Printers -Community $printersConfig.Community -TimeoutMs $printersConfig.TimeoutMs
    Initialize-AuditLog -LogPath 'C:\IT-Operations-Hub\audit.csv'

    Add-PodeEndpoint -Address $config.Server.Address -Port $config.Server.Port -Protocol Http

    # Enable sessions for login/auth tracking
    # Cookie must be SameSite=None + Secure to be sent across different
    # origins (frontend and backend are on separate Cloudflare tunnel
    # domains, both HTTPS). Without this, the browser silently drops the
    # session cookie and every request after login looks unauthenticated.
    # Skip session creation entirely for OPTIONS preflight requests —
    # otherwise every CORS preflight generates its own session cookie,
    # which the browser doesn't carry into the actual request that
    # follows, causing login to fail intermittently (session mismatch).
    # CORS headers are applied here too, since responding here means we
    # never reach the 'cors' middleware registered further below.
    Add-PodeMiddleware -Name 'skip-options-session' -ScriptBlock {
        if($WebEvent.Method -eq 'Options'){
            Add-PodeHeader -Name 'Access-Control-Allow-Origin' -Value 'http://localhost:8080'
            Add-PodeHeader -Name 'Access-Control-Allow-Credentials' -Value 'true'
            Add-PodeHeader -Name 'Access-Control-Allow-Methods' -Value 'GET,POST,DELETE,OPTIONS'
            Add-PodeHeader -Name 'Access-Control-Allow-Headers' -Value 'Content-Type'
            Write-PodeJsonResponse -Value @{}
            return $false
        }
        return $true
    }

    Enable-PodeSessionMiddleware -Duration 3600 -Extend

    Add-PodeMiddleware -Name 'cors' -ScriptBlock {
        Add-PodeHeader -Name 'Access-Control-Allow-Origin' -Value 'http://localhost:8080'
        Add-PodeHeader -Name 'Access-Control-Allow-Credentials' -Value 'true'
        Add-PodeHeader -Name 'Access-Control-Allow-Methods' -Value 'GET,POST,DELETE,OPTIONS'
        Add-PodeHeader -Name 'Access-Control-Allow-Headers' -Value 'Content-Type'
        return $true
    }
    Add-PodeRoute -Method Options -Path '*' -ScriptBlock { Write-PodeJsonResponse -Value @{} }

    # Auth Guard — protects every /api/* route except login/health/OPTIONS.
    # Runs before the route handler; if there's no valid session, the
    # request is rejected with 401 and the real handler never executes.
    # Auth requirement disabled for this deployment — team decided to
    # open the dashboard directly without sign-in. Kept commented (not
    # deleted) along with auth.routes.ps1 / AuditLog.Service.psm1 for
    # reuse in a separate personal project.
    # Add-PodeMiddleware -Name 'auth-guard' -Route '/api/*' -ScriptBlock {
    #     $publicPaths = @('/api/auth/login', '/api/health')
    #     if($WebEvent.Method -eq 'Options'){ return $true }
    #     if($publicPaths -contains $WebEvent.Path){ return $true }
    #
    #     $user = $WebEvent.Session.Data.user
    #     if(-not $user){
    #         Write-PodeJsonResponse -StatusCode 401 -Value @{
    #             success = $false
    #             error   = 'Not authenticated. Please sign in.'
    #         }
    #         return $false
    #     }
    #     return $true
    # }

    Add-PodeRoute -Method Get -Path '/api/health' -ScriptBlock {
        Write-PodeJsonResponse -Value @{
            status           = 'ok'
            time             = (Get-Date).ToUniversalTime().ToString('o')
            activeDirectory  = Test-ActiveDirectoryAvailable
            fortiGate        = Test-FortiGateAvailable
            database         = Test-DatabaseAvailable
        }
    }

    Register-ActiveDirectoryRoutes
    Register-FortiGateRoutes
    Register-PrinterRoutes
    Register-TonerRoutes
    Register-KnowledgeBaseRoutes
    Register-AlertRoutes
    Register-AssistantRoutes
    Register-ReportRoutes
    Register-AuthRoutes
    Register-AuditRoutes

    Write-PodeHost "IT Operations Hub backend listening on http://$($config.Server.Address):$($config.Server.Port)" -ForegroundColor Green
}
