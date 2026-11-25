# Start-VineyardManager.ps1
# Pulls latest changes from GitHub, brings up Docker + Postgres, runs
# Prisma migrations (db:migrate:deploy), and starts the local API and Web servers.
#
# Optional switches:
#   -SkipPull     Skip git pull (useful when offline or testing local edits)
#   -SkipMigrate  Skip pnpm db:migrate:deploy

[CmdletBinding()]
param(
    [switch]$SkipPull,
    [switch]$SkipMigrate
)

$ErrorActionPreference = "Continue"

$repoRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { "C:\AIProjects" }
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "VineyardManager"))) {
    $repoRoot = "C:\AIProjects"
}
$projectRoot = Join-Path $repoRoot "VineyardManager"
$apiPath     = Join-Path $projectRoot "apps\api"
$webPath     = Join-Path $projectRoot "apps\web"
$dockerExe   = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

Write-Host "`n=== Starting Vineyard Manager Environment ===" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $projectRoot)) {
    Write-Host "ERROR: Project folder not found: $projectRoot" -ForegroundColor Red
    pause
    exit 1
}

# --------------------------------------------------
# 1. Pull latest code from GitHub
# --------------------------------------------------
Write-Host "`n[1/7] Checking GitHub for updates..." -ForegroundColor Yellow

$pulledNewCommits = $false
$changedFiles = @()

if ($SkipPull) {
    Write-Host "Skipping git pull (-SkipPull)." -ForegroundColor DarkGray
} elseif (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "WARNING: git not found on PATH; skipping pull." -ForegroundColor Yellow
} elseif (-not (Test-Path -LiteralPath (Join-Path $repoRoot ".git"))) {
    Write-Host "WARNING: $repoRoot is not a git repository; skipping pull." -ForegroundColor Yellow
} else {
    Push-Location $repoRoot
    try {
        $porcelain = @(git status --porcelain)
        $gitStatusExit = $LASTEXITCODE
        $hasDirty = ($porcelain.Count -gt 0) -and (-not [string]::IsNullOrWhiteSpace(($porcelain -join "`n")))

        if ($gitStatusExit -ne 0) {
            Write-Host "WARNING: git status failed; skipping automatic pull." -ForegroundColor Yellow
        } elseif ($hasDirty) {
            Write-Host "WARNING: Local uncommitted changes detected; skipping git pull so nothing is overwritten." -ForegroundColor Yellow
            git status --short
        } else {
            $beforeSha = ((git rev-parse HEAD 2>$null) -join "").Trim()
            git pull --ff-only
            if ($LASTEXITCODE -ne 0) {
                Write-Host "WARNING: git pull --ff-only failed (offline or branch diverged). Continuing with current local code." -ForegroundColor Yellow
            } else {
                $afterSha = ((git rev-parse HEAD 2>$null) -join "").Trim()
                if ($beforeSha -and $afterSha -and ($beforeSha -ne $afterSha)) {
                    $pulledNewCommits = $true
                    Write-Host "Pulled new commits:" -ForegroundColor Green
                    git log --oneline "$beforeSha..$afterSha"
                    $changedFiles = @(git diff --name-only "$beforeSha..$afterSha")
                } else {
                    Write-Host "Already up to date with GitHub." -ForegroundColor Green
                }
            }
        }
    } finally {
        Pop-Location
    }
}

$needsInstall = (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) -or (
    $pulledNewCommits -and (@($changedFiles | Where-Object { $_ -match '(^|/)package\.json$|pnpm-lock\.yaml$' }).Count -gt 0)
)
$needsPrismaGenerate = $pulledNewCommits -and (@($changedFiles | Where-Object { $_ -match 'schema\.prisma$' }).Count -gt 0)

if ($needsInstall) {
    Write-Host "Dependencies changed (or node_modules missing) - running pnpm install..." -ForegroundColor Yellow
    Push-Location $projectRoot
    try {
        pnpm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARNING: pnpm install failed. Check the output above." -ForegroundColor Red
            pause
        }
    } finally {
        Pop-Location
    }
}

