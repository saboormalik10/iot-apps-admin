@echo off
rem Observator Weather Station - is everything working?.
rem Runs scripts\status.ps1 with Windows PowerShell, whatever the PC's script policy.
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\status.ps1" %*
set RC=%ERRORLEVEL%
echo.
if not "%RC%"=="0" echo Finished with errors (code %RC%). Read the messages above.
pause
exit /b %RC%
