# Observator Weather Station - shared helpers for the install, upgrade and
# maintenance scripts.
#
# Windows PowerShell 5.1 (every Windows 10/11 and Server 2016+ has it), so none of
# the 7.x-only syntax. ASCII only: 5.1 reads a script without a byte-order mark as
# ANSI, and a UTF-8 dash or quote becomes a syntax error. The release build checks.

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:RegKey = 'HKLM:\SOFTWARE\Observator\WeatherStation'
$script:FirewallGroup = 'Observator Weather Station'
$script:TaskName = 'Observator Weather Station - daily maintenance'
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding $false
# Built-in accounts by SID, so the scripts work in any Windows language.
$script:SidAdmins = '*S-1-5-32-544'
$script:SidSystem = '*S-1-5-18'
$script:SidLocalService = '*S-1-5-19'
$script:SidUsers = '*S-1-5-32-545'

# ---------------------------------------------------------------------------
# Output

function Write-Step([string]$Text) { Write-Host ''; Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "    $Text" -ForegroundColor Green }
function Write-Note([string]$Text) { Write-Host "    $Text" }
function Write-Caution([string]$Text) { Write-Host "    WARNING: $Text" -ForegroundColor Yellow }

# ---------------------------------------------------------------------------
# Who, where

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-Admin {
    if (-not (Test-IsAdmin)) {
        throw 'This needs administrator rights. Right-click the .cmd file and choose "Run as administrator".'
    }
}

function Assert-Windows64 {
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'This software needs 64-bit Windows.' }
}

# Every path the scripts use, from the two folders chosen at install.
function Get-Layout([string]$InstallDir, [string]$DataDir) {
    return [pscustomobject]@{
        InstallDir   = $InstallDir
        DataDir      = $DataDir
        Node         = Join-Path $InstallDir 'runtime\node\node.exe'
        Mongod       = Join-Path $InstallDir 'runtime\mongodb\bin\mongod.exe'
        Mongodump    = Join-Path $InstallDir 'runtime\mongodb\bin\mongodump.exe'
        Mongorestore = Join-Path $InstallDir 'runtime\mongodb\bin\mongorestore.exe'
        VcRedist     = Join-Path $InstallDir 'runtime\vc_redist.x64.exe'
        ApiDir       = Join-Path $InstallDir 'app\api'
        WebDir       = Join-Path $InstallDir 'app\web'
        ServicesDir  = Join-Path $InstallDir 'services'
        WinSW        = Join-Path $InstallDir 'services\WinSW-x64.exe'
        Template     = Join-Path $InstallDir 'config\observator.env.template'
        ConfigDir    = Join-Path $DataDir 'config'
        ConfigFile   = Join-Path $DataDir 'config\observator.env'
        MongodCfg    = Join-Path $DataDir 'config\mongod.cfg'
        DbDir        = Join-Path $DataDir 'db'
        LogDir       = Join-Path $DataDir 'logs'
        BackupDir    = Join-Path $DataDir 'backups'
        UploadsDir   = Join-Path $DataDir 'uploads'
    }
}

function Get-ReleaseVersion([string]$Root) {
    $f = Join-Path $Root 'VERSION'
    if (Test-Path $f) { return ([IO.File]::ReadAllText($f)).Trim() }
    return 'unknown'
}

# Where it is installed, kept in the registry so an upgrade finds it wherever the
# new release was unpacked.
function Get-InstallRecord {
    if (-not (Test-Path $script:RegKey)) { return $null }
    $p = Get-ItemProperty -Path $script:RegKey
    return [pscustomobject]@{ InstallDir = $p.InstallDir; DataDir = $p.DataDir; Version = $p.Version }
}

function Set-InstallRecord([string]$InstallDir, [string]$DataDir, [string]$Version) {
    New-Item -Path $script:RegKey -Force | Out-Null
    Set-ItemProperty -Path $script:RegKey -Name InstallDir -Value $InstallDir
    Set-ItemProperty -Path $script:RegKey -Name DataDir -Value $DataDir
    Set-ItemProperty -Path $script:RegKey -Name Version -Value $Version
    Set-ItemProperty -Path $script:RegKey -Name UpdatedAt -Value ((Get-Date).ToString('s'))
}

function Remove-InstallRecord {
    if (Test-Path $script:RegKey) { Remove-Item -Path $script:RegKey -Recurse -Force }
}

# The installed layout, or a clear error.
function Get-InstalledLayout {
    $r = Get-InstallRecord
    if ($null -eq $r) { throw 'The weather station software is not installed on this PC (no install record).' }
    return Get-Layout $r.InstallDir $r.DataDir
}

