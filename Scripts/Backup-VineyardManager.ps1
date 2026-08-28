# Vineyard Manager - Backup Script
# Commits local changes if needed, mirrors files to NAS, pushes NAS Git + GitHub.
# Does NOT stop the web app, API, or Docker.

[CmdletBinding()]
param(
    [string]$CommitMessage,
    [switch]$SkipCommit
)

$ErrorActionPreference = "Continue"

$project  = "C:\AIProjects\VineyardManager"
$nasFiles = "N:\AIProjects\VineyardManager"
$nasGit   = "nas"
$github   = "origin"

Write-Host "`n=== Starting Vineyard Manager Backup ===" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $project)) {
    Write-Host "Project not found: $project" -ForegroundColor Red
    exit 1
}

Set-Location $project

# 0. Commit dirty work so an independent backup still lands on git
if (-not $SkipCommit) {
    Write-Host "`n[0/3] Checking git working tree..." -ForegroundColor Yellow
    $porcelain = git status --porcelain
    if ($LASTEXITCODE -ne 0) {
        Write-Host "git status failed." -ForegroundColor Red
    } elseif ([string]::IsNullOrWhiteSpace($porcelain)) {
        Write-Host "Working tree clean. Nothing to commit." -ForegroundColor Green
    } else {
        git status --short
        if (-not $CommitMessage) {
            $CommitMessage = Read-Host "Commit message"
        }
        if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
            Write-Host "No commit message. Skipping commit; pushes will use the last commit." -ForegroundColor Yellow
        } else {
            git add -A
            git commit -m $CommitMessage
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Commit successful." -ForegroundColor Green
            } else {
                Write-Host "git commit failed." -ForegroundColor Red
            }
        }
    }
}

# 1. Sync files to NAS
Write-Host "`n[1/3] Syncing files to NAS..." -ForegroundColor Yellow
if (-not (Test-Path -LiteralPath "N:\")) {
    Write-Host "NAS drive N:\ is not available." -ForegroundColor Red
} else {
    if (-not (Test-Path -LiteralPath $nasFiles)) {
        New-Item -ItemType Directory -Path $nasFiles -Force | Out-Null
    }
    robocopy $project $nasFiles /MIR /XD node_modules .next dist build coverage .turbo .git /XF *.log .env /NFL /NDL /NJH /NJS
    if ($LASTEXITCODE -ge 8) {
        Write-Host "Robocopy encountered errors." -ForegroundColor Red
    } else {
        Write-Host "Files synced successfully." -ForegroundColor Green
    }
    $global:LASTEXITCODE = 0
}

# 2. Push to NAS Git
Write-Host "`n[2/3] Pushing to NAS Git..." -ForegroundColor Yellow
git push $nasGit main
if ($LASTEXITCODE -eq 0) {
    Write-Host "NAS Git push successful." -ForegroundColor Green
} else {
    Write-Host "NAS Git push failed." -ForegroundColor Red
}

# 3. Push to GitHub
Write-Host "`n[3/3] Pushing to GitHub..." -ForegroundColor Yellow
git push $github main
if ($LASTEXITCODE -eq 0) {
    Write-Host "GitHub push successful." -ForegroundColor Green
} else {
    Write-Host "GitHub push failed." -ForegroundColor Red
}

Write-Host "`n=== Backup Complete (app was not stopped) ===" -ForegroundColor Cyan
Set-Location $project
