@{
    # SNMP community string used for every printer below (read-only GET/WALK
    # only - this backend never does an SNMP SET). Overridden by
    # ITHUB_SNMP_COMMUNITY.
    Community = 'public'

    # Per-request timeout in milliseconds. A printer that doesn't answer
    # within this window is reported as offline, not as an error.
    TimeoutMs = 1500

    # One entry per physical printer to poll. IP is required; everything
    # else here is inventory metadata SNMP itself can't tell us (department,
    # location, friendly name) - live fields (online/toner/page count) are
    # polled fresh on every request.
    #
    # Example:
    # Printers = @(
    #     @{ name = 'PRN-FIN-01'; ip = '192.168.10.31'; port = 161; manufacturer = 'HP'; model = 'LaserJet Ent M507'; department = 'Finance'; location = 'HQ - 2nd Floor' }
    # )
    Printers = @()
}
