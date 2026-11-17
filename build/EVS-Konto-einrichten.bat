@echo off
chcp 65001 >nul
title TZBrowser - castLabs EVS-Konto (Widevine-Signatur)
cd /d "%~dp0"
echo.
echo   ==========================================================
echo     TZBrowser - kostenloses castLabs-Konto fuer Widevine
echo   ==========================================================
echo   Nur noetig, wenn du TZBrowser SELBST aus dem Quellcode baust
echo   und Streamingdienste (Netflix, Crunchyroll, Disney+ ...) nutzen willst.
echo   Wer den fertigen Installer nimmt, braucht das NICHT.
echo.
echo   Du wirst nach Konto-Name, Vor-/Nachname, Organisation (darf "privat" sein),
echo   E-Mail und einem selbst ausgedachten Passwort gefragt.
echo   Danach kommt ein Bestaetigungscode per E-Mail.
echo   Mit der Anmeldung akzeptierst du die Bedingungen von castLabs.
echo.
pause
if not exist "%~dp0evs-venv\Scripts\python.exe" (
  echo Richte Python-Umgebung ein ...
  py -3 -m venv "%~dp0evs-venv" || python -m venv "%~dp0evs-venv"
  "%~dp0evs-venv\Scripts\python.exe" -m pip install --upgrade castlabs-evs
)
"%~dp0evs-venv\Scripts\python.exe" -m castlabs_evs.account signup
echo.
echo   Fertig. Ab jetzt wird TZBrowser bei "npm run dist" automatisch signiert.
pause
