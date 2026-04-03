@echo off
title Agent d'impression - Restaurant Manager
cd /d "%~dp0"

echo ============================================
echo   Agent d'impression - Restaurant Manager
echo ============================================
echo.
echo Demarrage du serveur local sur le port 5000...
echo.

:loop
node src/index.js
echo.
echo Le serveur s'est arrete. Redemarrage dans 5 secondes...
timeout /t 5 /nobreak >nul
goto loop
