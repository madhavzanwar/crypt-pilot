# Connects the phone to adb and forwards localhost ports so http://localhost:3000 works on it. (The old /pay page was removed with FinPilot Pay.)
#   First time, USB plugged in:           scripts\phone.ps1 -Wifi      (switches adb to Wi-Fi; then you can unplug)
#   Android 11+ without USB:              scripts\phone.ps1 -Pair 192.168.1.5:37123 123456   (Developer options > Wireless debugging > Pair with code)
#   Afterwards (USB or Wi-Fi):            scripts\phone.ps1
param([switch]$Wifi, [string[]]$Pair)
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) { $adb = "$env:USERPROFILE\platform-tools\adb.exe" }
$ipFile = Join-Path $PSScriptRoot '.phone-ip'
function Devices { (& $adb devices) | Select-String "`tdevice$" | ForEach-Object { ($_ -split "`t")[0] } }

if ($Pair) { & $adb pair $Pair[0] $Pair[1]; Write-Host "Now enter the IP:PORT shown on the main Wireless debugging screen:"; $hp = Read-Host; & $adb connect $hp; Set-Content $ipFile $hp }
elseif ($Wifi) {
  if (-not (Devices)) { Write-Host 'Plug the phone in by USB (USB debugging on) and run again.'; exit 1 }
  $ip = ((& $adb shell ip -f inet addr show wlan0) -join ' ') -replace '.*inet (\d+\.\d+\.\d+\.\d+).*', '$1'
  & $adb tcpip 5555; Start-Sleep 2; & $adb connect "${ip}:5555"; Set-Content $ipFile "${ip}:5555"
  Write-Host "Wi-Fi adb ready at ${ip}:5555. You can unplug the cable (phone and PC on the same Wi-Fi)."
}
if (-not (Devices) -and (Test-Path $ipFile)) { & $adb connect (Get-Content $ipFile) | Out-Null }
if (-not (Devices)) { Write-Host 'No phone found. Plug USB, or run with -Wifi / -Pair once.'; exit 1 }
$target = @(Devices) | Where-Object { $_ -match ':\d+$' } | Select-Object -First 1   # prefer the Wi-Fi link when USB is also plugged in
if (-not $target) { $target = @(Devices)[0] }
& $adb -s $target reverse tcp:3000 tcp:3000; & $adb -s $target reverse tcp:8000 tcp:8000
Write-Host 'Phone ready. Open Chrome on it: http://localhost:3000'
