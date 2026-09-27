<#
    Cross-runspace config sharing for Pode.

    Pode runs each route handler in its own runspace, and each of those
    runspaces gets its OWN independent copy of every imported module - a
    plain `$script:` variable set by an Initialize-X function called before
    Start-PodeServer is invisible inside route handlers, which run in
    different runspaces entirely. This was a real, verified bug: every
    "Initialize-X" module (Database, ActiveDirectory, FortiGate, Printers)
    looked correctly configured in the main thread but silently saw only
    empty/default config inside actual requests.

    Pode's own Set-PodeState/Get-PodeState IS shared correctly across every
    runspace of a running server - but only works once Start-PodeServer has
    begun (calling it earlier throws "Pode has not been initialised"), which
    is also why every Initialize-X call now happens inside the
    Start-PodeServer scriptblock in server.ps1, not before it.

    These wrappers fall back to a plain module-scoped hashtable when Pode
    isn't running at all (direct module testing, Pester), so every service
    module still works standalone without needing a live server.
#>

$script:LocalFallback = @{}

function Set-SharedConfig {
    param([Parameter(Mandatory)][string]$Name, $Value)
    $script:LocalFallback[$Name] = $Value
    try{ Set-PodeState -Name $Name -Value $Value -ErrorAction Stop | Out-Null }
    catch{ <# not running under Pode (direct/Pester testing) - local fallback above still applies #> }
}

function Get-SharedConfig {
    param([Parameter(Mandatory)][string]$Name)
    try{ return Get-PodeState -Name $Name -ErrorAction Stop }
    catch{ return $script:LocalFallback[$Name] }
}

Export-ModuleMember -Function Set-SharedConfig, Get-SharedConfig
