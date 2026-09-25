# What can be tested WITHOUT Windows: the parts of Observator.psm1 that are pure
# logic - writing and merging the settings file, the service definitions, and the
# backup (its folder, its contents, and how many are kept).
#
#   pwsh installer/tests/module-logic.tests.ps1
#
# Services, the firewall, scheduled tasks and the installer as a whole still need a
# Windows machine; see PLAN.md, "Not yet verified". Everything here runs on Linux or
# macOS with PowerShell 7, and on Windows.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSCommandPath
$root = Split-Path -Parent (Split-Path -Parent $here)
Import-Module (Join-Path $root 'installer/windows/scripts/Observator.psm1') -Force -DisableNameChecking

$script:fail = 0
function Check([string]$Name, [bool]$Condition) {
    if ($Condition) { Write-Host "PASS $Name" } else { Write-Host "FAIL $Name" -ForegroundColor Red; $script:fail++ }
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("obs-installer-tests-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

try {
    # ── The settings file ────────────────────────────────────────────────────
    Write-Host "`n-- settings --"
    $template = Join-Path $root 'config/standalone.env.example'
    $values = @{
        PORT = '3200'
        MONGO_URI = 'mongodb://127.0.0.1:27017/observator_standalone?replicaSet=rs0&directConnection=true'
        JWT_ACCESS_SECRET = (New-Secret); JWT_REFRESH_SECRET = (New-Secret); SESSION_SECRET = (New-Secret)
        SWAGGER_PASSWORD = (New-Secret 12)
        WEB_PORT = '3201'; STANDALONE_DATA_DIR = 'C:\ObservatorData'
        STREAM_MODE = 'connect'; STREAM_REMOTE_HOST = '192.168.1.50'
        STANDALONE_SITE_NAME = 'Site & Co'
    }
    $text = Set-EnvValues ([IO.File]::ReadAllText($template)) $values
    Check 'nothing is left as CHANGE_ME' ($text -notmatch '(?m)^[A-Z0-9_]+=CHANGE_ME\s*$')
    $commentsBefore = ([IO.File]::ReadAllText($template) -split "`r?`n" | Where-Object { $_ -like '#*' }).Count
    Check 'every comment survives' ((($text -split "`r`n") | Where-Object { $_ -like '#*' }).Count -eq $commentsBefore)

    $file = Join-Path $tmp 'observator.env'
    Write-TextFile $file $text
    Check 'written without a byte-order mark' ([IO.File]::ReadAllBytes($file)[0] -ne 0xEF)
    $map = Read-EnvFile $file
    Check 'a URI with = and & survives' ($map['MONGO_URI'] -eq $values.MONGO_URI)
    Check 'a Windows path survives' ($map['STANDALONE_DATA_DIR'] -eq 'C:\ObservatorData')
    Check 'a chosen value is set in place' ($map['STREAM_MODE'] -eq 'connect')
    Check 'secrets are 96 hex characters' ($map['JWT_ACCESS_SECRET'] -match '^[0-9a-f]{96}$')
    Check 'the two token secrets differ' ($map['JWT_ACCESS_SECRET'] -ne $map['JWT_REFRESH_SECRET'])

    # An upgrade adds what is new and changes nothing that is there.
    $old = ($text -split "`r`n" | Where-Object { $_ -notmatch '^(SESSION_IDLE_MINUTES|STANDALONE_SELF_SIGNUP)=' }) -join "`r`n"
    Write-TextFile $file $old
    $templateCopy = Join-Path $tmp 'template.env'
    Write-TextFile $templateCopy ([IO.File]::ReadAllText($template))
    $added = Add-MissingSettings $file $templateCopy '9.9.9'
    $after = Read-EnvFile $file
    Check 'an upgrade adds the new settings' ((($added | ForEach-Object { $_.Split('=')[0] }) -join ',') -eq 'SESSION_IDLE_MINUTES,STANDALONE_SELF_SIGNUP')
    Check 'an upgrade keeps existing secrets' ($after['JWT_ACCESS_SECRET'] -eq $map['JWT_ACCESS_SECRET'])
    Check 'an upgrade keeps existing choices' ($after['STREAM_MODE'] -eq 'connect')
    Check 'running the upgrade again adds nothing' (@(Add-MissingSettings $file $templateCopy '9.9.9').Count -eq 0)

    # ── The service definitions ──────────────────────────────────────────────
    Write-Host "`n-- services --"
    $L = Get-Layout (Join-Path $tmp 'Program & Co') (Join-Path $tmp 'data')
    $def = [pscustomobject]@{
        Id = 'ObservatorAPI'; Name = 'A & B <x>'; Description = 'd'
        Executable = $L.Node; Arguments = 'dist\main.js'; WorkDir = $L.ApiDir
        Env = @{ DOTENV_CONFIG_PATH = 'C:\ObservatorData\config\observator.env'; NODE_ENV = 'production' }
        Depends = @('ObservatorDB'); StopTimeoutSec = 30
    }
    $xml = [xml](New-ServiceXml $def $L)
    Check 'the service definition is valid XML' ($null -ne $xml.service)
    Check 'names with & and <> are escaped' ($xml.service.name -eq 'A & B <x>')
    Check 'the settings file is handed over' ((($xml.service.env | Where-Object { $_.name -eq 'DOTENV_CONFIG_PATH' }).value) -eq 'C:\ObservatorData\config\observator.env')
    Check 'the API waits for the database' ($xml.service.depend -eq 'ObservatorDB')
    Check 'logs are rotated' ($xml.service.log.mode -eq 'roll-by-size')
    Check 'it restarts after a crash' (@($xml.service.onfailure).Count -ge 2)

    # ── Backups ──────────────────────────────────────────────────────────────
    Write-Host "`n-- backups --"
    $b = Join-Path $tmp 'site'
    foreach ($d in @("$b/install", "$b/data/config", "$b/data/logs", "$b/data/uploads", "$b/data/backups")) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
    Write-TextFile "$b/install/VERSION" "1.2.3`r`n"
    Write-TextFile "$b/data/uploads/logo.png" 'not really a logo'
    Copy-Item $file "$b/data/config/observator.env" -Force
    # A stand-in for mongodump: writes an archive where it is told to and succeeds.
    $dump = Join-Path $b ('mongodump' + $(if ($IsWindows) { '.cmd' } else { '' }))
    if ($IsWindows) {
        Set-Content -Path $dump -Value '@echo off`r`nfor %%a in (%*) do echo x > %%a' -Encoding Ascii
    } else {
        Set-Content -Path $dump -Value "#!/bin/bash`nfor a in `"`$@`"; do case `"`$a`" in --archive=*) head -c 500 /dev/urandom > `"`${a#--archive=}`";; esac; done`nexit 0"
        & chmod +x $dump
    }
    $S = [pscustomobject]@{
        InstallDir = "$b/install"; DataDir = "$b/data"
        ConfigFile = "$b/data/config/observator.env"; LogDir = "$b/data/logs"
        BackupDir = "$b/data/backups"; UploadsDir = "$b/data/uploads"; Mongodump = $dump
    }
    $folder = $null
    for ($i = 1; $i -le 5; $i++) { $folder = Invoke-Backup $S '' 3 'daily'; Start-Sleep -Seconds 1 }
    $kept = @(Get-ChildItem "$b/data/backups" -Directory -Filter 'observator-*-daily')
    Check 'only the newest few are kept' ($kept.Count -eq 3)
    Check 'the newest kept is the last taken' ((($kept | Sort-Object Name -Descending | Select-Object -First 1).FullName) -eq $folder)
    Check 'the database archive is there' (Test-Path (Join-Path $folder 'database.archive.gz'))
    Check 'the uploaded files are there' (Test-Path (Join-Path $folder 'uploads/logo.png'))
    Check 'the settings are there' (Test-Path (Join-Path $folder 'observator.env'))
    $readme = Get-Content -Raw (Join-Path $folder 'README.txt')
    Check 'it says how to restore' ($readme -match 'restore.cmd -From')
    Check 'it names the version' ($readme -match '1\.2\.3')
    $last = Get-Content -Raw "$b/data/logs/backup-last.json" | ConvertFrom-Json
    Check 'the result is recorded for the System page' ($last.ok -eq $true -and $last.bytes -gt 500 -and $last.path -eq $folder)

    $elsewhere = Join-Path $b 'usb'
    New-Item -ItemType Directory -Path $elsewhere -Force | Out-Null
    [void](Invoke-Backup $S $elsewhere 1000 'manual')
    Check 'a backup taken elsewhere does not prune the nightly ones' (@(Get-ChildItem "$b/data/backups" -Directory).Count -eq 3)
    Check 'a backup taken elsewhere lands there' (@(Get-ChildItem $elsewhere -Directory -Filter 'observator-*-manual').Count -eq 1)

    $broken = $S.PSObject.Copy()
    $broken.Mongodump = Join-Path $b 'not-a-program'
    $threw = $false
    try { [void](Invoke-Backup $broken '' 3 'daily') } catch { $threw = $true }
    Check 'a failed backup is reported, not swallowed' $threw
    $failed = Get-Content -Raw "$b/data/logs/backup-last.json" | ConvertFrom-Json
    Check 'a failed backup is recorded for the System page' ($failed.ok -eq $false -and $failed.error)
} finally {
    Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ''
if ($script:fail -gt 0) {
    Write-Host "$($script:fail) check(s) FAILED" -ForegroundColor Red
    exit 1
}
Write-Host 'All checks passed.' -ForegroundColor Green
