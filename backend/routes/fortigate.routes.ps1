<#
    FortiGate routes.
    GET /api/fortigate/device
    GET /api/fortigate/interfaces
    GET /api/fortigate/vpn-tunnels
    GET /api/fortigate/vpn-users
    GET /api/fortigate/connected-devices
    GET /api/fortigate/security-events
#>
function Register-FortiGateRoutes {
    Add-PodeRoute -Method Get -Path '/api/fortigate/device' -ScriptBlock { Write-PodeJsonResponse -Value (Get-FortiGateDevice) }
    Add-PodeRoute -Method Get -Path '/api/fortigate/interfaces' -ScriptBlock { Write-PodeJsonResponse -Value (Get-FortiGateInterfaces) }
    Add-PodeRoute -Method Get -Path '/api/fortigate/vpn-tunnels' -ScriptBlock { Write-PodeJsonResponse -Value (Get-FortiGateVpnTunnels) }
    Add-PodeRoute -Method Get -Path '/api/fortigate/vpn-users' -ScriptBlock { Write-PodeJsonResponse -Value (Get-FortiGateVpnUsers) }
    Add-PodeRoute -Method Get -Path '/api/fortigate/connected-devices' -ScriptBlock { Write-PodeJsonResponse -Value (Get-FortiGateConnectedDevices) }
    Add-PodeRoute -Method Get -Path '/api/fortigate/security-events' -ScriptBlock { Write-PodeJsonResponse -Value (Get-FortiGateSecurityEvents) }
}
