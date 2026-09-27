<#
    Knowledge Base routes.
    GET /api/knowledge-base/articles
    GET /api/knowledge-base/categories
    GET /api/knowledge-base/articles/:code
    GET /api/knowledge-base/articles/:code/related
    GET /api/knowledge-base/search?q=...
#>
function Register-KnowledgeBaseRoutes {
    Add-PodeRoute -Method Get -Path '/api/knowledge-base/articles' -ScriptBlock {
        Write-PodeJsonResponse -Value @(Get-KbArticles)
    }
    Add-PodeRoute -Method Get -Path '/api/knowledge-base/categories' -ScriptBlock {
        Write-PodeJsonResponse -Value @(Get-KbCategories)
    }
    Add-PodeRoute -Method Get -Path '/api/knowledge-base/articles/:code' -ScriptBlock {
        $article = Get-KbArticleByCode -Code $WebEvent.Parameters['code']
        if($article){ Write-PodeJsonResponse -Value $article }
        else { Write-PodeJsonResponse -StatusCode 404 -Value @{ error = 'Article not found.' } }
    }
    Add-PodeRoute -Method Get -Path '/api/knowledge-base/articles/:code/related' -ScriptBlock {
        Write-PodeJsonResponse -Value @(Get-KbRelatedArticles -Code $WebEvent.Parameters['code'])
    }
    Add-PodeRoute -Method Get -Path '/api/knowledge-base/search' -ScriptBlock {
        $q = $WebEvent.Query['q']
        if([string]::IsNullOrWhiteSpace($q)){
            Write-PodeJsonResponse -Value @()
            return
        }
        Write-PodeJsonResponse -Value @(Search-KbArticles -Query $q)
    }
}
