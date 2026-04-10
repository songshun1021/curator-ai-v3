@echo off
setlocal

where powershell >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PowerShell not found.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-wechat.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Package failed. Check messages above.
  pause
  exit /b 1
)

echo.
echo [DONE] Package completed.
pause

endlocal
