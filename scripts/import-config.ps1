# Restores the files from finpilot-config.json into this checkout.
param([string]$Bundle = (Join-Path (Split-Path $PSScriptRoot -Parent) 'finpilot-config.json'))
$root = Split-Path $PSScriptRoot -Parent
$b = Get-Content -Raw $Bundle | ConvertFrom-Json
# Only these relative paths may be written (the bundle comes from a file someone carried over: never trust its paths).
$allowed = @('backend/.env', 'frontend/.env.local', '.env.team', '.firebaserc')
foreach ($prop in $b.files.PSObject.Properties) {
  if ($allowed -notcontains $prop.Name) { Write-Host "skipped (not an allowed path): $($prop.Name)"; continue }
  $dest = Join-Path $root $prop.Name
  if ((Resolve-Path -LiteralPath (Split-Path $dest -Parent) -ErrorAction SilentlyContinue) -eq $null) { New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null }
  [IO.File]::WriteAllText($dest, $prop.Value)
  Write-Host "restored $($prop.Name)"
}
