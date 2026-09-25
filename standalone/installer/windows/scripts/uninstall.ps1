<#
.SYNOPSIS
  Remove the weather station services from this PC. The DATA IS KEPT unless
  -RemoveData is given (and confirmed by typing DELETE).

.DESCRIPTION
  Stops and removes the three services, the firewall rules and the daily task.
  The program folder can then be deleted by hand. The data folder (every reading,
  the settings, the backups) stays where it is, so a later install - pointed at
  the same data folder - carries on with all of it.
#>
[CmdletBinding()]
param(
    [switch]$RemoveData
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Observator.psm1') -Force -DisableNameChecking
Assert-Admin
$record = Get-InstallRecord
if ($null -eq $record) {
    Write-Caution 'No install record found; removing whatever services and rules exist.'
    $L = Get-Layout (Split-Path -Parent $PSScriptRoot) 'C:\ObservatorData'
} else {
    $L = Get-Layout $record.InstallDir $record.DataDir
}

Write-Step 'Removing services, firewall rules and the daily task'
Uninstall-Services $L
Remove-FirewallRules
Write-Ok 'firewall rules removed'
Unregister-MaintenanceTask
Write-Ok 'daily task removed'
Remove-InstallRecord

if ($RemoveData) {
    Write-Host ''
    Write-Host "This DELETES every reading, the settings and the backups in $($L.DataDir)." -ForegroundColor Red
    if ((Read-Host 'Type DELETE to remove the data too') -ceq 'DELETE') {
        Remove-Item -Path $L.DataDir -Recurse -Force
        Write-Ok "$($L.DataDir) deleted"
    } else {
        Write-Note 'Data kept.'
    }
} else {
    Write-Note "Data kept in $($L.DataDir)."
}
Write-Host ''
Write-Host "Removed. You can now delete $($L.InstallDir) (close this window first)." -ForegroundColor Green
