@echo off
REM Ensure the script runs in the exact folder it is located in
cd /d "%~dp0"

echo ==========================================
echo Starting ROM-I Offline Installation
echo ==========================================

echo.
REM Check if the single combined tar exists
IF EXIST "romi_all_images.tar" (
    echo Loading combined image file (romi_all_images.tar)...
    docker load -i romi_all_images.tar
) ELSE (
    echo Loading individual image files...
    IF EXIST "romi_backend.tar" (
        docker load -i romi_backend.tar
    ) ELSE (
        echo Warning: romi_backend.tar not found!
    )
    
    IF EXIST "romi_frontend.tar" (
        docker load -i romi_frontend.tar
    ) ELSE (
        echo Warning: romi_frontend.tar not found!
    )
    
    IF EXIST "telegraf.tar" (
        docker load -i telegraf.tar
    ) ELSE (
        echo Warning: telegraf.tar not found!
    )
)

echo.
echo Starting Application Containers...
docker-compose up -d

echo.
echo ==========================================
echo Setup Complete! Your ROM-I application is running.
echo ==========================================
pause
