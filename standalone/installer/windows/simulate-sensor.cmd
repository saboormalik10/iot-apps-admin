@echo off
rem Observator Weather Station - TEST READINGS, for trying the portal without a sensor.
rem Plays the GMX551 and its converter: one reading a second to this PC's sensor
rem port (4000), until this window is closed. The readings are stored like real
rem ones, so use it on a test install, not alongside a real sensor.
rem
rem   simulate-sensor.cmd                         normal weather
rem   simulate-sensor.cmd --scenario gust,rain    gusts and showers
rem   simulate-sensor.cmd --scenario all          every awkward case at once
rem   simulate-sensor.cmd --nmea                  NMEA 0183 sentences instead of Gill ASCII
rem   simulate-sensor.cmd --listen                PC set to connect to the converter:
rem                                               wait on port 4000 for it instead
rem   simulate-sensor.cmd --port 4001             another sensor port
setlocal
set NODE=%~dp0runtime\node\node.exe
if not exist "%NODE%" set NODE=C:\Observator\runtime\node\node.exe
echo Sending test readings to the weather station. Close this window to stop.
echo.
"%NODE%" "%~dp0tools\gmx551-sim.mjs" %*
pause
