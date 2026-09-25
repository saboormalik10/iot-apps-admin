<#
.SYNOPSIS
  Is the weather station working? Services, ports, the sensor, the last backup.
#>
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Observator.psm1') -Force -DisableNameChecking
$record = Get-InstallRecord
if ($null -eq $record) { throw 'The weather station software is not installed on this PC.' }
$L = Get-Layout $record.InstallDir $record.DataDir
$cfg = Read-EnvFile $L.ConfigFile

Write-Host "Observator Weather Station $($record.Version)" -ForegroundColor White
Write-Host "  program  $($L.InstallDir)"
Write-Host "  data     $($L.DataDir)"

Write-Step 'Services'
foreach ($id in @('ObservatorDB', 'ObservatorAPI', 'ObservatorWeb')) {
    $s = Get-Service -Name $id -ErrorAction SilentlyContinue
    if ($null -eq $s) { Write-Caution "$id is not registered"; continue }
    $line = "{0,-14} {1}" -f $id, $s.Status
    if ($s.Status -eq 'Running') { Write-Ok $line } else { Write-Caution $line }
}

Write-Step 'Health'
try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$($cfg['PORT'])/health" -TimeoutSec 5
    Write-Ok "API: $($h.status), database $($h.db), up $([math]::Round($h.uptime / 3600, 1)) h"
    if ($null -ne $h.PSObject.Properties['stream'] -and $null -ne $h.stream) {
        $st = $h.stream
        if ($st.connected) { Write-Ok "sensor: connected, $($st.readingsLastMinute) reading(s) in the last minute" }
        elseif ($st.mode -eq 'connect') { Write-Caution "sensor: not connected - dialling $($st.remote)" }
        else { Write-Caution "sensor: not connected - waiting on port $($st.port)" }
        if ($st.lastReadingAt) { Write-Note "last reading: $($st.lastReadingAt)" }
    }
} catch {
    Write-Caution "API not answering: $($_.Exception.Message)"
}
if (Wait-Http "http://127.0.0.1:$($cfg['WEB_PORT'])/login" 5) { Write-Ok "portal answering on port $($cfg['WEB_PORT'])" } else { Write-Caution 'portal not answering' }
Write-Note ('open it at: ' + ((Get-PortalUrls ([int]$cfg['WEB_PORT'])) -join '  '))

Write-Step 'Backup and disk'
$last = Join-Path $L.LogDir 'backup-last.json'
if (Test-Path $last) {
    $b = Get-Content -Raw $last | ConvertFrom-Json
    if ($b.ok) { Write-Ok "last backup: $($b.at) ($([math]::Round($b.bytes / 1MB, 1)) MB) $($b.path)" } else { Write-Caution "last backup FAILED at $($b.at): $($b.error)" }
} else {
    Write-Caution 'no backup yet'
}
$drive = (Get-Item $L.DataDir).PSDrive
Write-Note ("free space on {0}: {1} GB" -f $drive.Name, [math]::Round($drive.Free / 1GB, 1))

$err = Join-Path $L.LogDir 'ObservatorAPI.err.log'
if ((Test-Path $err) -and (Get-Item $err).Length -gt 0) {
    Write-Step 'Latest API errors'
    Get-Content -Path $err -Tail 5 | ForEach-Object { Write-Note $_ }
}
