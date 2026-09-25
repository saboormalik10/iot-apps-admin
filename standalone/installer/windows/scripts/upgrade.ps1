<#
.SYNOPSIS
  Upgrade the installed weather station software to THIS release, keeping all data.

.DESCRIPTION
  Unpack the new release anywhere (not over the installed one) and run its
  upgrade.cmd as administrator. It:

    1. backs up the database (unless -SkipBackup);
    2. stops the services, sets the installed program folder aside as
       <folder>.previous and copies this release in its place;
    3. adds any settings the new release introduced (existing ones are kept),
       re-registers the services, and prepares the database;
    4. starts everything and checks each part answers.

  If anything fails after step 2 the previous version is put back and started,
  so the site is never left without a working install. The data folder is never
  moved or changed except by the database itself.
#>
[CmdletBinding()]
param(
    [switch]$SkipBackup
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Observator.psm1') -Force -DisableNameChecking

$ReleaseDir = Split-Path -Parent $PSScriptRoot
$NewVersion = Get-ReleaseVersion $ReleaseDir
Write-Host "Observator Weather Station - upgrade to $NewVersion" -ForegroundColor White

Write-Step 'Checking'
Assert-Windows64
Assert-Admin
$record = Get-InstallRecord
if ($null -eq $record) { throw 'Nothing is installed here yet - run install.cmd instead.' }
$L = Get-Layout $record.InstallDir $record.DataDir
if ($ReleaseDir.TrimEnd('\') -ieq $L.InstallDir.TrimEnd('\')) {
    throw "Run upgrade.cmd from the NEW release's folder, not from $($L.InstallDir)."
}
Write-Ok "installed: $($record.Version) in $($L.InstallDir), data in $($L.DataDir)"
Write-Ok ("new database program: " + (Assert-MongoCanRun (Get-Layout $ReleaseDir $L.DataDir)))
Start-Transcript -Path (Join-Path $L.LogDir ("upgrade-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))) | Out-Null

if (-not $SkipBackup) {
    Write-Step 'Backup before upgrading'
    $svc = Get-Service -Name 'ObservatorDB' -ErrorAction SilentlyContinue
    if ($null -ne $svc -and $svc.Status -ne 'Running') { Start-ObservatorService 'ObservatorDB'; [void](Wait-TcpPort '127.0.0.1' 27017 90) }
    $b = Invoke-Backup $L '' 5 'before-upgrade'
    Write-Ok $b
}

Write-Step 'Stopping the services'
Stop-ObservatorServices

$previous = "$($L.InstallDir).previous"
Write-Step "Setting the installed version aside ($previous)"
if (Test-Path $previous) { Remove-Item -Path $previous -Recurse -Force }
try {
    Move-Item -Path $L.InstallDir -Destination $previous
} catch {
    Write-Caution "Could not move $($L.InstallDir): $($_.Exception.Message)"
    Write-Caution 'Close any window or program using that folder and try again. Starting the installed version again.'
    Start-ObservatorServices $L
    throw
}

function Install-Here([string]$From) {
    New-Item -ItemType Directory -Path $L.InstallDir -Force | Out-Null
    & robocopy.exe $From $L.InstallDir /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying failed (robocopy $LASTEXITCODE)." }
    # Installed from the setup program? Keep its uninstaller, which lives in the
    # program folder - without it Windows' "Apps" list would point at nothing.
    foreach ($u in @(Get-ChildItem -Path $previous -Filter 'unins*.*' -File -ErrorAction SilentlyContinue)) {
        Copy-Item -Path $u.FullName -Destination (Join-Path $L.InstallDir $u.Name) -Force
    }
    Get-ChildItem -Path $L.InstallDir -Recurse -File | Unblock-File
    Write-MongodConfig $L
    Uninstall-Services $L
    Install-Services $L
    Set-FolderSecurity $L
}

try {
    Write-Step "Installing $NewVersion"
    Install-Here $ReleaseDir
    $added = Add-MissingSettings $L.ConfigFile $L.Template $NewVersion
    foreach ($a in $added) { Write-Ok "new setting: $($a.Split('=')[0])" }

    Write-Step 'Database'
    Start-ObservatorService 'ObservatorDB'
    if (-not (Wait-TcpPort '127.0.0.1' 27017 90)) { throw "The database did not start. See $($L.LogDir)\mongod.log." }
    $code = Invoke-NodeScript $L 'dist\scripts\setup-site.js'
    if ($code -eq 1) { throw 'Preparing the database failed - see the messages above.' }

    Write-Step 'Starting'
    Start-ObservatorServices $L
    Register-MaintenanceTask $L
    Set-InstallRecord $L.InstallDir $L.DataDir $NewVersion
} catch {
    $why = $_.Exception.Message
    Write-Host ''
    Write-Caution "The upgrade failed: $why"
    Write-Caution "Putting $($record.Version) back."
    Stop-ObservatorServices
    $failed = "$($L.InstallDir).failed-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    if (Test-Path $L.InstallDir) { Move-Item -Path $L.InstallDir -Destination $failed }
    Move-Item -Path $previous -Destination $L.InstallDir
    Write-MongodConfig $L
    Uninstall-Services $L
    Install-Services $L
    Start-ObservatorServices $L
    Write-Caution "$($record.Version) is running again. The failed attempt is in $failed; the log is in $($L.LogDir)."
    Stop-Transcript | Out-Null
    exit 1
}

Write-Host ''
Write-Host "Upgraded to $NewVersion. Everything is running." -ForegroundColor Green
Write-Host "The previous version is kept in $previous - delete it once you are happy."
Stop-Transcript | Out-Null
