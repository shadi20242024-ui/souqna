@echo off
setlocal
cd /d "%~dp0"
echo SOUQNA Auctions - Firebase staging only - virtual wallets
where node >nul 2>&1 || (echo Install Node.js 22 with npm first. & goto :fail)
call npm install --ignore-scripts --no-audit --no-fund --no-package-lock || goto :fail
call npm --prefix functions install --ignore-scripts --no-audit --no-fund --no-package-lock || goto :fail
call node_modules\.bin\firebase.cmd login || goto :fail
node scripts\publish-auction-trial.mjs || goto :fail
pause
exit /b 0
:fail
echo Staging trial publication did not finish. Read the message above.
pause
exit /b 1
