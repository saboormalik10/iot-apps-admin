@echo off
rem Observator Weather Station - back up now.
rem Runs scripts\backup.ps1 with Windows PowerShell, whatever the PC's script policy.
setlocal
net session >nul 2>&1
if errorlevel 1 (
  echo Asking Windows for administrator rights...
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  exit /b
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup.ps1" %*
set RC=%ERRORLEVEL%
echo.
if not "%RC%"=="0" echo Finished with errors (code %RC%). Read the messages above.
pause
exit /b %RC%
