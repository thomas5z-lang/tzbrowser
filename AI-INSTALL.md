# TZBrowser – Installationsanleitung für KI-Assistenten

Diese Datei richtet sich an KI-Assistenten (z. B. Claude) mit Zugriff auf ein Windows-Terminal,
die TZBrowser für einen Nutzer installieren sollen. Menschen lesen besser [docs/ANLEITUNG.md](docs/ANLEITUNG.md).

## Regeln

- Der Nutzer spricht vermutlich Deutsch und kennt sich evtl. wenig aus: kurze, einfache Rückmeldungen.
- **Vor jedem Schritt, der etwas installiert oder herunterlädt, kurz sagen, was passiert**, und bei
  den optionalen Add-ons vorher fragen, ob der Nutzer sie möchte.
- Keine Sicherheitsfunktionen von Windows abschalten (Defender, SmartScreen, UAC).
- Keine Passwörter oder Konten für den Nutzer anlegen. Nutzungsbedingungen (z. B. Cloudflare
  beim VPN) bestätigt der Nutzer selbst in TZBrowser.
- Nur die hier genannten offiziellen Quellen verwenden.
- Voraussetzung: Windows 10 oder 11, 64 Bit. Prüfen mit:
  `powershell -c "[Environment]::Is64BitOperatingSystem; (Get-CimInstance Win32_OperatingSystem).Caption"`

## Schritt 1 – TZBrowser installieren (Pflicht)

Neueste Version von GitHub laden und still installieren (pro Benutzer, keine Admin-Rechte nötig):

```powershell
$rel = Invoke-RestMethod -Headers @{ 'User-Agent' = 'tzb-install' } https://api.github.com/repos/thomas5z-lang/tzbrowser/releases/latest
$asset = $rel.assets | Where-Object { $_.name -match '^TZBrowser-Setup-.*\.exe$' } | Select-Object -First 1
$setup = Join-Path $env:TEMP $asset.name
Invoke-WebRequest $asset.browser_download_url -OutFile $setup
Start-Process $setup -ArgumentList '/S' -Wait
Remove-Item $setup
```

Prüfen: `Test-Path "$env:LOCALAPPDATA\Programs\TZBrowser\TZBrowser.exe"` muss `True` sein.
Danach dem Nutzer sagen: Desktop-Verknüpfung **TZBrowser** ist da. Updates kommen automatisch.

Falls der Nutzer TZBrowser lieber selbst per Doppelklick installiert: Link zur Releases-Seite geben
und erklären, dass bei „Der Computer wurde durch Windows geschützt“ auf **Weitere Informationen →
Trotzdem ausführen** geklickt werden muss (TZBrowser ist nicht kostenpflichtig signiert).

## Schritt 2 – Add-on „Stimme“ (optional, nachfragen)

Nutzen: natürlichere Vorlese-Stimme und Untertitel-Vorleser für Filme/Serien.

1. Python 3.10–3.12 prüfen: `py -3.12 --version` (oder 3.11/3.10).
   Fehlt es: mit Zustimmung des Nutzers `winget install -e --id Python.Python.3.12 --accept-package-agreements`
   *(das bestätigt die Lizenz von Python – vorher dem Nutzer sagen)*.
2. Add-on-Dateien holen:
   ```powershell
   $zip = Join-Path $env:TEMP 'tzbrowser-src.zip'
   Invoke-WebRequest https://github.com/thomas5z-lang/tzbrowser/archive/refs/heads/main.zip -OutFile $zip
   Expand-Archive $zip (Join-Path $env:TEMP 'tzbrowser-src') -Force
   $addon = Join-Path $env:TEMP 'tzbrowser-src\tzbrowser-main\addons\stimme'
   ```
3. Grafikkarte prüfen: `nvidia-smi --query-gpu=name,memory.total --format=csv`
   - Funktioniert der Befehl und hat die Karte **mindestens 6 GB**: Nutzer fragen, ob er die
     KI-Stimme möchte (ca. 6–8 GB Download, Modell nur für nicht-kommerzielle Nutzung) → mit `-Ki`.
   - Sonst ohne `-Ki` (nur Piper).
