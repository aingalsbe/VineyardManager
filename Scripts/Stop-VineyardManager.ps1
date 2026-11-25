# Vineyard Manager - Stop Script
# Stops the local web + API (and optionally Docker Postgres), then runs a
# read-only git check so any leftover local edits don't go unnoticed.
# Does NOT commit, push, or upload to NAS.

[CmdletBinding()]
param(
    [switch]$StopDocker
)

$ErrorActionPreference = "Continue"

$repoRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { "C:\AIProjects" }
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "VineyardManager"))) {
    $repoRoot = "C:\AIProjects"
}
$project = Join-Path $repoRoot "VineyardManager"

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Stop-PortListeners([int[]]$Ports) {
    foreach ($port in $Ports) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "Stopping PID $($proc.Id) ($($proc.ProcessName)) on port $port"
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

Write-Host "`n=== Stopping Vineyard Manager ===" -ForegroundColor Cyan

Write-Step "Stop web (5173) + API (3001)"
Stop-PortListeners @(5173, 3001)

Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'pnpm.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and (
            $_.CommandLine -match 'VineyardManager' -or
            $_.CommandLine -match 'vite' -or
            $_.CommandLine -match 'apps[/\\]api'
        )
    } |
    ForEach-Object {
        Write-Host "Stopping leftover $($_.Name) PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

if ($StopDocker) {
    Write-Step "Stop Docker Postgres"
    $compose = Join-Path $project "docker-compose.yml"
    if (Test-Path -LiteralPath $compose) {
        Push-Location $project
        try { docker compose down } finally { Pop-Location }
    }
} else {
    Write-Host "Leaving Docker / Postgres running (pass -StopDocker to shut it down)."
}

# Read-only Git status check so local test edits aren't forgotten
if ((Get-Command git -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath (Join-Path $repoRoot ".git"))) {
    Write-Step "Check git status (read-only)"
    Push-Location $repoRoot
    try {
        # Scope status to this repo's paths so sibling folders in C:\AIProjects (e.g. other projects) are ignored
        $porcelain = @(git status --porcelain -- VineyardManager Scripts .github README.md .gitignore)
        $gitStatusExit = $LASTEXITCODE
        $hasDirty = ($porcelain.Count -gt 0) -and (-not [string]::IsNullOrWhiteSpace(($porcelain -join "`n")))

        if ($gitStatusExit -ne 0) {
            Write-Host "WARNING: git status failed; could not check for local changes." -ForegroundColor Yellow
        } else {
            $aheadRaw = ((git rev-list --count "@{u}..HEAD" 2>$null) -join "").Trim()
            $aheadCount = 0
            if ($LASTEXITCODE -eq 0 -and $aheadRaw -match '^\d+$') {
                $aheadCount = [int]$aheadRaw
            }

            if (-not $hasDirty -and $aheadCount -eq 0) {
                Write-Host "Git working tree is clean and in sync with GitHub." -ForegroundColor Green
            } else {
                if ($hasDirty) {
                    Write-Host "WARNING: Local uncommitted changes detected:" -ForegroundColor Yellow
                    git status --short -- VineyardManager Scripts .github README.md .gitignore
                }
                if ($aheadCount -gt 0) {
                    Write-Host "WARNING: $aheadCount local commit(s) have not been pushed to GitHub." -ForegroundColor Yellow
                }
                Write-Host ""
                Write-Host "This script does not commit, push, or back up to NAS." -ForegroundColor DarkGray
                Write-Host "  Discard throwaway test edits:  git -C `"$repoRoot`" restore -- VineyardManager Scripts" -ForegroundColor DarkGray
                Write-Host "  Keep changes:                  commit/push on a branch or share the diff in chat." -ForegroundColor DarkGray
                Write-Host ""
                pause
            }
        }
    } finally {
        Pop-Location
    }
}

Write-Host "`n=== Stop complete ===" -ForegroundColor Cyan
