param(
  [Parameter(Mandatory=$true)][string]$ProjectPath,
  [switch]$SkipInstall,
  [switch]$SkipIngest
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $ProjectPath)) { throw "Project path does not exist: $ProjectPath" }
$env:TARGET_REPO_PATH = (Resolve-Path $ProjectPath).Path
Write-Host "Target: $env:TARGET_REPO_PATH" -ForegroundColor Cyan

docker compose up -d
if (-not $SkipInstall) { npm install }
npm run db:migrate
npm run analyzer:roslyn:build
if (-not $SkipIngest) { npm run ingest }
npm run check
Write-Host "Opening http://127.0.0.1:5051" -ForegroundColor Green
Start-Process 'http://127.0.0.1:5051'
npm run dev
