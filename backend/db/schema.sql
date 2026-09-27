-- IT Operations Hub - SQL Server Express schema
-- Run once against a new database, e.g.:
--   sqlcmd -S localhost\SQLEXPRESS -i schema.sql
-- or from PowerShell:
--   Invoke-Sqlcmd -ServerInstance 'localhost\SQLEXPRESS' -InputFile 'db/schema.sql'

IF DB_ID('ITOperationsHub') IS NULL
BEGIN
    CREATE DATABASE ITOperationsHub;
END
GO

USE ITOperationsHub;
GO

IF OBJECT_ID('dbo.TonerItems', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TonerItems (
        Id           NVARCHAR(20)   NOT NULL PRIMARY KEY,
        Manufacturer NVARCHAR(100)  NOT NULL,
        Model        NVARCHAR(150)  NOT NULL,
        Compatible   NVARCHAR(150)  NOT NULL,
        Qty          INT            NOT NULL DEFAULT 0,
        MinQty       INT            NOT NULL DEFAULT 0,
        UnitCost     DECIMAL(10,2)  NOT NULL DEFAULT 0,
        Location     NVARCHAR(150)  NOT NULL,
        CreatedAt    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID('dbo.TonerTransactions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TonerTransactions (
        Id           NVARCHAR(20)   NOT NULL PRIMARY KEY,
        ItemId       NVARCHAR(20)   NOT NULL REFERENCES dbo.TonerItems(Id),
        [Type]       NVARCHAR(30)   NOT NULL,   -- Issue | Receive | Return | Adjustment (+/-)
        Model        NVARCHAR(150)  NOT NULL,   -- denormalized manufacturer+model at time of transaction
        Qty          INT            NOT NULL,
        Delta        INT            NOT NULL,   -- signed change applied to stock
        Printer      NVARCHAR(150)  NULL,
        Department   NVARCHAR(100)  NULL,
        IssuedTo     NVARCHAR(150)  NULL,
        LoggedBy     NVARCHAR(200)  NOT NULL,   -- the requesting user's email
        Notes        NVARCHAR(500)  NULL,
        CreatedAt    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID('dbo.TonerItems', 'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.TonerItems)
BEGIN
    -- Seed with the same starting inventory used by the frontend's demo data,
    -- so behavior matches exactly on first run against a fresh database.
    INSERT INTO dbo.TonerItems (Id, Manufacturer, Model, Compatible, Qty, MinQty, UnitCost, Location) VALUES
        ('t1', N'HP',      N'CF287A (87A)',            N'LaserJet Ent M507',      6, 4, 95.00,  N'IT Storeroom - HQ'),
        ('t2', N'Canon',   N'C-EXV51 Toner',           N'imageRUNNER C3226i',     2, 3, 140.00, N'IT Storeroom - HQ'),
        ('t3', N'Brother', N'TN-3480',                 N'HL-L6400DW',             5, 3, 75.00,  N'IT Storeroom - HQ'),
        ('t4', N'HP',      N'CF287X (High Yield)',     N'LaserJet Ent M507',      0, 2, 130.00, N'IT Storeroom - HQ'),
        ('t5', N'Canon',   N'C-EXV51 Drum Unit',       N'imageRUNNER C3226i',     1, 2, 210.00, N'IT Storeroom - HQ'),
        ('t6', N'Brother', N'TN-3480 (Spare)',         N'HL-L6400DW',             4, 2, 75.00,  N'Warehouse Store'),
        ('t7', N'Generic', N'Waste Toner Box',         N'LaserJet Ent M507',      3, 2, 35.00,  N'IT Storeroom - HQ'),
        ('t8', N'HP',      N'CF230A (Legacy)',         N'LaserJet Pro (legacy)',  8, 2, 60.00,  N'Warehouse Store');
END
GO
