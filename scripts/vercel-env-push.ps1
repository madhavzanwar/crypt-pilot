# Copies your local keys to the Vercel project "finpilot" (Production). Needs: npm i -g vercel; vercel login; vercel link (once).
# Skips local-only values (emulator host, localhost API URL). FIREBASE_SERVICE_ACCOUNT_JSON must be supplied by you:
#   powershell -File scripts\vercel-env-push.ps1 -ServiceAccountFile C:\path\serviceAccount.json
param([string]$ServiceAccountFile)
$root = Split-Path $PSScriptRoot -Parent
$skip = 'FIRESTORE_EMULATOR_HOST','FIRESTORE_PROJECT_ID','NEXT_PUBLIC_API_URL','INNGEST_DEV','GOOGLE_APPLICATION_CREDENTIALS'
function Push($name, $value) { $value | vercel env add $name production --force | Out-Null; Write-Host "set $name" }
foreach ($f in 'backend\.env', 'frontend\.env.local') {
  if (-not (Test-Path "$root\$f")) { Write-Host "skip (missing): $f"; continue }
  foreach ($line in Get-Content "$root\$f") {
    if ($line -match '^\s*([A-Z][A-Z0-9_]*)=(.*)$' -and $skip -notcontains $Matches[1] -and $Matches[2]) {
      $name = $Matches[1]                       # copy first: the next -match overwrites $Matches
      $val = $Matches[2].Trim().Trim('"', "'")
      if ($val -match '^https?://(localhost|127\.0\.0\.1)') { Write-Host "skip $name (points at localhost)"; continue }
      Push $name $val
    }
  }
}
if ($ServiceAccountFile) { Push 'FIREBASE_SERVICE_ACCOUNT_JSON' ((Get-Content -Raw $ServiceAccountFile) -replace '\s*\r?\n\s*', '') }
else { Write-Host 'No -ServiceAccountFile given: the deployed backend will use temporary in-memory data until FIREBASE_SERVICE_ACCOUNT_JSON is set.' }