# ---------------------------------------------------------------------------
# Files

function Write-TextFile([string]$Path, [string]$Text) {
    # No byte-order mark: the settings file is read by dotenv and by mongod.
    [IO.File]::WriteAllText($Path, $Text, $script:Utf8NoBom)
}

function New-Secret([int]$Bytes = 48) {
    $b = New-Object byte[] $Bytes
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($b) } finally { $rng.Dispose() }
    return (($b | ForEach-Object { $_.ToString('x2') }) -join '')
}

# KEY=VALUE settings from a file (comments and blank lines skipped).
function Read-EnvFile([string]$Path) {
    $map = [ordered]@{}
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        $t = $line.Trim()
        if ($t.Length -eq 0 -or $t.StartsWith('#')) { continue }
        $i = $t.IndexOf('=')
        if ($i -lt 1) { continue }
        $map[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim()
    }
    return $map
}

# The template's text with the given settings filled in. Keeps every comment, so
# the file stays self-explaining for whoever opens it next.
function Set-EnvValues([string]$Text, [hashtable]$Values) {
    $lines = [Collections.Generic.List[string]]::new()
    $seen = @{}
    foreach ($line in ($Text -split "`r?`n")) {
        if ($line -match '^\s*([A-Z][A-Z0-9_]*)\s*=') {
            $k = $Matches[1]
            if ($Values.ContainsKey($k)) {
                $lines.Add("$k=$($Values[$k])")
                $seen[$k] = $true
                continue
            }
        }
        $lines.Add($line)
    }
    $extra = @($Values.Keys | Where-Object { -not $seen.ContainsKey($_) })
    if ($extra.Count -gt 0) {
        $lines.Add('')
        $lines.Add('# Set by the installer')
        foreach ($k in $extra) { $lines.Add("$k=$($Values[$k])") }
    }
    return ($lines -join "`r`n")
}

# Settings a newer release introduced, added to an existing file with their
# defaults (and fresh secrets for any CHANGE_ME). Existing values are never changed.
function Add-MissingSettings([string]$ConfigFile, [string]$TemplateFile, [string]$Version) {
    $have = Read-EnvFile $ConfigFile
    $want = Read-EnvFile $TemplateFile
    $added = @()
    foreach ($k in $want.Keys) {
        if ($have.Contains($k)) { continue }
        $v = $want[$k]
        if ($v -eq 'CHANGE_ME') { $v = New-Secret }
        $added += "$k=$v"
    }
    if ($added.Count -gt 0) {
        $text = [IO.File]::ReadAllText($ConfigFile)
        $text = $text.TrimEnd() + "`r`n`r`n# Added by the upgrade to $Version (defaults - see config\observator.env.template)`r`n" + ($added -join "`r`n") + "`r`n"
        Write-TextFile $ConfigFile $text
    }
    return $added
}

# The database's own settings: this PC only, a one-member replica set (role
# changes use transactions, which need one), and a modest memory cap - the data is
# small and the PC has other work. Rewritten on every install and upgrade.
function Write-MongodConfig($Layout) {
    $cfg = @(
        '# Written by the installer; rewritten on upgrade - change the installer, not this.',
        'storage:',
        "  dbPath: '$($Layout.DbDir)'",
        '  wiredTiger:',
        '    engineConfig:',
        '      cacheSizeGB: 1',
        'systemLog:',
        '  destination: file',
        "  path: '$(Join-Path $Layout.LogDir 'mongod.log')'",
        '  logAppend: true',
        '  logRotate: rename',
        'net:',
        '  bindIp: 127.0.0.1',
        '  port: 27017',
        'replication:',
        '  replSetName: rs0',
        ''
    )
    Write-TextFile $Layout.MongodCfg ($cfg -join "`r`n")
}

# ---------------------------------------------------------------------------
# Permissions. The settings file holds the sign-in secrets: administrators and the
# services only. The program folder: read-only for everyone else, so no user can
# change the code a service runs.

function Invoke-Icacls([string[]]$Arguments) {
    & icacls.exe @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls failed ($LASTEXITCODE): $($Arguments -join ' ')" }
}

