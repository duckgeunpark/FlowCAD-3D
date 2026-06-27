@echo off
:: Move to the directory where this bat file is located
cd /d "%~dp0"

echo Starting OMX in the current directory...
echo Command: omx --madmax --high
echo.

omx --madmax --high

echo.
echo Session closed.
pause
