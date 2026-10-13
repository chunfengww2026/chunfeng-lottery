@echo off
chcp 65001 >nul
title Sync to Cloud

rem ============================================================
rem  sync-cloud.cmd
rem  Push the local recommendation numbers to the cloud site,
rem  then trigger a rebuild. Run this after rolling new numbers.
rem
rem  Keep ASCII-only: cmd.exe parses .cmd with the OEM codepage.
rem ============================================================

cd /d "%~dp0"

set "NODE=%~dp0..\runtime\node.exe"

if not exist "%NODE%" (
    echo   [ERROR] runtime\node.exe not found
    pause
    exit /b 1
)

echo ============================================================
echo   Syncing local numbers to the cloud site
echo ============================================================
echo.

"%NODE%" "%~dp0sync-cloud.mjs"
set "CODE=%ERRORLEVEL%"

echo.
if "%CODE%"=="0" (
    echo   [OK] synced. Wait 2-3 minutes, then open your site.
) else (
    echo   [FAILED] exit code %CODE%
)
echo.
pause
exit /b %CODE%