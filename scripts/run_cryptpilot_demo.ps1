# CryptPilot local demo launcher (Windows PowerShell).
#
# UNTESTED ON WINDOWS: this script was written alongside scripts/run_cryptpilot_demo.sh, which was run on Linux.
# This PowerShell version has never been executed. Expect to fix small things (quoting, PATH, npm/uv shims).
#
#   powershell -ExecutionPolicy Bypass -File scripts\run_cryptpilot_demo.ps1            start everything
#   powershell -ExecutionPolicy Bypass -File scripts\run_cryptpilot_demo.ps1 stop       stop what this script started
#   powershell -ExecutionPolicy Bypass -File scripts\run_cryptpilot_demo.ps1 status     show which saved PIDs are alive
#
# Starts three processes in the background, each with logs under .\.demo-logs\ (<name>.out.log and <name>.err.log)
# and its PID in <name>.pid:
#   1. crypto-service (Cryptiq)   uv run uvicorn app.main:app            http://127.0.0.1:8132
#   2. FinPilot API               python -m uvicorn app.main:app         http://127.0.0.1:8000
#   3. frontend                   npm run dev -- -p 3100                 http://localhost:3100
#
# Keys and settings are NEVER written here. They are read from the environment, or from an untracked .env file in the
# repo root (KEY=value lines; values already in the environment win). Names that matter are listed in
# docs\CRYPTPILOT_ARCHITECTURE.md.
# Data: the Elliptic++ data and model are not in git (no stated licence). If ARTIFACTS_REPO is set, they are fetched from
# that PRIVATE Hugging Face repo with crypto-service\scripts\fetch_artifacts.py using HF_TOKEN from the environment.
# The FinPilot API also needs its usual Firestore setup (emulator or service-account credentials, see ENVIRONMENT.md).
# Stopping uses the saved PIDs only (taskkill /T for the process tree); nothing is matched by name.

param([ValidateSet('start', 'stop', 'status')][string]$Action = 'start')

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Logs = Join-Path $Root '.demo-logs'
# Defaults are fixed; override only if those ports are taken.
$CryptoPort = if ($env:CRYPTPILOT_CRYPTO_PORT) { [int]$env:CRYPTPILOT_CRYPTO_PORT } else { 8132 }
$ApiPort = if ($env:CRYPTPILOT_API_PORT) { [int]$env:CRYPTPILOT_API_PORT } else { 8000 }
$WebPort = if ($env:CRYPTPILOT_WEB_PORT) { [int]$env:CRYPTPILOT_WEB_PORT } else { 3100 }

function Say($m) { Write-Host $m }
function Warn($m) { Write-Host "WARNING: $m" -ForegroundColor Yellow }
function Die($m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

function Test-Alive($procId) {
  if (-not $procId) { return $false }
  return [bool](Get-Process -Id $procId -ErrorAction SilentlyContinue)
}
function Read-Pid($name) {
  $f = Join-Path $Logs "$name.pid"
  if (Test-Path $f) { return [int](Get-Content $f -ErrorAction SilentlyContinue | Select-Object -First 1) }
  return $null
}
function Test-PortBusy($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Stop-One($name) {
  $procId = Read-Pid $name
  if ($null -eq $procId) { Say "  ${name}: no PID file"; return }
  if (Test-Alive $procId) {
    & taskkill.exe /PID $procId /T /F | Out-Null
    Say "  ${name}: stopped (pid $procId)"
  } else {
    Say "  ${name}: not running (stale pid $procId)"
  }
  Remove-Item (Join-Path $Logs "$name.pid") -ErrorAction SilentlyContinue
}

function Start-Stop {
  Say "Stopping CryptPilot demo processes saved in $Logs ..."
  Stop-One 'frontend'
  Stop-One 'finpilot-api'
  Stop-One 'crypto-service'
}

function Show-Status {
  foreach ($n in 'crypto-service', 'finpilot-api', 'frontend') {
    $procId = Read-Pid $n
    if (Test-Alive $procId) { Say "  ${n}: running (pid $procId)" } else { Say "  ${n}: not running" }
  }
}

function Import-DotEnv($path) {
  foreach ($line in Get-Content $path) {
    $l = $line.Trim()
    if ($l -eq '' -or $l.StartsWith('#')) { continue }
    if ($l.StartsWith('export ')) { $l = $l.Substring(7) }
    $i = $l.IndexOf('=')
    if ($i -lt 1) { continue }
    $k = $l.Substring(0, $i).Trim()
    $v = $l.Substring($i + 1).Trim()
    if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    if (-not [Environment]::GetEnvironmentVariable($k)) { [Environment]::SetEnvironmentVariable($k, $v, 'Process') }
  }
}

function Start-Bg($name, $dir, $file, $argv) {
  $existing = Read-Pid $name
  if (Test-Alive $existing) { Die "$name is already running (pid $existing). Run this script with: stop" }
  $p = Start-Process -FilePath $file -ArgumentList $argv -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $Logs "$name.out.log") -RedirectStandardError (Join-Path $Logs "$name.err.log")
  Set-Content -Path (Join-Path $Logs "$name.pid") -Value $p.Id
  Say "  ${name}: started (pid $($p.Id)), logs: .demo-logs\$name.out.log / .err.log"
}

function Wait-Http($url, $secs) {
  for ($i = 0; $i -lt $secs; $i++) {
    try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null; return $true } catch { Start-Sleep 1 }
  }
  return $false
}

