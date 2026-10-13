@echo off
chcp 65001 >nul
title Deploy to GitHub - Chun Feng Shi Li

rem ============================================================
rem  deploy-github.cmd
rem  One-click deploy: creates the repo, uploads everything,
rem  turns on GitHub Pages, and prints your web address.
rem
rem  HOW TO USE:
rem    1. Get a token at  https://github.com/settings/tokens
rem       (Generate new token classic, tick  repo  and  workflow)
rem    2. Double-click this file
rem    3. Paste the token when asked, press Enter
rem
rem  Keep ASCII-only: cmd.exe parses .cmd with the OEM codepage.
rem ============================================================

cd /d "%~dp0"

set "NODE=%~dp0..\runtime\node.exe"

echo ============================================================
echo   Deploy to GitHub  -  free forever, runs in the cloud
echo ============================================================
echo.
echo   You need a GitHub token first.
echo.
echo   1. Open:  https://github.com/settings/tokens
echo   2. Click: Generate new token (classic)
echo   3. Tick:  [x] repo    [x] workflow
echo   4. Click: Generate token
echo   5. Copy the string starting with ghp_
echo.
echo ============================================================
echo.

if not exist "%NODE%" (
    echo   [ERROR] node not found: %NODE%
    echo.
    pause
    exit /b 1
)

set /p "TOKEN=Paste your token here, then press Enter: "

if "%TOKEN%"=="" (
    echo.
    echo   [CANCELLED] no token entered
    echo.
    pause
    exit /b 1
)

echo.
set /p "REPO=Repo name (press Enter for chunfeng-lottery): "
if "%REPO%"=="" set "REPO=chunfeng-lottery"

echo.
echo   Deploying, please wait 1-2 minutes...
echo.

"%NODE%" "%~dp0deploy-github.mjs" "%TOKEN%" "%REPO%"
set "CODE=%ERRORLEVEL%"

echo.
echo ============================================================
if "%CODE%"=="0" (
    echo   [DONE] Your web address is printed above.
    echo   Wait 2-3 minutes for the first build, then open it.
) else (
    echo   [FAILED] exit code %CODE%
    echo   Check the message above.
)
echo ============================================================
echo.
pause
exit /b %CODE%
