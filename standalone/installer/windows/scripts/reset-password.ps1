<#
.SYNOPSIS
  Set a user's password from this PC - for when nobody who can sign in remembers
  an administrator password. Sitting at the station PC is the authority.

.EXAMPLE
  reset-password.cmd -List
  reset-password.cmd -Email tech@site.local
#>
[CmdletBinding()]
param(
    [string]$Email,
    [switch]$List
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Observator.psm1') -Force -DisableNameChecking
Assert-Admin
$L = Get-InstalledLayout

if ($List -or -not $Email) {
    [void](Invoke-NodeScript $L 'dist\scripts\reset-password.js' @('--list'))
    if ($List) { exit 0 }
    $Email = Read-Host 'Email of the account to reset'
}
$p1 = Read-Host 'New password (at least 8 characters)' -AsSecureString
$p2 = Read-Host 'Type it again' -AsSecureString
$plain = ConvertFrom-SecureText $p1
if ($plain -cne (ConvertFrom-SecureText $p2)) { throw 'The two passwords differ.' }
try {
    # In the environment of that one process, never on its command line.
    $code = Invoke-NodeScript $L 'dist\scripts\reset-password.js' @($Email) @{ RESET_PASSWORD = $plain }
} finally {
    $plain = $null
}
exit $code
