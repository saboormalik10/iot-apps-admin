<#
.SYNOPSIS
  Back up the weather station now (the daily task does the same at night).

.EXAMPLE
  backup-now.cmd
  backup-now.cmd -To E:\WeatherBackups
#>
[CmdletBinding()]
param(
    # Somewhere else for this one backup, e.g. a USB drive. Default: BACKUP_DIR.
    [string]$To = ''
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Observator.psm1') -Force -DisableNameChecking
Assert-Admin
$L = Get-InstalledLayout
Write-Step 'Backing up the database, uploads and settings'
$label = 'manual'
$keep = 0
if ($To) { $keep = 1000 }
$folder = Invoke-Backup $L $To $keep $label
Write-Ok "backup written: $folder"