function Set-FolderSecurity($Layout) {
    Invoke-Icacls @($Layout.InstallDir, '/inheritance:r', '/grant:r',
        "$($script:SidAdmins):(OI)(CI)F", "$($script:SidSystem):(OI)(CI)F", "$($script:SidUsers):(OI)(CI)RX", '/T', '/C', '/Q')
    Invoke-Icacls @($Layout.DataDir, '/inheritance:r', '/grant:r',
        "$($script:SidAdmins):(OI)(CI)F", "$($script:SidSystem):(OI)(CI)F", "$($script:SidLocalService):(OI)(CI)M", '/T', '/C', '/Q')
    Invoke-Icacls @($Layout.ConfigDir, '/inheritance:r', '/grant:r',
        "$($script:SidAdmins):(OI)(CI)F", "$($script:SidSystem):(OI)(CI)F", "$($script:SidLocalService):(OI)(CI)RX", '/T', '/C', '/Q')
}

# ---------------------------------------------------------------------------
# Running things

# node.exe with one of the API's scripts, reading the site's settings file.
# $Env adds variables for THIS process only - how the first administrator's
# password reaches setup without ever being written to disk.
function Invoke-NodeScript($Layout, [string]$Script, [string[]]$Arguments = @(), [hashtable]$Env = @{}) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Layout.Node
    $quoted = @($Script) + $Arguments | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }
    $psi.Arguments = ($quoted -join ' ')
    $psi.WorkingDirectory = $Layout.ApiDir
    $psi.UseShellExecute = $false
    $psi.EnvironmentVariables['DOTENV_CONFIG_PATH'] = $Layout.ConfigFile
    $psi.EnvironmentVariables['NODE_ENV'] = 'production'
    $psi.EnvironmentVariables['NO_COLOR'] = '1'
    foreach ($k in $Env.Keys) { $psi.EnvironmentVariables[$k] = [string]$Env[$k] }
    $p = [Diagnostics.Process]::Start($psi)
    $p.WaitForExit()
    return $p.ExitCode
}

