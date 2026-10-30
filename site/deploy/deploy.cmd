@echo off
setlocal
title changle deploy
cd /d "%~dp0"
echo.
echo   changle  -  deploy to Cloudflare
echo   --------------------------------
echo   1/2  table server and API  (rooms.changle.ca)
echo   2/2  website               (changle.ca)
echo.
echo   The first time, a browser page from Cloudflare asks you to Allow wrangler.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed. Get it from https://nodejs.org and run this again.
  goto fail
)
echo [1/2] Deploying the table server...
pushd rooms
call npx --yes wrangler@4 deploy
if errorlevel 1 (
  popd
  goto fail
)
popd
echo.
echo [2/2] Uploading the website...
call npx --yes wrangler@4 pages deploy site --project-name changle --commit-dirty=true
if errorlevel 1 goto fail
echo.
echo   Done. Open https://changle.ca
echo.
pause
exit /b 0
:fail
echo.
echo   Something went wrong. Take a screenshot of this window for Claude.
echo.
pause
exit /b 1