function Start-All {
  New-Item -ItemType Directory -Force -Path $Logs | Out-Null

  $dotenv = Join-Path $Root '.env'
  if (Test-Path $dotenv) { Say "Reading $dotenv"; Import-DotEnv $dotenv }

  if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { Die 'uv is required for crypto-service (https://docs.astral.sh/uv/).' }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Die 'npm (Node.js) is required for the frontend.' }

  $alreadyOurs = ('crypto-service', 'finpilot-api', 'frontend' | ForEach-Object { Test-Alive (Read-Pid $_) }) -contains $true
  foreach ($p in $CryptoPort, $ApiPort, $WebPort) {
    if ((Test-PortBusy $p) -and -not $alreadyOurs) { Die "port $p is already in use by something else." }
  }

  # ---- 1. crypto-service ----
  Say "[1/3] crypto-service on :$CryptoPort"
  $cs = Join-Path $Root 'crypto-service'
  if ($env:ARTIFACTS_REPO) {
    if (-not $env:HF_TOKEN) { Warn 'ARTIFACTS_REPO is set but HF_TOKEN is not; a private repo will be refused.' }
    Say '  fetching data and artifacts from the private repo (log: .demo-logs\fetch-artifacts.out.log)'
    $f = Start-Process -FilePath 'uv' -ArgumentList 'run', 'python', '-m', 'scripts.fetch_artifacts' -WorkingDirectory $cs `
      -WindowStyle Hidden -Wait -PassThru `
      -RedirectStandardOutput (Join-Path $Logs 'fetch-artifacts.out.log') -RedirectStandardError (Join-Path $Logs 'fetch-artifacts.err.log')
    if ($f.ExitCode -ne 0) { Warn 'fetch_artifacts failed (see .demo-logs\fetch-artifacts.*.log); starting without fresh artifacts.' }
  } elseif (-not (Test-Path (Join-Path $cs 'data\processed'))) {
    Warn 'no ARTIFACTS_REPO and no crypto-service\data\processed: the service will start without data or a model (checks will not work).'
  }

  # Graph engine: honour GRAPH_ENGINE if set; otherwise TigerGraph when configured, else in-memory NetworkX (about 2.6 GB RAM, measured).
  if (-not $env:GRAPH_ENGINE) {
    if ($env:TG_HOST -and ($env:TG_SECRET -or $env:TG_PASSWORD)) { $env:GRAPH_ENGINE = 'tigergraph' } else { $env:GRAPH_ENGINE = 'networkx' }
  }
  Say "  graph engine: $($env:GRAPH_ENGINE)"
  # Where Dodo sends the browser back after checkout. Override FRONTEND_URL in the environment to change it.
  if (-not $env:FRONTEND_URL) { $env:FRONTEND_URL = "http://localhost:$WebPort" }
  if (-not $env:CORS_ORIGINS) { $env:CORS_ORIGINS = $env:FRONTEND_URL }
  Start-Bg 'crypto-service' $cs 'uv' @('run', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$CryptoPort")

  # ---- 2. FinPilot API ----
  Say "[2/3] FinPilot API on :$ApiPort"
  if (-not $env:FIRESTORE_EMULATOR_HOST -and -not $env:GOOGLE_APPLICATION_CREDENTIALS -and -not $env:FIREBASE_SERVICE_ACCOUNT_JSON) {
    Warn 'no Firestore setting in the environment (FIRESTORE_EMULATOR_HOST / GOOGLE_APPLICATION_CREDENTIALS). The API will only work if backend\.env or .env.local provides one.'
  }
  $venvPy = Join-Path $Root 'backend\.venv\Scripts\python.exe'
  $py = if (Test-Path $venvPy) { $venvPy } else { 'python' }
  $depsOk = $false
  try { $ErrorActionPreference = 'Continue'; & $py -c 'import fastapi, uvicorn' 2>$null; $depsOk = ($LASTEXITCODE -eq 0) } catch { $depsOk = $false } finally { $ErrorActionPreference = 'Stop' }
  if (-not $depsOk) { Warn "$py cannot import fastapi/uvicorn. Install the backend first: cd backend; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt" }
  $env:CRYPTO_SERVICE_URL = "http://127.0.0.1:$CryptoPort"
  $env:FINPILOT_DEMO_MODE = 'true'
  Start-Bg 'finpilot-api' (Join-Path $Root 'backend') $py @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$ApiPort")

  # ---- 3. frontend ----
  Say "[3/3] frontend on :$WebPort"
  $fe = Join-Path $Root 'frontend'
  if (-not (Test-Path (Join-Path $fe 'node_modules'))) {
    Say '  installing frontend dependencies (log: .demo-logs\npm-install.out.log)'
    $n = Start-Process -FilePath 'cmd' -ArgumentList '/c', 'npm install' -WorkingDirectory $fe -WindowStyle Hidden -Wait -PassThru `
      -RedirectStandardOutput (Join-Path $Logs 'npm-install.out.log') -RedirectStandardError (Join-Path $Logs 'npm-install.err.log')
    if ($n.ExitCode -ne 0) { Die 'npm install failed, see .demo-logs\npm-install.*.log' }
  }
  # The browser calls /api/crypto/* on its own origin; Next.js forwards /api/* to this URL (next.config.ts).
  if (-not $env:NEXT_PUBLIC_API_URL) { $env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:$ApiPort" }
  if ($env:CRYPTPILOT_WEB_MODE -eq 'prod') {
    # Production build: needed when the site is opened through a tunnel (the dev server blocks unknown hostnames).
    # BACKEND_URL is read at build time by next.config.ts (the /api/* forwarding).
    Say '  building the frontend for production (log: .demo-logs\npm-build.out.log), about a minute ...'
    $env:BACKEND_URL = $env:NEXT_PUBLIC_API_URL
    $env:NEXT_TELEMETRY_DISABLED = '1'
    $b = Start-Process -FilePath 'cmd' -ArgumentList '/c', 'npm run build' -WorkingDirectory $fe -WindowStyle Hidden -Wait -PassThru `
      -RedirectStandardOutput (Join-Path $Logs 'npm-build.out.log') -RedirectStandardError (Join-Path $Logs 'npm-build.err.log')
    if ($b.ExitCode -ne 0) { Die 'npm run build failed, see .demo-logs\npm-build.*.log' }
    Start-Bg 'frontend' $fe 'cmd' @('/c', "npm run start -- -p $WebPort")
  } else {
    Start-Bg 'frontend' $fe 'cmd' @('/c', "npm run dev -- -p $WebPort")
  }

  Say ''
  Say 'Waiting for crypto-service health (the NetworkX engine needs about 30 s to load) ...'
  if (Wait-Http "http://127.0.0.1:$CryptoPort/api/health" 120) { Say '  crypto-service is answering.' }
  else { Warn 'crypto-service did not answer in time. Check .demo-logs\crypto-service.err.log' }

  Say ''
  Say 'CryptPilot demo is starting:'
  Say "  Frontend         http://localhost:$WebPort   (Wallet Guard: /wallet-guard, Credits: /credits)"
  Say "  FinPilot API     http://127.0.0.1:$ApiPort/docs"
  Say "  Crypto bridge    http://127.0.0.1:$ApiPort/api/crypto/status"
  Say "  crypto-service   http://127.0.0.1:$CryptoPort/api/health"
  Say "  Logs             $Logs"
  Say 'Stop with:        powershell -ExecutionPolicy Bypass -File scripts\run_cryptpilot_demo.ps1 stop'
}

switch ($Action) {
  'start' { Start-All }
  'stop' { Start-Stop }
  'status' { Show-Status }
}
