# Restores the files from finpilot-config.json into this checkout.
param([string]$Bundle = (Join-Path (Split-Path $PSScriptRoot -Parent) 'finpilot-config.json'))
$root = Split-Path $PSScriptRoot -Parent
$b = Get-Content -Raw $Bundle | ConvertFrom-Json
foreach ($prop in $b.files.PSObject.Properties) {
  $dest = Join-Path $root $prop.Name
  if ((Resolve-Path -LiteralPath (Split-Path $dest -Parent) -ErrorAction SilentlyContinue) -eq $null) { New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null }
  [IO.File]::WriteAllText($dest, $prop.Value)
  Write-Host "restored $($prop.Name)"
}
