@echo off
title Serveur Local - Restaurant
cd /d "%~dp0"

echo ========================================
echo  Demarrage du systeme restaurant...
echo ========================================

:: Attendre 15 secondes que le WiFi soit connecte
echo Attente connexion WiFi...
timeout /t 15 /nobreak >nul

:: Lancer la surveillance WiFi en arriere-plan (processus separe)
echo Activation surveillance WiFi...
start "" powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0reconnexion-wifi.ps1"

:: Lancer le serveur Node.js avec redemarrage automatique
:restart
echo Demarrage serveur impression...
node src/index.js
echo Serveur arrete. Redemarrage dans 5 secondes...
timeout /t 5 /nobreak >nul
goto restart
