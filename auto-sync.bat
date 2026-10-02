@echo off
rem Double-click to keep Shopify stock in sync with the POS (same as "npm run auto").
rem Close this window to stop it.
title iNext - Shopify auto sync
cd /d "%~dp0"
:run
node src\sync.js --auto
echo.
echo Sync stopped. Restarting in 30 seconds... (close this window to stop)
timeout /t 30 /nobreak >nul
goto run
