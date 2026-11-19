@echo off
setlocal
cd /d "%~dp0"
echo SOUQNA - Password reset for the STAGING owner account only.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\reset-staging-owner-password.ps1" -Apply
if errorlevel 1 (
    echo.
    echo Password was not confirmed changed. Review the message above.
    pause
    exit /b 1
)
echo.
echo Password update finished. Test login on SOUQNA staging.
pause
endlocal
