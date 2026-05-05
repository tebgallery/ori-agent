# Instalador de ori - Agente de inicio de tareas Azure DevOps
param(
  [string]$GithubUser = "tebgallery",
  [string]$Repo = "ori-agent"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Instalando ori..." -ForegroundColor Cyan
Write-Host ""

# Verificar Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "  Node.js no encontrado." -ForegroundColor Red
  Write-Host "  Instalalo con: winget install OpenJS.NodeJS" -ForegroundColor Yellow
  Write-Host "  O descargalo de: https://nodejs.org" -ForegroundColor Yellow
  exit 1
}

$nodeVersion = node --version
Write-Host "  Node.js $nodeVersion detectado" -ForegroundColor Gray

# Verificar npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "  npm no encontrado. Reinstala Node.js." -ForegroundColor Red
  exit 1
}

# Instalar globalmente desde GitHub
$packageUrl = "https://github.com/$GithubUser/$Repo/archive/refs/heads/release-1.0.tar.gz"
Write-Host "  Descargando desde GitHub..." -ForegroundColor Gray

npm install -g $packageUrl

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "  Error durante la instalacion." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "  ori instalado correctamente." -ForegroundColor Green
Write-Host ""
Write-Host "  Uso:" -ForegroundColor Cyan
Write-Host "    ori start           Iniciar tarea (pregunta el ID)" -ForegroundColor White
Write-Host "    ori start 12345     Iniciar tarea con WI ID" -ForegroundColor White
Write-Host ""
Write-Host "  La primera vez se pedira organizacion, proyecto, PAT y ruta de repos." -ForegroundColor Gray
Write-Host ""
