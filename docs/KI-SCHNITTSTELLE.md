# TZBrowser KI-Schnittstelle

Damit Claude oder eigene Skripte TZBrowser steuern können.

- Einschalten: ☰ → KI-Schnittstelle → „KI-Schnittstelle aktiv“ (standardmäßig **aus**)
- Adresse: `http://127.0.0.1:47800` (nur auf diesem PC erreichbar)
- Schlüssel: `%APPDATA%\TZBrowser\api-token.txt` (☰ → KI-Schnittstelle → „Schlüssel kopieren“)
- Jede Anfrage braucht: `Authorization: Bearer <Schlüssel>`

## Schutz
- Anfragen von Webseiten (mit `Origin`-Kopfzeile) werden immer abgewiesen
- Private Tabs und TZBrowser-interne Seiten sind unsichtbar
- Kein Zugriff auf Passwörter, kein Absenden von Formularen, kein Ausführen von Skripten
- Nur `http://` und `https://` Adressen

## Befehle

| Methode | Pfad | Inhalt | Ergebnis |
|---|---|---|---|
| GET | `/v1/status` | – | Version, Fenster, Tabs, Vorlesen, VPN |
| GET | `/v1/tabs` | – | Liste der Tabs `{id, title, url, active}` |
| GET | `/v1/tabs/<id>/text?max=20000` | – | Seitentext (bei Übersetzung schon auf Deutsch) |
| POST | `/v1/open` | `{"url": "...", "background": false}` | neuer Tab `{id}` |
| POST | `/v1/search` | `{"q": "..."}` | Suche in neuem Tab |
| POST | `/v1/tabs/<id>/navigate` | `{"url": "..."}` | |
| POST | `/v1/tabs/<id>/activate` | – | |
| POST | `/v1/tabs/<id>/close` | – | |
| POST | `/v1/tabs/<id>/translate` | `{"mode": "de"}` oder `{"mode": "original"}` | |
| POST | `/v1/speak` | `{"text": "..."}` oder `{"tabId": 3}` | vorlesen |
| POST | `/v1/speak/stop` | – | |

## Beispiel (PowerShell)
```powershell
$t = Get-Content "$env:APPDATA\TZBrowser\api-token.txt"
$h = @{ Authorization = "Bearer $t" }
Invoke-RestMethod http://127.0.0.1:47800/v1/tabs -Headers $h
Invoke-RestMethod http://127.0.0.1:47800/v1/speak -Method Post -Headers $h -ContentType 'application/json' -Body '{"text":"Hallo ZeroCool"}'
```

## Beispiel (Python, z. B. für eigene Assistenten)
```python
import requests, os
token = open(os.path.expandvars(r"%APPDATA%\TZBrowser\api-token.txt")).read().strip()
h = {"Authorization": f"Bearer {token}"}
tabs = requests.get("http://127.0.0.1:47800/v1/tabs", headers=h).json()["tabs"]
text = requests.get(f"http://127.0.0.1:47800/v1/tabs/{tabs[0]['id']}/text", headers=h).json()["text"]
```

## Claude (MCP)
`tools/tzbrowser-mcp.js` übersetzt die Schnittstelle in MCP-Werkzeuge (tzbrowser_tabs, tzbrowser_tab_text, tzbrowser_open,
tzbrowser_search, tzbrowser_translate, tzbrowser_speak …). Eintrag in `claude_desktop_config.json`:
```json
"tzbrowser": { "command": "node", "args": ["C:\\Pfad\\zu\\tzbrowser\\tools\\tzbrowser-mcp.js"] }
```
Voraussetzung: TZBrowser läuft und ☰ → KI-Schnittstelle ist eingeschaltet. Den Schlüssel liest die Brücke selbst.
