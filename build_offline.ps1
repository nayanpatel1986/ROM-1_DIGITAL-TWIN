Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     ROM-I DIGITAL TWIN - OFFLINE PACKAGER SCRIPT        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/2] Rebuilding Docker containers..." -ForegroundColor Yellow
docker-compose build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Docker build failed!" -ForegroundColor Red
    Exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[2/2] Exporting Docker images to offline .tar archives..." -ForegroundColor Yellow

Write-Host "- Exporting romii_backend.tar..." -ForegroundColor Cyan
docker save romii_backend:latest -o romii_backend.tar

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to save romii_backend image!" -ForegroundColor Red
    Exit $LASTEXITCODE
}

Write-Host "- Exporting romii_frontend.tar..." -ForegroundColor Cyan
docker save romii_frontend:latest -o romii_frontend.tar

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to save romii_frontend image!" -ForegroundColor Red
    Exit $LASTEXITCODE
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Success! Offline image packages are built and updated." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