function Wait-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutSec) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $c = New-Object Net.Sockets.TcpClient
        try {
            $iar = $c.BeginConnect($HostName, $Port, $null, $null)
            if ($iar.AsyncWaitHandle.WaitOne(1000) -and $c.Connected) { $c.EndConnect($iar); return $true }
        } catch {
            # not up yet
        } finally {
            $c.Close()
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# True once the URL answers at all below 500 (a sign-in page's 200, an API's 401).
function Wait-Http([string]$Url, [int]$TimeoutSec) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -lt 500) { return $true }
        } catch [Net.WebException] {
            $resp = $_.Exception.Response
            if ($null -ne $resp -and [int]$resp.StatusCode -lt 500) { return $true }
        } catch {
            # not up yet
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Get-PortListener([int]$Port) {
    return Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
}

# MongoDB 5 and later need a processor with AVX. Without it mongod.exe dies on its
# first instruction - say so plainly instead of leaving a service that never starts.
function Assert-MongoCanRun($Layout) {
    $out = & $Layout.Mongod --version 2>&1
    # 0xC0000135 DLL not found: the Visual C++ runtime mongod.exe is built against is
    # missing (common on a freshly installed PC). Install the bundled one, quietly.
    if ($LASTEXITCODE -eq -1073741515 -and (Test-Path $Layout.VcRedist)) {
        Write-Note 'installing the Microsoft Visual C++ runtime the database needs...'
        $p = Start-Process -FilePath $Layout.VcRedist -ArgumentList '/install', '/quiet', '/norestart' -Wait -PassThru
        # 3010 = done, restart pending (not needed for this); 1638 = a newer one is already there.
        if ($p.ExitCode -notin @(0, 3010, 1638)) { throw "The Visual C++ runtime did not install (exit code $($p.ExitCode))." }
        $out = & $Layout.Mongod --version 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        $hint = ''
        if ($LASTEXITCODE -eq -1073741795) { $hint = ' This processor lacks AVX, which MongoDB needs - use a newer PC.' }
        if ($LASTEXITCODE -eq -1073741515) { $hint = ' A Windows component is missing (Visual C++ runtime) - see the installation guide.' }
        throw "The database program cannot run on this PC (exit code $LASTEXITCODE).$hint"
    }
    return ($out | Select-Object -First 1)
}

# ---------------------------------------------------------------------------
# Windows services (WinSW wraps each program as a service)

function Get-ServiceDefinitions($Layout) {
    $cfg = Read-EnvFile $Layout.ConfigFile
    return @(
        [pscustomobject]@{
            Id = 'ObservatorDB'; Name = 'Observator Weather - Database'
            Description = 'The weather station database (MongoDB). Keeps every reading; needed by the API.'
            Executable = $Layout.Mongod; Arguments = "--config `"$($Layout.MongodCfg)`""
            WorkDir = $Layout.DataDir; Env = @{}; Depends = @(); StopTimeoutSec = 120
        },
        [pscustomobject]@{
            Id = 'ObservatorAPI'; Name = 'Observator Weather - API and sensor stream'
            Description = 'Receives the GMX551 readings, stores them and serves them to the portal.'
            Executable = $Layout.Node; Arguments = 'dist\main.js'
            WorkDir = $Layout.ApiDir
            Env = @{ NODE_ENV = 'production'; NO_COLOR = '1'; DOTENV_CONFIG_PATH = $Layout.ConfigFile }
            Depends = @('ObservatorDB'); StopTimeoutSec = 30
        },
        [pscustomobject]@{
            Id = 'ObservatorWeb'; Name = 'Observator Weather - web portal'
            Description = "The portal people open in a browser on port $($cfg['WEB_PORT'])."
            Executable = $Layout.Node; Arguments = 'server.mjs'
            WorkDir = $Layout.WebDir
            # NEXT_TELEMETRY_DISABLED: the PC has no internet and must never try to
            # reach out (client, 23 Sep 2026).
            Env = @{ NODE_ENV = 'production'; NO_COLOR = '1'; OBSERVATOR_CONFIG = $Layout.ConfigFile; NEXT_TELEMETRY_DISABLED = '1' }
            Depends = @('ObservatorAPI'); StopTimeoutSec = 30
        }
    )
}

function ConvertTo-XmlText([string]$s) { return [Security.SecurityElement]::Escape($s) }

function New-ServiceXml($Def, $Layout) {
    $x = [Collections.Generic.List[string]]::new()
    $x.Add('<?xml version="1.0" encoding="utf-8"?>')
    $x.Add('<!-- Written by the installer; regenerated on upgrade. -->')
    $x.Add('<service>')
    $x.Add("  <id>$($Def.Id)</id>")
    $x.Add("  <name>$(ConvertTo-XmlText $Def.Name)</name>")
    $x.Add("  <description>$(ConvertTo-XmlText $Def.Description)</description>")
    $x.Add("  <executable>$(ConvertTo-XmlText $Def.Executable)</executable>")
    $x.Add("  <arguments>$(ConvertTo-XmlText $Def.Arguments)</arguments>")
    $x.Add("  <workingdirectory>$(ConvertTo-XmlText $Def.WorkDir)</workingdirectory>")
    foreach ($k in ($Def.Env.Keys | Sort-Object)) {
        $x.Add("  <env name=`"$k`" value=`"$(ConvertTo-XmlText $Def.Env[$k])`"/>")
    }
    foreach ($d in $Def.Depends) { $x.Add("  <depend>$d</depend>") }
    $x.Add('  <startmode>Automatic</startmode>')
    # Restart after a crash: soon, then less eagerly; the count resets after an hour up.
    $x.Add('  <onfailure action="restart" delay="10 sec"/>')
    $x.Add('  <onfailure action="restart" delay="30 sec"/>')
    $x.Add('  <onfailure action="restart" delay="2 min"/>')
    $x.Add('  <resetfailure>1 hour</resetfailure>')
    # Stopping sends Ctrl+C first, so the API writes its part-finished minute.
    $x.Add("  <stoptimeout>$($Def.StopTimeoutSec) sec</stoptimeout>")
    $x.Add("  <logpath>$(ConvertTo-XmlText $Layout.LogDir)</logpath>")
    # Rotated from day one: 8 files of 10 MB per service at most.
    $x.Add('  <log mode="roll-by-size">')
    $x.Add('    <sizeThreshold>10240</sizeThreshold>')
    $x.Add('    <keepFiles>8</keepFiles>')
    $x.Add('  </log>')
    $x.Add('</service>')
    return ($x -join "`r`n")
}

function Install-Services($Layout) {
    foreach ($def in (Get-ServiceDefinitions $Layout)) {
        $exe = Join-Path $Layout.ServicesDir ($def.Id + '.exe')
        Copy-Item -Path $Layout.WinSW -Destination $exe -Force
        Write-TextFile (Join-Path $Layout.ServicesDir ($def.Id + '.xml')) (New-ServiceXml $def $Layout)
        if ($null -eq (Get-Service -Name $def.Id -ErrorAction SilentlyContinue)) {
            & $exe install | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Could not register the $($def.Id) service ($LASTEXITCODE)." }
        }
        # A low-privilege built-in account, not SYSTEM: a program reachable from the
        # network should not own the PC if it is ever compromised.
        # Through cmd: Windows PowerShell 5.1 drops an empty '' argument, and sc.exe
        # needs the literal password= "" for a built-in account.
        & cmd.exe /c "sc.exe config $($def.Id) obj= `"NT AUTHORITY\LocalService`" password= `"`"" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not set the account for $($def.Id) ($LASTEXITCODE)." }
        Write-Ok "service $($def.Id) registered"
    }
}

