@echo off
rem Double-click to keep Shopify stock in sync with the POS (same as "npm run auto").
rem Close this window to stop it. Clicking in the window does not pause it.
title iNext - Shopify auto sync
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto-sync.ps1"
