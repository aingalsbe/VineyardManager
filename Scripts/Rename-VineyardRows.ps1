# Rename live Vineyard Manager rows:
#   L1–L4  → NS1–NS4  / North South 1–4
#   S1–S11 → EW1–EW11 / East West 1–11
#
# Does not stop the app. Re-seed from an old seed.ts will put L/S codes back.

[CmdletBinding()]
param(
    [string]$ProjectRoot = "C:\AIProjects\VineyardManager"
)

$ErrorActionPreference = "Stop"

$sqlFile = Join-Path $PSScriptRoot "Rename-VineyardRows.sql"
if (-not (Test-Path -LiteralPath $sqlFile)) {
    throw "SQL file not found next to this script: $sqlFile"
}

Write-Host "Applying row renames via docker compose postgres..." -ForegroundColor Cyan
Set-Location $ProjectRoot

Get-Content -LiteralPath $sqlFile -Raw | docker compose exec -T postgres psql -U vineyard -d vineyard_manager
if ($LASTEXITCODE -ne 0) {
    throw "psql failed with exit code $LASTEXITCODE"
}

Write-Host "Done. Refresh /rows and the dashboard map." -ForegroundColor Green
Write-Host "Note: apps/api/prisma/seed.ts still uses L/S codes until that file is updated."