function Uninstall-Services($Layout) {
    foreach ($id in @('ObservatorWeb', 'ObservatorAPI', 'ObservatorDB')) {
        $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
        if ($null -eq $svc) { continue }
        if ($svc.Status -ne 'Stopped') { Stop-Service -Name $id -Force -ErrorAction SilentlyContinue }
        $exe = Join-Path $Layout.ServicesDir ($id + '.exe')
        if (Test-Path $exe) { & $exe uninstall | Out-Null } else { & sc.exe delete $id | Out-Null }
        Write-Ok "service $id removed"
    }
}

function Start-ObservatorService([string]$Id, [int]$TimeoutSec = 60) {
    Start-Service -Name $Id
    (Get-Service -Name $Id).WaitForStatus('Running', [TimeSpan]::FromSeconds($TimeoutSec))
}

function Stop-ObservatorServices {
    foreach ($id in @('ObservatorWeb', 'ObservatorAPI', 'ObservatorDB')) {
        $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
        if ($null -ne $svc -and $svc.Status -ne 'Stopped') {
            Stop-Service -Name $id -Force
            $svc.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(180))
            Write-Ok "$id stopped"
        }
    }
}

# Start all three in order and check each one answers.
function Start-ObservatorServices($Layout) {
    $cfg = Read-EnvFile $Layout.ConfigFile
    Start-ObservatorService 'ObservatorDB'
    if (-not (Wait-TcpPort '127.0.0.1' 27017 90)) { throw "The database did not start. See $($Layout.LogDir)\mongod.log." }
    Write-Ok 'database running'
    Start-ObservatorService 'ObservatorAPI'
    if (-not (Wait-Http "http://127.0.0.1:$($cfg['PORT'])/health" 120)) { throw "The API did not start. See $($Layout.LogDir)\ObservatorAPI.err.log." }
    Write-Ok 'API running'
    Start-ObservatorService 'ObservatorWeb'
    if (-not (Wait-Http "http://127.0.0.1:$($cfg['WEB_PORT'])/login" 120)) { throw "The portal did not start. See $($Layout.LogDir)\ObservatorWeb.err.log." }
    Write-Ok 'portal running'
}

# ---------------------------------------------------------------------------
# Firewall: the portal, and the sensor port when the converter connects in.
# Limited to the local network unless told otherwise.

function Set-FirewallRules([int]$WebPort, [int]$StreamPort, [bool]$Listen, [string[]]$AllowFrom) {
    Remove-NetFirewallRule -Group $script:FirewallGroup -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "Observator Weather - portal (TCP $WebPort)" -Group $script:FirewallGroup `
        -Direction Inbound -Protocol TCP -LocalPort $WebPort -RemoteAddress $AllowFrom -Action Allow -Profile Any | Out-Null
    Write-Ok "firewall: portal port $WebPort open to $($AllowFrom -join ', ')"
    if ($Listen) {
        New-NetFirewallRule -DisplayName "Observator Weather - sensor stream (TCP $StreamPort)" -Group $script:FirewallGroup `
            -Direction Inbound -Protocol TCP -LocalPort $StreamPort -RemoteAddress $AllowFrom -Action Allow -Profile Any | Out-Null
        Write-Ok "firewall: sensor port $StreamPort open to $($AllowFrom -join ', ')"
    }
}

