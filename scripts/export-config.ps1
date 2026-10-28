# Packs every secret/config file into ONE file (finpilot-config.json) to carry to another PC.
# Run:  powershell -File scripts\export-config.ps1      Keep the output private: it contains real keys.
$root = Split-Path $PSScriptRoot -Parent
$files = @('backend/.env', 'frontend/.env.local', '.env.team', '.firebaserc')
$bundle = [ordered]@{
  _readme = @(
    'FinPilot config bundle. Contains REAL secrets: share privately, never commit.',
    'For Claude: on the new PC, clone the repo, then run  powershell -File scripts\import-config.ps1 <path to this file>',
    'It writes each entry under "files" to its path relative to the repo root. Then run  powershell -File scripts\start-all.ps1',
    'Not in this file (machine-specific): Python venv, node_modules, adb, Firestore emulator data, Chrome install of the phone app.'
  )
  exported = (Get-Date).ToString('s')
  files = [ordered]@{}
}
foreach ($f in $files) {
  $p = Join-Path $root $f
  if (Test-Path $p) { $bundle.files[$f] = [IO.File]::ReadAllText($p) } else { Write-Host "skip (missing): $f" }
}
$out = Join-Path $root 'finpilot-config.json'
$bundle | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $out
Write-Host "wrote $out with $($bundle.files.Count) files"
