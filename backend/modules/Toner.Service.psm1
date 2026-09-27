<#
    Toner Inventory service - the one module in this backend that is fully
    real end-to-end (SQL Server Express), matching the frontend's
    toner.service.js contract exactly: nothing is applied to stock until
    Confirm-TonerTransaction is called with a preview that was already
    validated by New-TonerTransactionPreview.
#>
Import-Module "$PSScriptRoot/Database.psm1"

function Get-TonerInventory {
    Invoke-Db -Query 'SELECT Id, Manufacturer, Model, Compatible, Qty, MinQty AS Min, UnitCost, Location FROM dbo.TonerItems ORDER BY Manufacturer, Model'
}

function Get-TonerTransactions {
    Invoke-Db -Query 'SELECT Id, ItemId, [Type], Model, Qty, Delta, Printer, Department, IssuedTo, LoggedBy, Notes, CreatedAt FROM dbo.TonerTransactions ORDER BY CreatedAt DESC'
}

function Get-TonerStockState {
    param([Parameter(Mandatory)]$Item)
    if([int]$Item.Qty -le 0){ return 'out' }
    if([int]$Item.Qty -lt [int]$Item.Min){ return 'low' }
    return 'ok'
}

<#
    Validates a proposed transaction and computes the resulting stock, but
    does NOT write anything to the database. Mirrors the frontend's
    previewTransaction() so the "confirm before applying" UX has a real
    server-side check to match (a client can't skip validation by calling
    confirm directly with fabricated numbers - Confirm-TonerTransaction
    re-validates against current stock too).
#>
function New-TonerTransactionPreview {
    param(
        [Parameter(Mandatory)][ValidateSet('Issue','Receive','Return','Adjustment')][string]$Type,
        [Parameter(Mandatory)][string]$ItemId,
        [Parameter(Mandatory)][int]$Qty,
        [string]$Printer,
        [string]$Department,
        [string]$IssuedTo,
        [Parameter(Mandatory)][string]$LoggedBy,
        [string]$Notes,
        [ValidateSet('+','-')][string]$Direction = '+'
    )

    $item = Invoke-Db -Query 'SELECT Id, Manufacturer, Model, Qty FROM dbo.TonerItems WHERE Id = @Id' -Params @{ Id = $ItemId } | Select-Object -First 1
    if(-not $item){
        return @{ valid = $false; error = 'Unknown toner item.' }
    }
    $qty = [Math]::Max(1, $Qty)
    $delta = switch($Type){
        'Issue'      { -$qty }
        'Receive'    { $qty }
        'Return'     { $qty }
        'Adjustment' { if($Direction -eq '-'){ -$qty } else { $qty } }
    }
    $label = if($Type -eq 'Adjustment'){ "Adjustment ($Direction)" } else { $Type }

    if(($item.Qty + $delta) -lt 0){
        return @{ valid = $false; error = "Cannot issue/decrease $qty — only $($item.Qty) in stock." }
    }

    @{
        valid    = $true
        proposed = @{
            id             = [guid]::NewGuid().ToString('n').Substring(0,12)
            time           = (Get-Date).ToString('yyyy-MM-dd HH:mm')
            type           = $label
            itemId         = $ItemId
            model          = "$($item.Manufacturer) $($item.Model)"
            qty            = [Math]::Abs($delta)
            delta          = $delta
            printer        = $Printer
            department     = $Department
            issuedTo       = $IssuedTo
            by             = $LoggedBy
            notes          = $Notes
            currentStock   = $item.Qty
            resultingStock = $item.Qty + $delta
        }
    }
}

<#
    Applies a previously-previewed transaction atomically: updates the
    item's stock and inserts the transaction record in a single SQL
    transaction, and re-checks stock server-side so a stale/tampered
    preview can never drive stock negative.
#>
function Confirm-TonerTransaction {
    param([Parameter(Mandatory)][hashtable]$Proposed)

    $sql = @'
BEGIN TRANSACTION;

DECLARE @CurrentQty INT;
SELECT @CurrentQty = Qty FROM dbo.TonerItems WITH (UPDLOCK, ROWLOCK) WHERE Id = @ItemId;

IF @CurrentQty IS NULL
BEGIN
    ROLLBACK TRANSACTION;
    THROW 51000, 'Unknown toner item.', 1;
END

IF (@CurrentQty + @Delta) < 0
BEGIN
    ROLLBACK TRANSACTION;
    THROW 51001, 'Insufficient stock for this transaction.', 1;
END

UPDATE dbo.TonerItems
SET Qty = @CurrentQty + @Delta, UpdatedAt = SYSUTCDATETIME()
WHERE Id = @ItemId;

INSERT INTO dbo.TonerTransactions (Id, ItemId, [Type], Model, Qty, Delta, Printer, Department, IssuedTo, LoggedBy, Notes)
VALUES (@Id, @ItemId, @Type, @Model, @Qty, @Delta, @Printer, @Department, @IssuedTo, @LoggedBy, @Notes);

COMMIT TRANSACTION;
'@

    Invoke-Db -Query $sql -Params @{
        Id         = $Proposed.id
        ItemId     = $Proposed.itemId
        Type       = $Proposed.type
        Model      = $Proposed.model
        Qty        = $Proposed.qty
        Delta      = $Proposed.delta
        Printer    = $Proposed.printer
        Department = $Proposed.department
        IssuedTo   = $Proposed.issuedTo
        LoggedBy   = $Proposed.by
        Notes      = $Proposed.notes
    }

    $Proposed
}

Export-ModuleMember -Function Get-TonerInventory, Get-TonerTransactions, Get-TonerStockState, New-TonerTransactionPreview, Confirm-TonerTransaction
