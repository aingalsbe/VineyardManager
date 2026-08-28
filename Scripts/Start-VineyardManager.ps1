# Start-VineyardManager.ps1
# Brings up Docker, Postgres, API, and Web after a reboot or clean slate.

$ErrorActionPreference = "Continue"
$projectRoot = "C:\AIProjects\VineyardManager"
$apiPath     = "$projectRoot\apps\api"
$webPath     = "$projectRoot\apps\web"
$dockerExe   = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

Write-Host "
=== Starting Vineyard Manager Environment ===" -ForegroundColor Cyan

# --------------------------------------------------
# 1. Start Docker Desktop if it is not running
# --------------------------------------------------
Write-Host "
[1/5] Checking Docker Desktop..." -ForegroundColor Yellow

$dockerProcess = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $dockerProcess) {
    Write-Host "Docker Desktop is not running. Starting it..." -ForegroundColor Yellow
    if (Test-Path $dockerExe) {
        Start-Process $dockerExe
    } else {
        Write-Host "ERROR: Docker Desktop not found at $dockerExe" -ForegroundColor Red
        Write-Host "Please start Docker Desktop manually and re-run this script." -ForegroundColor Red
        pause
        exit 1
    }
} else {
    Write-Host "Docker Desktop is already running." -ForegroundColor Green
}

# --------------------------------------------------
# 2. Wait for Docker engine to be ready
# --------------------------------------------------
Write-Host "
[2/5] Waiting for Docker engine to be ready..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$ready = $false

while (-not $ready -and $attempt -lt $maxAttempts) {
    $attempt++
    try {
        $null = docker info 2>$null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            Write-Host "Docker engine is ready." -ForegroundColor Green
        }
    } catch {}
    if (-not $ready) {
        Write-Host "  Attempt $attempt/$maxAttempts - still waiting..." -ForegroundColor DarkGray
        Start-Sleep -Seconds 2
    }
}

if (-not $ready) {
    Write-Host "ERROR: Docker engine did not become ready in time." -ForegroundColor Red
    Write-Host "Open Docker Desktop, wait until it is fully started, then re-run this script." -ForegroundColor Red
    pause
    exit 1
}

# --------------------------------------------------
# 3. Start Postgres with docker compose
# --------------------------------------------------
Write-Host "
[3/5] Starting Postgres containers..." -ForegroundColor Yellow
Set-Location $projectRoot
docker compose up -d
if ($LASTEXITCODE -eq 0) {
    Write-Host "Postgres is up." -ForegroundColor Green
} else {
    Write-Host "WARNING: docker compose returned an error. Check the output above." -ForegroundColor Red
}

# Give Postgres a couple of seconds to accept connections
Start-Sleep -Seconds 3

# --------------------------------------------------
# 4. Start API server in a new window
# --------------------------------------------------
Write-Host "
[4/5] Starting API server..." -ForegroundColor Yellow
$apiCommand = "cd '$apiPath'; Write-Host '=== Vineyard Manager API ===' -ForegroundColor Cyan; pnpm dev; pause"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $apiCommand

# --------------------------------------------------
# 5. Start Web server in a new window
# --------------------------------------------------
Write-Host "
[5/5] Starting Web server..." -ForegroundColor Yellow
$webCommand = "cd '$webPath'; Write-Host '=== Vineyard Manager Web ===' -ForegroundColor Cyan; pnpm dev; pause"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCommand

# --------------------------------------------------
# Open the browser
# --------------------------------------------------
Start-Sleep -Seconds 4
Write-Host "
Opening http://localhost:5173 ..." -ForegroundColor Cyan
Start-Process "http://localhost:5173"

Write-Host "
=== Startup complete ===" -ForegroundColor Green
Write-Host "API and Web are running in separate windows." -ForegroundColor Green
Write-Host "You can close this window." -ForegroundColor DarkGray
Write-Host ""
