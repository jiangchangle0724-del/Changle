@echo off
setlocal
title changle deploy from source
cd /d "%~dp0.."
echo.
echo   changle  -  build and deploy to Cloudflare
echo   -------------------------------------------
echo   1/3  packages        2/3  website build        3/3  table server + website upload
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed. Get it from https://nodejs.org and run this again.
  goto fail
)
echo [1/3] Installing packages...
call npm ci --no-audit --no-fund
if errorlevel 1 goto fail
echo [2/3] Building the website...
call npm run build
if errorlevel 1 goto fail
echo [3/3] Deploying the table server...
call npx --yes wrangler@4 deploy -c worker\wrangler.jsonc
if errorlevel 1 goto fail
echo [3/3] Uploading the website...
call npx --yes wrangler@4 pages deploy dist --project-name changle --commit-dirty=true
if errorlevel 1 goto fail
echo.
echo   Done. Open https://changle.ca
echo DEPLOYED %date% %time% > deploy\last-deploy.txt
echo.
pause
exit /b 0
:fail
echo.
echo   Something went wrong. Take a screenshot of this window for Claude.
echo FAILED %date% %time% > deploy\last-deploy.txt
pause
exit /b 1
