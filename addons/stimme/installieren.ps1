# TZBrowser Add-on "Stimme" installieren
# Aufruf (PowerShell, im Ordner addons\stimme):
#   powershell -ExecutionPolicy Bypass -File installieren.ps1            # Piper-Stimmen (laeuft auf jedem PC)
#   powershell -ExecutionPolicy Bypass -File installieren.ps1 -Ki        # zusaetzlich KI-Stimme OmniVoice (NVIDIA-Grafikkarte noetig)
#   powershell -ExecutionPolicy Bypass -File installieren.ps1 -Ziel D:\Stimme
param(
  [switch]$Ki,
  [string]$Ziel = (Join-Path $HOME 'TZBrowser-Stimme')
)
$ErrorActionPreference = 'Stop'
$quelle = $PSScriptRoot

Write-Host ''
Write-Host '  TZBrowser Add-on "Stimme"' -ForegroundColor Magenta
Write-Host "  Zielordner: $Ziel"
Write-Host ''

# 1. Python finden (3.10, 3.11 oder 3.12)
$py = $null
foreach ($v in '3.12', '3.11', '3.10') {
  try { $p = & py "-$v" -c "import sys; print(sys.executable)" 2>$null; if ($LASTEXITCODE -eq 0 -and $p) { $py = $p.Trim(); break } } catch { }
}
if (-not $py) {
  Write-Host 'Python 3.10 bis 3.12 wurde nicht gefunden.' -ForegroundColor Red
  Write-Host 'Bitte installieren: https://www.python.org/downloads/ (Haken bei "Add python.exe to PATH" setzen)'
  Write-Host 'oder: winget install Python.Python.3.12'
  exit 1
}
Write-Host "Python: $py"

# 2. Dateien kopieren
New-Item -ItemType Directory -Force $Ziel | Out-Null
foreach ($f in 'server.py', 'sprecher.py', 'stimmen_laden.py', 'Start.bat', 'LIESMICH.md') {
  Copy-Item -Force (Join-Path $quelle $f) $Ziel
}

# 3. Piper (schnelle Stimmen, Prozessor)
Write-Host ''
Write-Host 'Installiere Piper ...' -ForegroundColor Cyan
& $py -m venv (Join-Path $Ziel 'venv')
$venvPy = Join-Path $Ziel 'venv\Scripts\python.exe'
& $venvPy -m pip install --upgrade pip --quiet
& $venvPy -m pip install numpy piper-tts --quiet
& $venvPy (Join-Path $Ziel 'stimmen_laden.py')

# 4. Optional: KI-Stimme OmniVoice (NVIDIA-Grafikkarte, ca. 6 GB Download)
if ($Ki) {
  Write-Host ''
  Write-Host 'Installiere KI-Stimme OmniVoice (dauert einige Minuten) ...' -ForegroundColor Cyan
  & $py -m venv (Join-Path $Ziel 'venv_omni')
  $omniPy = Join-Path $Ziel 'venv_omni\Scripts\python.exe'
  & $omniPy -m pip install --upgrade pip --quiet
  & $omniPy -m pip install torch==2.8.0+cu128 torchaudio==2.8.0+cu128 --extra-index-url https://download.pytorch.org/whl/cu128
  & $omniPy -m pip install omnivoice soundfile numpy piper-tts
  & $omniPy -c "import torch; print('Grafikkarte erkannt:', torch.cuda.is_available())"
}

Write-Host ''
Write-Host 'Fertig!' -ForegroundColor Green
Write-Host "TZBrowser findet die Stimme automatisch in $Ziel"
Write-Host '(sonst: Einstellungen -> Vorlesen -> Ordner des Sprach-Add-ons waehlen).'
