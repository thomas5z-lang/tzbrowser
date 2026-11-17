# Lädt die Hilfsprogramme in den Ordner bin\ (werden nicht im Repository gespeichert):
#   ffmpeg/ffprobe (LGPL-Build von BtbN)  – Streams speichern, MP3-Export beim Vorlesen
#   wgcf (MIT)                             – kostenloses Cloudflare-WARP-Profil für das VPN
#   wireproxy (ISC)                        – WireGuard als lokaler Proxy für das VPN
# Aufruf: npm run fetch-bin
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
$bin = Join-Path $root 'bin'
$tmp = Join-Path $env:TEMP ('tzb-bin-' + [guid]::NewGuid())
New-Item -ItemType Directory -Force $bin, $tmp | Out-Null
$hdr = @{ 'User-Agent' = 'TZBrowser-fetch-bin' }

function Latest($repo, $pattern) {
  $rel = Invoke-RestMethod -Headers $hdr "https://api.github.com/repos/$repo/releases/latest"
  $asset = $rel.assets | Where-Object { $_.name -match $pattern } | Select-Object -First 1
  if (-not $asset) { throw "Keine passende Datei in $repo ($pattern)" }
  return $asset.browser_download_url
}

if (-not (Test-Path (Join-Path $bin 'ffmpeg.exe'))) {
  Write-Host 'Lade ffmpeg (LGPL) ...'
  $zip = Join-Path $tmp 'ffmpeg.zip'
  Invoke-WebRequest -Headers $hdr 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip' -OutFile $zip
  Expand-Archive $zip (Join-Path $tmp 'ff')
  Get-ChildItem (Join-Path $tmp 'ff') -Recurse -Include ffmpeg.exe, ffprobe.exe | Copy-Item -Destination $bin -Force
}
if (-not (Test-Path (Join-Path $bin 'wgcf.exe'))) {
  Write-Host 'Lade wgcf ...'
  Invoke-WebRequest -Headers $hdr (Latest 'ViRb3/wgcf' 'windows_amd64\.exe$') -OutFile (Join-Path $bin 'wgcf.exe')
}
if (-not (Test-Path (Join-Path $bin 'wireproxy.exe'))) {
  Write-Host 'Lade wireproxy ...'
  $tgz = Join-Path $tmp 'wireproxy.tar.gz'
  Invoke-WebRequest -Headers $hdr (Latest 'whyvl/wireproxy' 'windows_amd64\.tar\.gz$') -OutFile $tgz
  tar -xzf $tgz -C $tmp
  Copy-Item (Get-ChildItem $tmp -Recurse -Filter wireproxy.exe | Select-Object -First 1).FullName $bin -Force
}
Remove-Item -Recurse -Force $tmp
Write-Host 'Fertig:' ((Get-ChildItem $bin -Filter *.exe).Name -join ', ')
