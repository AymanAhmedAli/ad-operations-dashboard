@{
    # ---------------------------------------------------------------------
    # IT Operations Hub - backend configuration.
    # This file must stay plain, static data (Import-PowerShellDataFile
    # refuses anything else) - no real credentials belong here either way.
    # Every value below is overridden by an environment variable at startup
    # if one is set (see server.ps1) - set those in your actual deployment
    # (IIS app pool env vars, a systemd unit, Azure App Service configuration,
    # etc.) rather than editing this file with real values.
    # ---------------------------------------------------------------------

    Server = @{
        Address = '0.0.0.0'
        Port    = 8081
        # In production, put this behind Entra ID Application Proxy rather
        # than exposing it directly to the internet.
    }

    ActiveDirectory = @{
        # Domain to query, e.g. 'contoso.local'. Overridden by ITHUB_AD_DOMAIN.
        # Requires the host running this server to have the ActiveDirectory
        # PowerShell module (RSAT) installed and reach a domain controller.
        Domain = ''
    }

    FortiGate = @{
        # Overridden by ITHUB_FORTIGATE_BASE_URL, e.g. 'https://10.0.0.1:443'.
        BaseUrl  = ''
        # Overridden by ITHUB_FORTIGATE_API_TOKEN. Generate from the
        # FortiGate admin UI (System > Administrators > REST API Admin).
        # NEVER put a real token in this file - set the environment
        # variable on the host running this server instead.
        ApiToken = ''
        # Set to $false only for lab/test devices with self-signed certs.
        ValidateCertificate = $true
    }

    Database = @{
        # SQL Server Express connection string, overridden by
        # ITHUB_DB_CONNECTION_STRING. Prefer integrated security
        # (Trusted_Connection) when the app runs as a domain/service account
        # with DB access, so no password ever needs to live in config at all.
        # The value below is a local-development default only.
        ConnectionString = 'Server=localhost\SQLEXPRESS;Database=ITOperationsHub;Trusted_Connection=True;TrustServerCertificate=True;'
    }

    # Printer inventory + SNMP settings live in their own file -
    # see config/printers.psd1.
}
