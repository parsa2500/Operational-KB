param(
  [Parameter(Mandatory=$true)][string]$ProjectPath,
  [switch]$SkipInstall,
  [switch]$SkipIngest
)
# Native tools (docker/npm) write warnings to stderr; treat only non-zero exit as failure.
$ErrorActionPreference = 'Continue'
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}
function Assert-LastExit([string]$step) {
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "$step failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path $ProjectPath)) { throw "Project path does not exist: $ProjectPath" }
$env:TARGET_REPO_PATH = (Resolve-Path $ProjectPath).Path
Write-Host "Target: $env:TARGET_REPO_PATH" -ForegroundColor Cyan

docker compose up -d
Assert-LastExit 'docker compose up'

if (-not $SkipInstall) {
  npm install
  Assert-LastExit 'npm install'
}
npm run db:migrate
Assert-LastExit 'db:migrate'
npm run analyzer:roslyn:build
Assert-LastExit 'analyzer:roslyn:build'
if (-not $SkipIngest) {
  npm run ingest
  Assert-LastExit 'ingest'
}
npm run check
Assert-LastExit 'check'
Write-Host "Opening http://127.0.0.1:5051" -ForegroundColor Green
Start-Process 'http://127.0.0.1:5051'
npm run dev