function Remove-FirewallRules {
    Remove-NetFirewallRule -Group $script:FirewallGroup -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# The daily maintenance task (backup, log tidy-up), run as SYSTEM at 02:30.

function Register-MaintenanceTask($Layout, [string]$At = '02:30') {
    $script = Join-Path $Layout.InstallDir 'scripts\maintenance.ps1'
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`""
    $trigger = New-ScheduledTaskTrigger -Daily -At $At
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    # Run later if the PC was off at 02:30; never two at once.
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)
    Register-ScheduledTask -TaskName $script:TaskName -Action $action -Trigger $trigger -Principal $principal `
        -Settings $settings -Description 'Backs up the weather station database and tidies old logs.' -Force | Out-Null
    Write-Ok "daily maintenance scheduled at $At"
}

function Unregister-MaintenanceTask {
    if (Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $script:TaskName -Confirm:$false
    }
}

# ---------------------------------------------------------------------------
# Backups. Each is a folder: the database (one compressed mongodump archive), the
# uploaded files, a copy of the settings, and a note of what it is. The data is
# kept forever, so every backup is a full copy that grows each year: only the
# newest BACKUP_KEEP are kept. BACKUP_DIR may be a second drive or a network share
# (the daily task runs as SYSTEM, so a share must allow this PC's computer account).

function Get-BackupSettings($Layout) {
    $cfg = Read-EnvFile $Layout.ConfigFile
    $dir = $Layout.BackupDir
    if ($cfg.Contains('BACKUP_DIR') -and $cfg['BACKUP_DIR']) { $dir = $cfg['BACKUP_DIR'] }
    $keep = 14
    if ($cfg.Contains('BACKUP_KEEP') -and $cfg['BACKUP_KEEP'] -match '^\d+$' -and [int]$cfg['BACKUP_KEEP'] -ge 1) { $keep = [int]$cfg['BACKUP_KEEP'] }
    return [pscustomobject]@{ Dir = $dir; Keep = $keep }
}

# The result of the last backup, for status.cmd and the portal's System page.
function Write-BackupResult($Layout, [bool]$Ok, [string]$Path, [long]$Bytes, [string]$ErrorText) {
    $o = [ordered]@{
        at = (Get-Date).ToUniversalTime().ToString('o'); ok = $Ok; path = $Path; bytes = $Bytes; error = $ErrorText
    }
    Write-TextFile (Join-Path $Layout.LogDir 'backup-last.json') ($o | ConvertTo-Json -Compress)
}

function Invoke-Backup($Layout, [string]$Dest = '', [int]$Keep = 0, [string]$Label = 'daily') {
    $settings = Get-BackupSettings $Layout
    if (-not $Dest) { $Dest = $settings.Dir }
    if ($Keep -lt 1) { $Keep = $settings.Keep }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $folder = Join-Path $Dest "observator-$stamp-$Label"
    try {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        $archive = Join-Path $folder 'database.archive.gz'
        $out = & $Layout.Mongodump '--uri=mongodb://127.0.0.1:27017/?directConnection=true' '--db=observator_standalone' '--gzip' "--archive=$archive" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "mongodump failed ($LASTEXITCODE): $($out | Select-Object -Last 3)" }
        if (-not (Test-Path $archive) -or (Get-Item $archive).Length -lt 100) { throw 'mongodump wrote an empty archive.' }
        if (Test-Path $Layout.UploadsDir) { Copy-Item -Path $Layout.UploadsDir -Destination (Join-Path $folder 'uploads') -Recurse -Force }
        Copy-Item -Path $Layout.ConfigFile -Destination (Join-Path $folder 'observator.env') -Force
        $info = @(
            "Observator Weather Station backup ($Label)",
            "Taken:   $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) (PC time)",
            "Version: $(Get-ReleaseVersion $Layout.InstallDir)",
            "PC:      $env:COMPUTERNAME",
            'Restore: restore.cmd -From "<this folder>"',
            'The observator.env copy holds the site''s secrets - keep backups somewhere private.'
        )
        Write-TextFile (Join-Path $folder 'README.txt') ($info -join "`r`n")
        $bytes = (Get-ChildItem -Path $folder -Recurse -File | Measure-Object -Property Length -Sum).Sum

        # Keep the newest $Keep of this kind; never touch anything else in the folder.
        $old = @(Get-ChildItem -Path $Dest -Directory -Filter "observator-*-$Label" | Sort-Object Name -Descending | Select-Object -Skip $Keep)
        foreach ($o in $old) { Remove-Item -Path $o.FullName -Recurse -Force }

        Write-BackupResult $Layout $true $folder $bytes ''
        return $folder
    } catch {
        Write-BackupResult $Layout $false $folder 0 $_.Exception.Message
        throw
    }
}

# ---------------------------------------------------------------------------
# Addresses people can use

function Get-PortalUrls([int]$WebPort) {
    $urls = @("http://$($env:COMPUTERNAME.ToLower()):$WebPort")
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -ExpandProperty IPAddress
    foreach ($ip in $ips) { $urls += "http://${ip}:$WebPort" }
    return $urls
}

function ConvertFrom-SecureText([Security.SecureString]$s) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Export-ModuleMember -Function * -Variable RegKey, FirewallGroup, TaskName
