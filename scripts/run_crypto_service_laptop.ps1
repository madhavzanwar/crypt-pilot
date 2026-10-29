# Run ONLY the crypto-service on this Windows machine and publish it through a free Cloudflare quick tunnel, so a hosted
# FinPilot API (Vercel / Render) can reach it. For the all-in-one local demo use run_cryptpilot_demo.ps1 instead.
#
#   powershell -ExecutionPolicy Bypass -File scripts\run_crypto_service_laptop.ps1          start service + tunnel
#   powershell -ExecutionPolicy Bypass -File scripts\run_crypto_service_laptop.ps1 stop     stop both
#
# Prints CRYPTO_SERVICE_URL=<tunnel>: set it on the HOSTED FinPilot API and redeploy. The browser never talks to it:
# browser -> frontend (/api/*) -> FinPilot API bridge -> tunnel -> crypto-service. The URL changes on every start.
# Settings come from the environment or an untracked .env in the repo root (parsed as KEY=value data).
# Needs: uv (astral-sh.uv), cloudflared (Cloudflare.cloudflared). This script was NOT run on Windows (the bash twin was
# run with a stubbed cloudflared on Linux); if it fails, read .demo-logs\*.log.
param([ValidateSet("start", "stop")][string]$Action = "start")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root ".demo-logs"
$Port = if ($env:CRYPTPILOT_CRYPTO_PORT) { $env:CRYPTPILOT_CRYPTO_PORT } else { "8132" }
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

function Stop-Saved($name) {
    $f = Join-Path $Logs "$name.pid"
    if (Test-Path $f) {
        $procId = [int](Get-Content $f)
        # taskkill /T also ends the child processes uv and cloudflared start
        taskkill /PID $procId /T /F 2>$null | Out-Null
        Remove-Item $f -Force
        Write-Host "  ${name}: stopped"
    } else { Write-Host "  ${name}: no PID file" }
}

if ($Action -eq "stop") { Stop-Saved "cloudflared"; Stop-Saved "crypto-service-laptop"; return }

foreach ($tool in @("uv", "cloudflared")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is required. Install: winget install $(if ($tool -eq 'uv') {'astral-sh.uv'} else {'Cloudflare.cloudflared'})" }
}

$envFile = Join-Path $Root ".env"
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        $l = $line.Trim()
        if ($l -eq "" -or $l.StartsWith("#") -or -not $l.Contains("=")) { continue }
        $k = $l.Substring(0, $l.IndexOf("=")).Trim() -replace '^export\s+', ''
        $v = $l.Substring($l.IndexOf("=") + 1).Trim()
        if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) { $v = $v.Substring(1, $v.Length - 2) }
        if ($k -match '^[A-Za-z0-9_]+$' -and -not [Environment]::GetEnvironmentVariable($k)) { [Environment]::SetEnvironmentVariable($k, $v) }
    }
}

if (Test-Path (Join-Path $Logs "crypto-service-laptop.pid")) { throw "Already started. Run this script with: stop" }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is already in use." }

if ($env:ARTIFACTS_REPO) {
    if (-not $env:HF_TOKEN) { Write-Warning "ARTIFACTS_REPO is set but HF_TOKEN is not; a private repo will be refused." }
    Write-Host "[1/3] fetching data and model (log: .demo-logs\fetch-artifacts.log)"
    Push-Location (Join-Path $Root "crypto-service")
    try { uv run python -m scripts.fetch_artifacts *> (Join-Path $Logs "fetch-artifacts.log") } catch { Write-Warning "fetch_artifacts failed; see the log. Continuing." } finally { Pop-Location }
} elseif (-not (Test-Path (Join-Path $Root "crypto-service\data\processed"))) {
    Write-Warning "no ARTIFACTS_REPO and no crypto-service\data\processed: checks will not work."
}

if (-not $env:GRAPH_ENGINE) {
    $env:GRAPH_ENGINE = if ($env:TG_HOST -and ($env:TG_SECRET -or $env:TG_PASSWORD)) { "tigergraph" } else { "networkx" }
}
if (-not $env:CRYPTO_TRUST_PROXY) { $env:CRYPTO_TRUST_PROXY = "true" }  # the bridge sets X-Forwarded-For (one proxy hop)

Write-Host "[2/3] crypto-service on 127.0.0.1:$Port (graph engine: $($env:GRAPH_ENGINE))"
$svc = Start-Process -FilePath "uv" -ArgumentList @("run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", $Port) `
    -WorkingDirectory (Join-Path $Root "crypto-service") -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $Logs "crypto-service-laptop.log") -RedirectStandardError (Join-Path $Logs "crypto-service-laptop.err.log")
$svc.Id | Set-Content (Join-Path $Logs "crypto-service-laptop.pid")

$ok = $false
for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    try { $h = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 3; $ok = $true; break } catch { if ($svc.HasExited) { break } }
}
if (-not $ok) { Stop-Saved "crypto-service-laptop"; throw "No answer on /api/health. See .demo-logs\crypto-service-laptop.err.log" }
Write-Host ("  health: " + ($h | ConvertTo-Json -Compress))

Write-Host "[3/3] Cloudflare quick tunnel"
$tun = Start-Process -FilePath "cloudflared" -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:$Port") -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $Logs "cloudflared.out.log") -RedirectStandardError (Join-Path $Logs "cloudflared.log")
$tun.Id | Set-Content (Join-Path $Logs "cloudflared.pid")
$url = $null
for ($i = 0; $i -lt 30 -and -not $url; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path (Join-Path $Logs "cloudflared.log")) {
        $m = Select-String -Path (Join-Path $Logs "cloudflared.log") -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
        if ($m) { $url = $m.Matches[0].Value }
    }
}
if (-not $url) { Stop-Saved "cloudflared"; Stop-Saved "crypto-service-laptop"; throw "No tunnel URL after 30 s. See .demo-logs\cloudflared.log" }
$url | Set-Content (Join-Path $Logs "tunnel-url.txt")

Write-Host ""
Write-Host "Done. Keep this machine awake; the URL changes on restart."
Write-Host ""
Write-Host "  CRYPTO_SERVICE_URL=$url"
Write-Host ""
Write-Host "1) Set that on the hosted FinPilot API (Render: Environment; Vercel: project env) and redeploy / restart it."
Write-Host "   Also set CRYPTO_TRUST_PROXY=true on the API if its host sets X-Forwarded-For itself."
Write-Host "2) Check:  curl $url/api/health"
Write-Host "3) Dodo webhook (test mode): https://<your-hosted-API-or-site>/api/crypto/webhooks/dodo"
Write-Host "   events: payment.succeeded, payment.refunded, refund.succeeded, dispute.accepted, dispute.lost"
Write-Host "4) FRONTEND_URL (where Dodo returns the browser) must be your hosted site; set it in .env before starting."
