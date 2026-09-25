<#
.SYNOPSIS
  The nightly job (scheduled at install): back up, then tidy old logs.
  Runs as SYSTEM; its own log is logs\maintenance.log.
#>
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Observator.psm1') -Force -DisableNameChecking
$L = Get-InstalledLayout
$log = Join-Path $L.LogDir 'maintenance.log'
function Log([string]$s) { Add-Content -Path $log -Value ("{0}  {1}" -f (Get-Date -Format 's'), $s) }

try {
    $folder = Invoke-Backup $L
    Log "backup ok: $folder"
} catch {
    Log "BACKUP FAILED: $($_.Exception.Message)"
}

try {
    # The database keeps one log file open; start a new one each night, and keep
    # a month of the old ones.
    $code = Invoke-NodeScript $L 'dist\scripts\rotate-db-log.js'
    if ($code -ne 0) { Log "database log rotation exit $code" }
    Get-ChildItem -Path $L.LogDir -Filter 'mongod.log.*' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
    Get-ChildItem -Path $L.LogDir -Filter 'install-*.log' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-365) } | Remove-Item -Force
    # This log itself: keep it short.
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) {
        $tail = Get-Content -Path $log -Tail 2000
        Set-Content -Path $log -Value $tail
    }
} catch {
    Log "TIDY FAILED: $($_.Exception.Message)"
}

try {
    $drive = (Get-Item $L.DataDir).PSDrive
    $freeGB = [math]::Round($drive.Free / 1GB, 1)
    if ($freeGB -lt 5) { Log "LOW DISK: $freeGB GB free on $($drive.Name):" }
} catch {
    Log "disk check failed: $($_.Exception.Message)"
}
