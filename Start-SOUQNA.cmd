@echo off
setlocal
cd /d "%~dp0"
echo Starting SOUQNA staging validation and local server...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-staging.ps1"
if errorlevel 1 (
    echo.
    echo SOUQNA did not start. Read the error above. No production changes were made.
    pause
    exit /b 1
)
endlocal
