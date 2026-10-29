# Starts the Firestore emulator (if configured), backend :8000, frontend :3000, and connects the phone.
param([switch]$NoPhone, [switch]$Prod)
$root = Split-Path $PSScriptRoot -Parent
function Listening($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
function Spawn($dir, $file, $argv) { Start-Process -FilePath $file -ArgumentList $argv -WorkingDirectory $dir -WindowStyle Minimized }

if ((Select-String -Path "$root\backend\.env" -Pattern '^FIRESTORE_EMULATOR_HOST=' -Quiet) -and -not (Listening 8080)) {
  Spawn $root 'cmd' '/c','firebase emulators:start --only firestore --project demo-hackmatrix'; Start-Sleep 8
}
if (-not (Listening 8000)) {
  $py = if (Test-Path "$root\backend\.venv\Scripts\python.exe") { "$root\backend\.venv\Scripts\python.exe" } else { 'python' }
  Spawn "$root\backend" $py '-m','uvicorn','app.main:app','--port','8000'
}
if (-not (Listening 3000)) {
  if ($Prod) { Push-Location "$root\frontend"; npm run build; Pop-Location; Spawn "$root\frontend" 'cmd' '/c','npm start' }
  else { Spawn "$root\frontend" 'cmd' '/c','npm run dev' }
}
if (-not $NoPhone) { & "$PSScriptRoot\phone.ps1" }
Write-Host 'Backend http://localhost:8000/docs   Frontend http://localhost:3000   Phone http://localhost:3000'
