@echo off
setlocal
title changle email key
cd /d "%~dp0"
echo.
echo   changle  -  save the Resend key for sign-up emails
echo   ------------------------------------------------
echo   Paste your Resend API key (it starts with re_) and press Enter.
echo   Nothing shows while you paste. The key is stored on Cloudflare only.
echo.
pushd rooms
call npx --yes wrangler@4 secret put RESEND_API_KEY
popd
echo.
echo   Saved. Sign-up emails will work after the next deploy.
echo.
pause
