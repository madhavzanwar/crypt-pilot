# One-time Firebase setup for CryptPilot using the Firebase CLI (Windows twin of setup_firebase.sh). Run after `firebase login`.
#
#   powershell -ExecutionPolicy Bypass -File scripts\setup_firebase.ps1 -Project cryptpilot-demo-7421 [-Region asia-south1] [-Name CryptPilot]
#
# Creates/reuses the project, registers a Web app, creates the (default) Firestore database, deploys firestore.rules, tries to enable
# the sign-in providers from firebase.json, writes frontend\.env.local with the 7 NEXT_PUBLIC_FIREBASE_* values and replaces the old
# project id in .firebaserc / firebase.json / .env.example. It never creates, downloads or prints a service-account key.
# Free Spark plan only. First run on Windows PowerShell 5.1 found the stderr problem handled by Fb below; the rest of this script is still untested there.
param([Parameter(Mandatory = $true)][string]$Project, [string]$Region = "asia-south1", [string]$Name = "CryptPilot")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$OldId = "hackmatrix-3764f"
if ($Project -notmatch '^[a-z0-9-]{6,30}$') { throw "Project id: 6-30 chars, lowercase letters, digits and hyphens only; globally unique." }
if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) { throw "Install the CLI first: npm i -g firebase-tools" }

# Windows PowerShell 5.1 turns every stderr line of a native command into an error record, and the CLI prints progress
# ("- Preparing the list of your Firebase projects") on stderr. Merge stderr, turn the records into plain strings, and do not stop on them.
function Fb {
    $old = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & firebase @args --non-interactive 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $old }
}
function FbJson { $o = (Fb @args) -join "`n"; $i = $o.IndexOf("{"); if ($i -lt 0) { return $null }; try { $o.Substring($i) | ConvertFrom-Json } catch { $null } }
function Find-Key($o) {
    if ($null -eq $o) { return $null }
    if ($o -is [System.Management.Automation.PSCustomObject]) {
        if ($o.PSObject.Properties.Name -contains "apiKey") { return $o }
        foreach ($p in $o.PSObject.Properties) { $r = Find-Key $p.Value; if ($r) { return $r } }
    } elseif ($o -is [System.Collections.IEnumerable] -and $o -isnot [string]) {
        foreach ($x in $o) { $r = Find-Key $x; if ($r) { return $r } }
    }
    return $null
}

Write-Host "[0/7] checking login"
if (-not ((Fb login:list) -match "@")) { throw "Not logged in. Run: firebase login   (then run this script again)" }

Write-Host "[1/7] project $Project"
# Do not depend on the shape of the CLI's JSON: the id appearing in the project list (JSON or table) means we have it.
$listRaw = (Fb projects:list --json) -join "`n"
if ($listRaw -match [regex]::Escape($Project)) { Write-Host "  already exists, reusing it" }
else {
    $out = (Fb projects:create $Project --display-name $Name) -join "`n"
    Write-Host $out
    if ($out -match "already a project with ID") {
        # Taken: by you (earlier run) or by someone else. Access to its apps tells them apart.
        $probe = (Fb apps:list --project $Project) -join "`n"
        if ($probe -match "(?i)permission|not have|denied|403|not found|404") { throw "The project id '$Project' is taken by another account. Pick a different id." }
        Write-Host "  already yours, reusing it"
    } elseif ($out -match "(?i)error") { throw "Could not create the project: see the message above." }
}

Write-Host "[2/7] web app"
function Get-AppId { $r = FbJson apps:list WEB --project $Project --json; if ($r -and $r.result) { @($r.result)[0].appId } }
$AppId = Get-AppId
if (-not $AppId) { Fb apps:create WEB $Name --project $Project | Write-Host; $AppId = Get-AppId }
if (-not $AppId) { throw "No web app id found after creating it." }
Write-Host "  app id: $AppId"

