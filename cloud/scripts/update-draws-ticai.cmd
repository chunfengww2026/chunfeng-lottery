@echo off
chcp 65001 >nul
rem ============================================================
rem  update-draws-ticai.cmd
rem  Runs at 21:45 every day -- the CHINA SPORTS LOTTERY (ticai) shift.
rem
rem  Games handled here: dlt / pl3 / pl5 / qxc   (4 games)
rem  The other 4 games (ssq / fc3d / qlc / kl8) were already fetched by
rem  the 21:30 shift, see update-draws-fucai.cmd.
rem
rem  REQUIREMENT (user): keep scraping until every game that draws
rem  TODAY has today's winning numbers.  A single run is not enough,
rem  because a source may still be publishing when 21:45 fires.
rem
rem  So this file now delegates the whole shift to
rem      update-draws-retry.mjs ticai
rem  which loops:
rem      scrape -> check "is every due game on today's date?" ->
rem              not yet -> wait 5 min -> scrape again  (max 8 rounds)
rem              all there -> exit immediately
rem  Each round also runs: build-history / export-static / export-football
rem  / export-site / export-cloud-tickets / cloud sync-cloud.mjs
rem  so the cloud copy is refreshed on every round, not only at the end.
rem
rem  Retry parameters (override with env vars if ever needed):
rem      DRAW_RETRY_MAX=8            total rounds  (first try + up to 7 retries)
rem      DRAW_RETRY_WAIT_MS=300000   5 minutes between rounds
rem  Worst case here: 21:45 -> about 22:20.  Exits early when complete.
rem  No DeepSeek tokens are ever spent on this path (no --ai flag).
rem
rem  Keep ASCII-only: cmd.exe parses .cmd with the OEM codepage.
rem ============================================================
cd /d "%~dp0"
set "NODE=%~dp0runtime\node.exe"
set "LOG=%~dp0_draws.log"

if not exist "%NODE%" (
    echo [%date% %time%] ERROR: node runtime not found >> "%LOG%"
    exit /b 1
)

echo. >> "%LOG%"
echo ============================================ >> "%LOG%"
echo [%date% %time%] TICAI shift start ^(21:45 ^/ dlt pl3 pl5 qxc^) >> "%LOG%"

"%NODE%" "%~dp0update-draws-retry.mjs" ticai --quiet >> "%LOG%" 2>&1
set "CODE=%ERRORLEVEL%"

echo [%date% %time%] TICAI shift end ^(exit %CODE%^) >> "%LOG%"
exit /b %CODE%
