# Cryptiq backend on a Windows laptop, free: fetch data + model from the PRIVATE Hugging Face repo,
# start the API, and open a free Cloudflare tunnel so the Vercel frontend can reach it.
#
# Run in PowerShell:   powershell -ExecutionPolicy Bypass -File .\run_on_laptop.ps1
# Needs about 3 GB of free RAM (the NetworkX graph engine uses about 2.6 GB) and winget (Windows 10/11).
# Steps 1-4 (fetch, production start, health) were validated on Linux; this PowerShell wrapper itself was NOT run on Windows.

$ErrorActionPreference = "Stop"
$Repo   = "https://github.com/madhavzanwar/cryptiq.git"
$Branch = "backend/live-run"
$Dir    = Join-Path $HOME "cryptiq"
$Art    = "madhavzanwar/cryptiq-artifacts"

function Need($cmd, $wingetId) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "Installing $cmd ..."
        winget install --id $wingetId -e --accept-package-agreements --accept-source-agreements
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            throw "$cmd was installed but is not on PATH yet. Close this window, open a NEW PowerShell and run the script again."
        }
    }
}

function Ask-Secret($prompt) {
    $s = Read-Host $prompt -AsSecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

function Rand-Hex {
    $b = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    ($b | ForEach-Object { $_.ToString("x2") }) -join ""
}

Write-Host "== 1/5 Tools" -ForegroundColor Cyan
Need git Git.Git
Need uv astral-sh.uv
Need cloudflared Cloudflare.cloudflared

Write-Host "== 2/5 Code" -ForegroundColor Cyan
if (-not (Test-Path $Dir)) { git clone --branch $Branch $Repo $Dir } else { git -C $Dir pull origin $Branch }
Set-Location (Join-Path $Dir "backend")
uv sync --frozen --no-dev

Write-Host "== 3/5 Settings (.env, kept on this laptop only, never committed)" -ForegroundColor Cyan
if (-not (Test-Path ".env")) {
    $frontend = Read-Host "Your Vercel frontend URL (press Enter to skip for now)"
    if (-not $frontend) { $frontend = "http://localhost:3000" }
    $lines = @(
        "APP_ENV=prod", "GRAPH_ENGINE=networkx",
        "SESSION_SECRET=$(Rand-Hex)", "LOG_SALT=$(Rand-Hex)", "ADMIN_TOKEN=$(Rand-Hex)",
        "COOKIE_SECURE=true", "COOKIE_SAMESITE=lax",
        "CORS_ORIGINS=$frontend", "FRONTEND_URL=$frontend",
        "DATABASE_URL=sqlite:///./data/cryptiq.sqlite", "STARTING_CREDITS=3", "RATE_LIMIT_CHECK=300/minute"
    )
    $gemini = Ask-Secret "Gemini API key for explanations (press Enter to skip: templates are used)"
    if ($gemini) {
        $lines += @("LLM_PROVIDER=openai_compatible", "LLM_MODEL=gemini-3.1-flash-lite",
                    "LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai",
                    "LLM_JSON_MODE=true", "LLM_API_KEY=$gemini")
    }
    $sarvam = Ask-Secret "Sarvam API key for voice (press Enter to skip: browser speech is used)"
    if ($sarvam) { $lines += @("SARVAM_API_KEY=$sarvam", "SARVAM_STT_MODEL=saaras:v4", "SARVAM_TTS_MODEL=bulbul:v4-flash") }
    # UTF-8 without BOM (a BOM would corrupt the first key)
    [IO.File]::WriteAllLines((Join-Path (Get-Location) ".env"), $lines, (New-Object Text.UTF8Encoding $false))
    Write-Host ".env written. Your ADMIN_TOKEN is inside it (open the file to read it)."
} else {
    Write-Host ".env already exists, keeping it."
}

Write-Host "== 4/5 Data and model (private Hugging Face repo)" -ForegroundColor Cyan
if (-not (Test-Path "data\processed\wallets.parquet")) {
    $env:ARTIFACTS_REPO = $Art
    $env:HF_TOKEN = Ask-Secret "Hugging Face READ token for $Art"
    try { uv run python scripts/fetch_artifacts.py } finally { Remove-Item Env:HF_TOKEN -ErrorAction SilentlyContinue; Remove-Item Env:ARTIFACTS_REPO -ErrorAction SilentlyContinue }
} else {
    Write-Host "data\ already present, skipping the download."
}

Write-Host "== 5/5 Start the API and the tunnel" -ForegroundColor Cyan
$backend = (Get-Location).Path
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backend'; uv run uvicorn app.main:app --host 127.0.0.1 --port 8000"

$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 3
    try { $h = Invoke-RestMethod "http://127.0.0.1:8000/api/health" -TimeoutSec 3; $ok = $true; break } catch { }
}
if (-not $ok) { throw "The API did not answer on http://127.0.0.1:8000/api/health. Read the error in the API window." }
$h | ConvertTo-Json
if ($h.dataSource -ne "elliptic++" -or $h.mocks) { Write-Warning "NOT on real data (dataSource=$($h.dataSource)). Do not present this." }
if (-not $h.modelLoaded -or -not $h.engineOk -or -not $h.ofacLoaded) { Write-Warning "Something is not loaded: check modelLoaded / engineOk / ofacLoaded above." }

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cloudflared tunnel --url http://127.0.0.1:8000"
Write-Host ""
Write-Host "Look in the new cloudflared window for a line like  https://something-random.trycloudflare.com" -ForegroundColor Green
Write-Host "1) Test it:  curl https://something-random.trycloudflare.com/api/health"
Write-Host "2) Put that URL in Vercel as BACKEND_URL, then redeploy the frontend."
Write-Host "3) Keep this laptop awake and both windows open during the demo. The URL changes every time the tunnel restarts."
