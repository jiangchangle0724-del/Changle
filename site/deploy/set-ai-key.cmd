@echo off
setlocal
title changle AI key
cd /d "%~dp0"
echo.
echo   changle  -  save the Google AI key for drawing anime avatars
echo   ------------------------------------------------------------
echo   If a Cloudflare page opens in your browser, click Allow.
echo   Then paste your Google AI key (it starts with AIza) and press Enter.
echo   Nothing shows while you paste. The key is stored on Cloudflare only.
echo.
pushd rooms
call npx --yes wrangler@4 secret put GEMINI_API_KEY
popd
echo.
echo   Saved. AI avatars work after the next deploy.
echo.
pause