if ($needsPrismaGenerate) {
    Write-Host "Prisma schema changed - running pnpm db:generate..." -ForegroundColor Yellow
    Push-Location $projectRoot
    try {
        pnpm db:generate
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARNING: pnpm db:generate failed. Check the output above." -ForegroundColor Red
            pause
        }
    } finally {
        Pop-Location
    }
}

if ($pulledNewCommits -and (@($changedFiles | Where-Object { $_ -match 'Scripts/Start-VineyardManager\.ps1$' }).Count -gt 0)) {
    Write-Host "Note: Start-VineyardManager.ps1 itself was updated; changes take effect on the next start." -ForegroundColor Cyan
}

# --------------------------------------------------
# 2. Start Docker Desktop if it is not running
# --------------------------------------------------
Write-Host "`n[2/7] Checking Docker Desktop..." -ForegroundColor Yellow

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
# 3. Wait for Docker engine to be ready
# --------------------------------------------------
Write-Host "`n[3/7] Waiting for Docker engine to be ready..." -ForegroundColor Yellow
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
# 4. Start Postgres with docker compose & wait for readiness
# --------------------------------------------------
Write-Host "`n[4/7] Starting Postgres containers..." -ForegroundColor Yellow
Set-Location $projectRoot
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: docker compose returned an error. Check the output above." -ForegroundColor Red
}

$pgAttempts = 15
$pgAttempt = 0
$pgReady = $false

while (-not $pgReady -and $pgAttempt -lt $pgAttempts) {
    $pgAttempt++
    $null = docker compose exec -T postgres pg_isready -U vineyard -d vineyard_manager 2>$null
    if ($LASTEXITCODE -eq 0) {
        $pgReady = $true
        Write-Host "Postgres is up and accepting connections." -ForegroundColor Green
    } else {
        Write-Host "  Waiting for Postgres ($pgAttempt/$pgAttempts)..." -ForegroundColor DarkGray
        Start-Sleep -Seconds 2
    }
}

if (-not $pgReady) {
    Write-Host "WARNING: Postgres did not report ready in time. Continuing anyway..." -ForegroundColor Red
}

# --------------------------------------------------
# 5. Apply Prisma migrations
# --------------------------------------------------
Write-Host "`n[5/7] Applying database migrations (pnpm db:migrate:deploy)..." -ForegroundColor Yellow
if ($SkipMigrate) {
    Write-Host "Skipping migrations (-SkipMigrate)." -ForegroundColor DarkGray
} else {
    Set-Location $projectRoot
    pnpm db:migrate:deploy
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database migrations are up to date." -ForegroundColor Green
    } else {
        Write-Host "WARNING: pnpm db:migrate:deploy failed. Check the output above before testing." -ForegroundColor Red
        pause
    }
}

# --------------------------------------------------
# 6. Start API server in a new window
# --------------------------------------------------
Write-Host "`n[6/7] Starting API server..." -ForegroundColor Yellow
$apiCommand = "cd '$apiPath'; Write-Host '=== Vineyard Manager API ===' -ForegroundColor Cyan; pnpm dev; pause"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $apiCommand

# --------------------------------------------------
# 7. Start Web server in a new window
# --------------------------------------------------
Write-Host "`n[7/7] Starting Web server..." -ForegroundColor Yellow
$webCommand = "cd '$webPath'; Write-Host '=== Vineyard Manager Web ===' -ForegroundColor Cyan; pnpm dev; pause"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCommand

# --------------------------------------------------
# Open the browser
# --------------------------------------------------
Start-Sleep -Seconds 4
Write-Host "`nOpening http://localhost:5173 ..." -ForegroundColor Cyan
Start-Process "http://localhost:5173"

Write-Host "`n=== Startup complete ===" -ForegroundColor Green
Write-Host "API and Web are running in separate windows." -ForegroundColor Green
Write-Host "You can close this window." -ForegroundColor DarkGray
Write-Host ""
