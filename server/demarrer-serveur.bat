@echo off
title Serveur Local - Restaurant
cd /d "%~dp0"

echo ========================================
echo  Demarrage du serveur d'impression...
echo ========================================

:: Attendre 10 secondes que le WiFi soit connecte
timeout /t 10 /nobreak >nul

:: Lancer le serveur Node.js
node src/index.js

:: Si le serveur s'arrete, attendre avant de relancer
echo Serveur arrete. Relancement dans 5 secondes...
timeout /t 5 /nobreak >nul
node src/index.js

pause
