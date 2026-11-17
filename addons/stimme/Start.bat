@echo off
chcp 65001 >nul
title TZBrowser - Sprach-Server (Add-on Stimme)
cd /d "%~dp0"
rem Normalerweise startet TZBrowser den Server selbst. Diese Datei ist nur zum Testen.
netstat -ano | findstr "127.0.0.1:5577" | findstr "LISTENING" >nul && (
  echo Der Sprach-Server laeuft schon.
  timeout /t 4 >nul
  exit /b
)
set PY=%~dp0venv\Scripts\python.exe
if exist "%~dp0venv_omni\Scripts\python.exe" set PY=%~dp0venv_omni\Scripts\python.exe
echo Sprach-Server startet ... Fenster offen lassen, schliessen = beenden.
"%PY%" -u "%~dp0server.py"
pause
