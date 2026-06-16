@echo off
title ROM-I Digital Twin Installer
color 0B
echo ==========================================================
echo        ROM-I DIGITAL TWIN - OFFLINE SETUP SCRIPT
echo ==========================================================
echo.
echo [STEP 1/3] Loading Docker Images from offline .tar archives...
echo.

echo - Loading InfluxDB image...
docker load -i influxdb.tar
echo.

echo - Loading Telegraf image...
docker load -i telegraf.tar
echo.

echo - Loading Backend application...
docker load -i romi_backend.tar
echo.

echo - Loading Frontend interface...
docker load -i romi_frontend.tar
echo.

echo ==========================================================
echo [STEP 2/3] Starting Digital Twin Containers...
echo ==========================================================
echo.
docker-compose up -d
echo.

echo ==========================================================
echo [STEP 3/3] Opening Digital Twin Dashboard...
echo ==========================================================
echo.
timeout /t 3 /nobreak >nul
start http://localhost:3000
echo.
echo Installation complete! You can access the dashboard at http://localhost:3000
echo.
echo Press any key to exit...
pause >nul
