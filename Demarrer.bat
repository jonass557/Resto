@echo off
title Restaurant Manager — Démarrage
color 0A

echo ============================================
echo   RESTAURANT MANAGER — Démarrage des serveurs
echo ============================================
echo.

REM Vérifie si port 5000 occupé
netstat -ano | findstr ":5000 " >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Serveur backend deja actif sur port 5000
) else (
    echo [..] Démarrage du serveur backend...
    start "Backend :5000" cmd /k "cd /d "%~dp0server" && npm run dev"
    timeout /t 3 /nobreak >nul
    echo [OK] Serveur backend démarré
)

REM Vérifie si port 5173 occupé
netstat -ano | findstr ":5173 " >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Client Vite deja actif sur port 5173
) else (
    echo [..] Démarrage du client Vite...
    start "Frontend :5173" cmd /k "cd /d "%~dp0client" && npm run dev"
    timeout /t 4 /nobreak >nul
    echo [OK] Client démarré
)

echo.
echo ============================================
echo   Application disponible sur :
echo   http://localhost:5173
echo ============================================
echo.

start "" "http://localhost:5173"

pause