4. Installieren (dauert mit `-Ki` 10–20 Minuten, Ausgabe beobachten):
   ```powershell
   powershell -ExecutionPolicy Bypass -File "$addon\installieren.ps1"        # nur Piper
   powershell -ExecutionPolicy Bypass -File "$addon\installieren.ps1" -Ki    # mit KI-Stimme
   ```
5. Prüfen: `Test-Path "$HOME\TZBrowser-Stimme\server.py"` und `Get-ChildItem "$HOME\TZBrowser-Stimme\stimmen\*.onnx"`.
6. Aufräumen: `Remove-Item -Recurse -Force (Join-Path $env:TEMP 'tzbrowser-src'), $zip`
7. Dem Nutzer sagen: In TZBrowser unter ☰ → Extras → **Vorlese-Stimme** eine neue Stimme wählen.
   Der erste Start der KI-Stimme dauert einige Minuten (Modell wird geladen).

## Schritt 3 – Add-on „Ollama“ (optional, nachfragen)

Nutzen: lokaler KI-Assistent, private Übersetzung, Sprecher-Erkennung.

1. Installieren (mit Zustimmung): `winget install -e --id Ollama.Ollama --accept-package-agreements`
2. Modell nach Hardware wählen (Grafikspeicher wie oben prüfen):
   - keine NVIDIA-Karte oder < 6 GB → `qwen2.5:3b`
   - 6–11 GB → `qwen2.5:7b`
   - ab 12 GB → `qwen3:14b`
3. Laden: `ollama pull <modell>` (Pfad falls nötig: `"$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"`).
4. Wenn ein anderes Modell als `qwen2.5:7b` gewählt wurde, dem Nutzer sagen:
   TZBrowser → Einstellungen → Übersetzen → „Ollama-Modell für Übersetzungen“ auf `<modell>` setzen.

## Schritt 4 – Claude mit TZBrowser verbinden (nur auf ausdrücklichen Wunsch)

Erlaubt Claude Desktop, Tabs zu öffnen, Seitentext zu lesen, zu übersetzen und vorzulesen.
Anleitung: [docs/KI-SCHNITTSTELLE.md](docs/KI-SCHNITTSTELLE.md). Kurz:
1. Nutzer schaltet in TZBrowser Einstellungen → KI → **KI-Schnittstelle** ein.
2. Quellcode (Schritt 2.2) dauerhaft ablegen, z. B. `$HOME\TZBrowser-Quellcode`, Node.js wird benötigt.
3. In `claude_desktop_config.json` einen MCP-Server `tzbrowser` mit
   `node <Pfad>\tools\tzbrowser-mcp.js` eintragen. **Vorher eine Sicherungskopie der Datei anlegen**
   und bestehende Einträge erhalten.
4. Claude Desktop neu starten.

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| `py` nicht gefunden | Python neu installieren mit Haken „Add python.exe to PATH“, Terminal neu öffnen |
| pip-Fehler bei torch | Python-Version prüfen (3.10–3.12), NVIDIA-Treiber aktualisieren |
| Stimme erscheint nicht in TZBrowser | TZBrowser neu starten; Ordner unter Einstellungen → Vorlesen prüfen |
| Ollama-Befehl unbekannt | Terminal neu öffnen oder vollen Pfad nutzen (siehe oben) |

## Deinstallieren

- TZBrowser: `& "$env:LOCALAPPDATA\Programs\TZBrowser\Uninstall TZBrowser.exe" /S`
- Stimme: Ordner `$HOME\TZBrowser-Stimme` löschen
- Ollama: `winget uninstall Ollama.Ollama`
- Nutzerdaten (Lesezeichen, Passwörter!) liegen in `%APPDATA%\TZBrowser` – nur nach ausdrücklicher Bestätigung löschen.
