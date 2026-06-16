@echo off
title ROM-I EDR Dashboard Launcher
color 0B
cd /d "%~dp0"

echo ==========================================
echo        ROM-I EDR DASHBOARD LAUNCHER
echo ==========================================
echo.
echo [1/2] Ensuring Digital Twin containers are running...
docker-compose up -d
if %ERRORLEVEL% neq 0 (
    echo.
    echo WARNING: Docker-compose failed to start. Please check if Docker Desktop is running!
    echo.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Launching standalone app viewer...
start msedge --app=http://localhost:3000

echo.
echo EDR Dashboard launched successfully!
timeout /t 2 /nobreak >nul
