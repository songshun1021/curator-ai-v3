@echo off
setlocal

where powershell >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PowerShell not found.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-curator.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Publish failed. Check messages above.
  pause
  exit /b 1
)

echo.
echo [DONE] Publish completed.
pause

endlocal
