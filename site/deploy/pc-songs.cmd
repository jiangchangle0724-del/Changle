@echo off
setlocal
title changle songs
cd /d "%~dp0.."
echo.
echo   changle  -  build the Name That Tune song list
echo   -----------------------------------------------
echo   Takes one to two hours. Leave this window open; progress is in songcache\build.log.
echo   If it stops, double-click again: it continues where it left off.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed. Get it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules\opencc-js (
  echo [1/2] Installing packages...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto fail
)
echo [2/2] Building the song list...
node scripts\build-songs.mjs %*
if errorlevel 1 goto fail
echo.
echo   Done. src\data\songs.ts is updated.
echo.
pause
exit /b 0
:fail
echo.
echo   Something went wrong. Take a screenshot of this window for Claude.
pause
exit /b 1
