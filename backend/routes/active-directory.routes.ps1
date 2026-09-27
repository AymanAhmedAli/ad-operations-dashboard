<#
    Active Directory routes.
    GET  /api/active-directory/users
    GET  /api/active-directory/computers
    GET  /api/active-directory/insights
    POST /api/active-directory/ask                { question }
    POST /api/active-directory/users/:username/unlock   (extra: wires KB-AD-001 to a real action)
#>
function Register-ActiveDirectoryRoutes {
    Add-PodeRoute -Method Get -Path '/api/active-directory/users' -ScriptBlock {
        Write-PodeJsonResponse -Value (Get-AdUsers)
    }
    Add-PodeRoute -Method Get -Path '/api/active-directory/computers' -ScriptBlock {
        Write-PodeJsonResponse -Value (Get-AdComputers)
    }
    Add-PodeRoute -Method Get -Path '/api/active-directory/insights' -ScriptBlock {
        $insights = Get-AdInsights
        if($insights){
            Write-PodeJsonResponse -Value @{ available = $true; error = $null; data = $insights }
        } else {
            Write-PodeJsonResponse -Value @{ available = $false; error = 'Active Directory is not available from this server.'; data = $null }
        }
    }
    Add-PodeRoute -Method Post -Path '/api/active-directory/ask' -ScriptBlock {
        $question = $WebEvent.Data.question
        if([string]::IsNullOrWhiteSpace($question)){
            Write-PodeJsonResponse -StatusCode 400 -Value @{ error = 'Missing "question" in request body.' }
            return
        }
        $insights = Get-AdInsights
        if(-not $insights){
            Write-PodeJsonResponse -Value @{ text = 'Active Directory is not available from this server.'; rows = @() }
            return
        }
        $s = $question.ToLower()
        $result =
            if($s -like '*locked*'){ @{ text = "$($insights.locked.Count) account(s) currently locked."; rows = $insights.locked } }
            elseif($s -like '*disabled*'){ @{ text = "$($insights.disabled.Count) disabled user(s)."; rows = $insights.disabled } }
            elseif($s -like '*expir*' -or $s -like '*password*'){ @{ text = "$($insights.expiring7.Count) password(s) expiring within 7 days."; rows = $insights.expiring7 } }
            elseif($s -like '*computer*' -and $s -like '*inactive*'){ @{ text = "$($insights.inactiveComputers30.Count) computer(s) inactive for more than 30 days."; rows = $insights.inactiveComputers30 } }
            elseif($s -like '*inactive*'){ @{ text = "$($insights.inactiveUsers30.Count) user(s) inactive for more than 30 days."; rows = $insights.inactiveUsers30 } }
            else { @{ text = 'No data is currently available for this item, or the question was not recognized.'; rows = @() } }
        Write-PodeJsonResponse -Value $result
    }
    Add-PodeRoute -Method Post -Path '/api/active-directory/users/:username/unlock' -ScriptBlock {
        $username = $WebEvent.Parameters['username']
        $result = Unlock-AdUserAccount -Username $username

        # Log who performed the unlock (the logged-in admin), not the
        # account that got unlocked — the target is in Details instead.
        $actor = $WebEvent.Session.Data.user
        $actorName = if($actor){ $actor.username } else { 'unknown' }
        Add-AuditLog -Username $actorName -Action 'UNLOCK_USER' -Details "Unlocked account: $username"

        Write-PodeJsonResponse -Value $result
    }
}
