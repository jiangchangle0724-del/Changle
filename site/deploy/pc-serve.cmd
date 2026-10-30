@echo off
setlocal
title changle local files
cd /d "%~dp0.."
echo   Serving this folder at http://127.0.0.1:8765/ (for reading logs and results). Close this window to stop.
node deploy\serve.mjs
pause