Write-Host "[3/7] web config"
# The CLI's output shape varies (the config can be a JSON object or a string inside one), so read the raw text and pull each value out.
$raw = ((Fb apps:sdkconfig WEB $AppId --project $Project) -join "`n").Replace('\"', '"').Replace('\n', "`n")
function Get-CfgVal($key) { if ($raw -match ('"?' + $key + '"?\s*[:=]\s*"([^"]+)"')) { $Matches[1] } else { "" } }
$cfg = [pscustomobject]@{ apiKey = Get-CfgVal "apiKey"; authDomain = Get-CfgVal "authDomain"; storageBucket = Get-CfgVal "storageBucket";
                          messagingSenderId = Get-CfgVal "messagingSenderId"; measurementId = Get-CfgVal "measurementId" }
if (-not $cfg.apiKey) {
    Write-Host "---- CLI output (no secrets in it; the apiKey of a web app is public) ----"; Write-Host $raw
    throw "No apiKey found in the output above. Run: firebase apps:sdkconfig WEB $AppId --project $Project   and copy the values by hand."
}
$authDomain = if ($cfg.authDomain) { $cfg.authDomain } else { "$Project.firebaseapp.com" }

Write-Host "[4/7] Firestore database (location $Region; cannot be changed later)"
if ((Fb firestore:databases:list --project $Project) -match "\(default\)") { Write-Host "  (default) database exists" }
else { Fb firestore:databases:create "(default)" --location $Region --project $Project | Write-Host }

Write-Host "[5/7] repo files"
foreach ($f in @(".firebaserc", "firebase.json", ".env.example")) {
    $p = Join-Path $Root $f
    if (Test-Path $p) { $t = Get-Content $p -Raw; if ($t.Contains($OldId)) { [IO.File]::WriteAllText($p, $t.Replace($OldId, $Project), (New-Object Text.UTF8Encoding $false)); Write-Host "  updated $f" } }
}
$envf = Join-Path $Root "frontend\.env.local"
$keep = @()
if (Test-Path $envf) { Copy-Item $envf "$envf.bak" -Force; Write-Host "  existing .env.local saved as .env.local.bak"; $keep = Get-Content "$envf.bak" | Where-Object { $_ -notmatch '^NEXT_PUBLIC_FIREBASE_' } }
$new = @(
    "NEXT_PUBLIC_FIREBASE_API_KEY=$($cfg.apiKey)", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$authDomain",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID=$Project", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$($cfg.storageBucket)",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$($cfg.messagingSenderId)", "NEXT_PUBLIC_FIREBASE_APP_ID=$AppId",
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$($cfg.measurementId)")
[IO.File]::WriteAllLines($envf, ($keep + $new), (New-Object Text.UTF8Encoding $false))
Write-Host "  wrote frontend\.env.local (git-ignored)"

Write-Host "[6/7] deploy Firestore rules"
Push-Location $Root
try { Fb deploy --only firestore:rules --project $Project | Write-Host } finally { Pop-Location }
Write-Host "[7/7] sign-in providers (best effort, from firebase.json)"
Push-Location $Root
try { Fb deploy --only auth --project $Project | Select-Object -Last 3 | Write-Host } finally { Pop-Location }

Write-Host @"

Done. Still manual (the CLI cannot or must not do these):
  1. Console > Authentication > Sign-in method: confirm Email/Password and Google are ENABLED (enable by hand if step 7 failed).
     Settings > Authorized domains: add your Vercel domain.
  2. Console > Project settings > Service accounts > Generate new private key. Keep the JSON out of git and chat.
     Locally: GOOGLE_APPLICATION_CREDENTIALS=<path>. On Vercel/Render: whole JSON into FIREBASE_SERVICE_ACCOUNT_JSON; FIREBASE_PROJECT_ID=$Project.
  3. On Vercel set the 7 NEXT_PUBLIC_FIREBASE_* values from frontend\.env.local, then redeploy (inlined at build time).
Review changes with: git diff
"@
