# Vineyard Manager - Stop Script
# Stops the local web + API, then runs Backup-VineyardManager.ps1
# (commit if dirty, NAS file mirror, nas git push, GitHub push).
#
# To snapshot without stopping the app, run Backup-VineyardManager.ps1 instead.

[CmdletBinding()]
param(
    [string]$CommitMessage,
    [switch]$StopDocker,
    [switch]$SkipBackup
)

$ErrorActionPreference = "Continue"

$project      = "C:\AIProjects\VineyardManager"
$scriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupScript = Join-Path $scriptDir "Backup-VineyardManager.ps1"

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

if ($SkipBackup) {
    Write-Host "`nStopped. Backup skipped (-SkipBackup)." -ForegroundColor Yellow
    return
}

if (-not (Test-Path -LiteralPath $backupScript)) {
    Write-Host "Backup script not found: $backupScript" -ForegroundColor Red
    exit 1
}

Write-Step "Backup (commit + NAS + git remotes)"
$backupArgs = @()
if ($CommitMessage) {
    $backupArgs += "-CommitMessage"
    $backupArgs += $CommitMessage
}
& $backupScript @backupArgs

Write-Host "`n=== Stop complete ===" -ForegroundColor Cyan
