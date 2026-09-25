<#
.SYNOPSIS
  Install the Observator Weather Station software on this PC.

.DESCRIPTION
  Run install.cmd as administrator (it runs this). Unpack the release anywhere;
  it is copied to -InstallDir. What it does:

    1. checks the PC: 64-bit Windows, administrator, a processor MongoDB can run
       on, and that the ports are free;
    2. copies the program to -InstallDir (default C:\Observator) and creates the
       data folder -DataDir (default C:\ObservatorData): settings, database, logs,
       backups, uploads;
    3. writes the settings file with fresh secrets, and the database settings;
    4. registers three Windows services - database, API, portal - that start at
       boot and restart after a crash, running as the low-privilege LocalService
       account;
    5. prepares the database and creates the first administrator (the password is
       given to that one step and never written to disk);
    6. starts everything, checks each part answers, opens the firewall for the
       portal (and the sensor port when the converter connects in), and schedules
       the daily backup.

  Run it again after a failure: every step checks what is already done.

.EXAMPLE
  install.cmd
  Asks for the administrator's email and password, and uses the defaults.

.EXAMPLE
  install.cmd -AdminEmail tech@site.local -StreamMode connect -ConverterHost 192.168.1.50
#>
[CmdletBinding()]
param(
    [string]$InstallDir = 'C:\Observator',
    [string]$DataDir = 'C:\ObservatorData',
    [string]$AdminEmail,
    [Security.SecureString]$AdminPassword,
    # Unattended (the setup program's silent mode): take the first administrator's
    # password from OBSERVATOR_ADMIN_PASSWORD instead of asking for it. Keeps it off
    # this script's command line, where other programs on the PC could read it.
    [switch]$AdminPasswordFromEnvironment,
    [string]$SiteName = 'Weather Station',
    [string]$StationName = 'GMX551 Station',
    # An IANA zone such as Australia/Melbourne. Empty = this PC's own time zone.
    [string]$TimeZone = '',
    [int]$WebPort = 3201,
    [ValidateSet('listen', 'connect')][string]$StreamMode = 'listen',
    [int]$StreamPort = 4000,
    # connect mode: the converter's address.
    [string]$ConverterHost = '',
    # Who may reach the portal and the sensor port: LocalSubnet, Any, or addresses/ranges.
    [string[]]$AllowFrom = @('LocalSubnet'),
    [string]$BackupAt = '02:30'
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Observator.psm1') -Force -DisableNameChecking

$ReleaseDir = Split-Path -Parent $PSScriptRoot
$Version = Get-ReleaseVersion $ReleaseDir
$InstallDir = [IO.Path]::GetFullPath($InstallDir)
$DataDir = [IO.Path]::GetFullPath($DataDir)

Write-Host "Observator Weather Station $Version - installation" -ForegroundColor White

# ---------------------------------------------------------------------------
Write-Step 'Checking this PC'
Assert-Windows64
Assert-Admin
if ($InstallDir.TrimEnd('\') -ieq $DataDir.TrimEnd('\') -or $DataDir.StartsWith($InstallDir.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Keep the data folder outside the program folder: upgrades replace the program folder.'
}
$existing = Get-InstallRecord
if ($null -ne $existing) {
    if ($existing.InstallDir -ine $InstallDir) {
        throw "Already installed in $($existing.InstallDir). To update it, run upgrade.cmd from the new release."
    }
    Write-Note "An earlier attempt was found; continuing it."
}
$releaseLayout = Get-Layout $ReleaseDir $DataDir
Write-Ok ("database program: " + (Assert-MongoCanRun $releaseLayout))

$ports = @{ $WebPort = 'portal'; 3200 = 'API'; 27017 = 'database' }
if ($StreamMode -eq 'listen') { $ports[$StreamPort] = 'sensor stream' }
foreach ($p in $ports.Keys) {
    $l = Get-PortListener $p
    if ($null -ne $l) {
        $owner = (Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        if ($owner -notin @('mongod', 'node')) { throw "Port $p (for the $($ports[$p])) is in use by '$owner'. Free it, or choose another port." }
    }
}
Write-Ok 'ports are free'
if ($StreamMode -eq 'connect' -and -not $ConverterHost) { throw 'StreamMode connect needs -ConverterHost (the converter''s address).' }

# ---------------------------------------------------------------------------
# An install that is already set up has its own administrators (and a way to reset
# a password at the PC), so nothing is asked for here - re-running this must never
# imply creating another one.
$alreadySetUp = Test-Path (Join-Path $DataDir 'config\observator.env')
if ($alreadySetUp -and -not $AdminEmail) {
    Write-Step 'Administrators'
    Write-Note 'This PC is already set up; its existing accounts are kept.'
} else {
    Write-Step 'The first administrator'
    if (-not $AdminEmail -and -not $AdminPasswordFromEnvironment) { $AdminEmail = Read-Host 'Administrator email' }
    $AdminEmail = $AdminEmail.Trim()
    if ($AdminEmail -notmatch '^[^@\s]+@[^@\s]+$') { throw "'$AdminEmail' is not an email address." }
    if ($null -eq $AdminPassword -and $AdminPasswordFromEnvironment) {
        $fromEnv = $env:OBSERVATOR_ADMIN_PASSWORD
        if ([string]::IsNullOrEmpty($fromEnv)) { throw 'OBSERVATOR_ADMIN_PASSWORD is not set, and -AdminPasswordFromEnvironment was given.' }
        $AdminPassword = ConvertTo-SecureString $fromEnv -AsPlainText -Force
        $fromEnv = $null
        $env:OBSERVATOR_ADMIN_PASSWORD = $null
}
if ($null -eq $AdminPassword) {
    $AdminPassword = Read-Host 'Administrator password (at least 8 characters)' -AsSecureString
    $again = Read-Host 'Type it again' -AsSecureString
    if ((ConvertFrom-SecureText $AdminPassword) -cne (ConvertFrom-SecureText $again)) { throw 'The two passwords differ.' }
}
if ((ConvertFrom-SecureText $AdminPassword).Length -lt 8) { throw 'The password must be at least 8 characters.' }
Write-Ok $AdminEmail

}

# ---------------------------------------------------------------------------
Write-Step "Copying the program to $InstallDir"
if ($ReleaseDir.TrimEnd('\') -ine $InstallDir.TrimEnd('\')) {
    # A rerun after a failed attempt: its services may be running from here.
    Stop-ObservatorServices
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    # /E, not /MIR: never delete what an earlier attempt put there (the services'
    # own files live in services\).
    & robocopy.exe $ReleaseDir $InstallDir /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying failed (robocopy $LASTEXITCODE)." }
}
# Files from a downloaded zip are marked as from the internet; services and
# scripts must run them without a prompt.
Get-ChildItem -Path $InstallDir -Recurse -File | Unblock-File
$L = Get-Layout $InstallDir $DataDir
Write-Ok 'program copied'

foreach ($d in @($L.DataDir, $L.ConfigDir, $L.DbDir, $L.LogDir, $L.BackupDir, $L.UploadsDir)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
}
Start-Transcript -Path (Join-Path $L.LogDir ("install-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))) | Out-Null

# ---------------------------------------------------------------------------
Write-Step 'Settings'
if (Test-Path $L.ConfigFile) {
    Write-Note "keeping the existing $($L.ConfigFile)"
} else {
    $values = @{
        PORT = '3200'; API_HOST = '127.0.0.1'; NODE_ENV = 'production'
        MONGO_URI = 'mongodb://127.0.0.1:27017/observator_standalone?replicaSet=rs0&directConnection=true'
        JWT_ACCESS_SECRET = (New-Secret); JWT_REFRESH_SECRET = (New-Secret)
        SESSION_SECRET = (New-Secret); SWAGGER_PASSWORD = (New-Secret 12)
        FRONTEND_URL = "http://$($env:COMPUTERNAME.ToLower()):$WebPort"
        CORS_ORIGIN = "http://$($env:COMPUTERNAME.ToLower()):$WebPort"
        WEB_PORT = "$WebPort"; WEB_HOST = '0.0.0.0'; BACKEND_URL = 'http://127.0.0.1:3200/v1'
        SESSION_COOKIE_SECURE = 'false'
        STANDALONE_SITE_NAME = $SiteName; STANDALONE_STATION_NAME = $StationName
        STANDALONE_TIMEZONE = $TimeZone; STANDALONE_DATA_DIR = $L.DataDir
        STREAM_MODE = $StreamMode; STREAM_TCP_PORT = "$StreamPort"; STREAM_HOST = '0.0.0.0'
        STREAM_REMOTE_HOST = $ConverterHost; STREAM_REMOTE_PORT = "$StreamPort"
    }
    $text = Set-EnvValues ([IO.File]::ReadAllText($L.Template)) $values
    if ($text -match '(?m)^[A-Z0-9_]+=CHANGE_ME\s*$') { throw 'A setting was left as CHANGE_ME - the template changed; update the installer.' }
    Write-TextFile $L.ConfigFile $text
    Write-Ok "written: $($L.ConfigFile)"
}

Write-MongodConfig $L
Write-Ok "written: $($L.MongodCfg)"

Set-FolderSecurity $L
Write-Ok 'folder permissions set (settings: administrators and the services only)'

# ---------------------------------------------------------------------------
Write-Step 'Windows services'
Install-Services $L

Write-Step 'Database'
Start-ObservatorService 'ObservatorDB'
if (-not (Wait-TcpPort '127.0.0.1' 27017 90)) { throw "The database did not start. See $($L.LogDir)\mongod.log." }
Write-Ok 'database running'
# The first administrator's password reaches this one process and nothing else -
# never the settings file, never a command line. Nothing is passed when the site
# already has its accounts.
$plain = $null
try {
    if ($AdminEmail) {
        $plain = ConvertFrom-SecureText $AdminPassword
        $code = Invoke-NodeScript $L 'dist\scripts\setup-site.js' @() @{ STANDALONE_ADMIN_EMAIL = $AdminEmail; STANDALONE_ADMIN_PASSWORD = $plain }
    } else {
        $code = Invoke-NodeScript $L 'dist\scripts\setup-site.js'
    }
} finally {
    $plain = $null
}
if ($code -ne 0) { throw "Preparing the database failed (exit code $code) - see the messages above." }

Write-Step 'Starting the API and the portal'
Start-ObservatorServices $L

Write-Step 'Firewall and daily backup'
Set-FirewallRules $WebPort $StreamPort ($StreamMode -eq 'listen') $AllowFrom
Register-MaintenanceTask $L $BackupAt

Set-InstallRecord $InstallDir $DataDir $Version

# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '================================================================' -ForegroundColor Green
Write-Host " Installed. Open the portal from any PC on the site network:" -ForegroundColor Green
foreach ($u in (Get-PortalUrls $WebPort)) { Write-Host "     $u" -ForegroundColor Green }
Write-Host " Sign in as $(if ($AdminEmail) { $AdminEmail } else { 'an existing administrator' })." -ForegroundColor Green
Write-Host '================================================================' -ForegroundColor Green
if ($StreamMode -eq 'listen') {
    Write-Host " Sensor: set the converter to connect to this PC on TCP port $StreamPort."
} else {
    Write-Host " Sensor: this PC connects to the converter at ${ConverterHost}:$StreamPort."
}
Write-Host " Settings: $($L.ConfigFile)"
Write-Host " Logs:     $($L.LogDir)     Backups: $($L.BackupDir) (daily at $BackupAt)"
Write-Host " Status:   status.cmd       Forgotten password: reset-password.cmd"
Write-Host ''
Write-Host ' IMPORTANT: every reading is time-stamped with this PC''s clock. Keep Windows'
Write-Host ' time synchronisation on (Settings > Time & language > Set time automatically).'
Stop-Transcript | Out-Null
