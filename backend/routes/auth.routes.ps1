<#
    Authentication routes.
    POST /api/auth/login    { username, password }
    POST /api/auth/logout
    GET  /api/auth/me
#>

function Register-AuthRoutes {

    Add-PodeRoute -Method Post -Path '/api/auth/login' -ScriptBlock {
        try {
            $username = $WebEvent.Data.username
            $password = $WebEvent.Data.password

            if([string]::IsNullOrWhiteSpace($username) -or [string]::IsNullOrWhiteSpace($password)){
                Write-PodeJsonResponse -StatusCode 400 -Value @{
                    success = $false
                    error   = 'Username and password are required.'
                }
                return
            }

            $result = Test-AdCredentials -Username $username -Password $password

            if($result.success){
                $WebEvent.Session.Data.user = @{
                    username    = $result.username
                    displayName = $result.displayName
                    email       = $result.email
                    department  = $result.department
                    loginTime   = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
                }
                Save-PodeSession -Force

                Add-AuditLog -Username $result.username -Action 'LOGIN' -Details 'User logged in successfully'

                Write-PodeJsonResponse -Value @{
                    success     = $true
                    username    = $result.username
                    displayName = $result.displayName
                    email       = $result.email
                }
            } else {
                Add-AuditLog -Username $username -Action 'LOGIN_FAILED' -Details $result.error

                Write-PodeJsonResponse -StatusCode 401 -Value @{
                    success = $false
                    error   = $result.error
                }
            }
        } catch {
            Write-PodeJsonResponse -StatusCode 500 -Value @{
                success = $false
                error   = "DEBUG: $($_.Exception.Message)"
                trace   = "$($_.ScriptStackTrace)"
            }
        }
    }

    Add-PodeRoute -Method Post -Path '/api/auth/logout' -ScriptBlock {
        $user = $WebEvent.Session.Data.user
        if($user){
            Add-AuditLog -Username $user.username -Action 'LOGOUT' -Details 'User logged out'
        }
        $WebEvent.Session.Data.Remove('user')
        Save-PodeSession -Force
        Write-PodeJsonResponse -Value @{ success = $true }
    }

    Add-PodeRoute -Method Get -Path '/api/auth/me' -ScriptBlock {
        $user = $WebEvent.Session.Data.user
        if($user){
            Write-PodeJsonResponse -Value @{
                success     = $true
                username    = $user.username
                displayName = $user.displayName
                email       = $user.email
                loginTime   = $user.loginTime
            }
        } else {
            Write-PodeJsonResponse -StatusCode 401 -Value @{
                success = $false
                error   = 'Not authenticated.'
            }
        }
    }
}
