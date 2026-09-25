<#
.SYNOPSIS
  Put a backup back - REPLACES everything in the database with the backup's copy.

.DESCRIPTION
  Stops the API and the portal, takes a safety backup of what is there now, then
  restores the database (and the uploaded files) from the backup folder given, and
  starts everything again. Readings received after the backup was taken are lost
  unless restored from the safety backup.

.EXAMPLE
  restore.cmd -From "C:\ObservatorData\backups\observator-20260922-023000-daily"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$From
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Observator.psm1') -Force -DisableNameChecking
Assert-Admin
$L = Get-InstalledLayout

$archive = Join-Path $From 'database.archive.gz'
if (-not (Test-Path $archive)) { throw "No database.archive.gz in '$From' - give the backup's folder." }

Write-Host ''
Write-Host "This REPLACES the weather station's database with the backup in:" -ForegroundColor Yellow
Write-Host "  $From" -ForegroundColor Yellow
if ((Read-Host 'Type RESTORE to continue') -cne 'RESTORE') { Write-Host 'Nothing changed.'; exit 1 }

Write-Step 'Safety backup of the database as it is now'
$safety = Invoke-Backup $L '' 5 'before-restore'
Write-Ok $safety

Write-Step 'Stopping the API and the portal'
foreach ($id in @('ObservatorWeb', 'ObservatorAPI')) {
    $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
    if ($null -ne $svc -and $svc.Status -ne 'Stopped') { Stop-Service -Name $id -Force; $svc.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(120)) }
}

Write-Step 'Restoring'
$out = & $L.Mongorestore '--uri=mongodb://127.0.0.1:27017/?directConnection=true' '--gzip' "--archive=$archive" '--drop' '--nsInclude=observator_standalone.*' 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Caution ($out | Select-Object -Last 5 | Out-String)
    throw "The restore failed ($LASTEXITCODE). The safety backup is $safety."
}
Write-Ok 'database restored'
$uploads = Join-Path $From 'uploads'
if (Test-Path $uploads) {
    & robocopy.exe $uploads $L.UploadsDir /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    Write-Ok 'uploaded files restored'
}

Write-Step 'Starting'
Start-ObservatorServices $L
Write-Ok "Done. The safety backup of the data before this restore: $safety"
