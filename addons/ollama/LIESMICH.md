# Add-on „Ollama“ – lokale KI

[Ollama](https://ollama.com) führt KI-Sprachmodelle direkt auf deinem PC aus – ohne Cloud,
ohne Konto. TZBrowser nutzt es für:

- den **KI-Assistenten** in der Seitenleiste (Fragen stellen, Seiten zusammenfassen)
- **private Übersetzungen** (Einstellung Übersetzer → Ollama; private Tabs nutzen immer Ollama)
- die **Sprecher-Erkennung** beim Untertitel-Vorleser auf Crunchyroll (Mann/Frau)

## Welches Modell passt zu meinem PC?

| Grafikkarte / Speicher | Empfehlung | Download |
|---|---|---|
| keine eigene Grafikkarte, 16 GB RAM | `qwen2.5:3b` | ca. 2 GB |
| Grafikkarte mit 6–8 GB | `qwen2.5:7b` *(Standard in TZBrowser)* | ca. 5 GB |
| Grafikkarte mit 12 GB oder mehr | `qwen3:14b` | ca. 9 GB |

Die Qwen-Modelle können gut Deutsch. Jedes Modell hat eine eigene Lizenz (auf ollama.com beim Modell nachlesen).

## Installation (Schritt für Schritt)

1. https://ollama.com/download öffnen → **Download for Windows** → Installer ausführen.
   *(Alternativ: `winget install Ollama.Ollama`)*
2. Eingabeaufforderung öffnen (Windows-Taste, `cmd` tippen, Enter) und das Modell laden:
   ```
   ollama pull qwen2.5:7b
   ```
3. In TZBrowser:
   - **KI-Assistent:** Seitenleiste → KI-Symbol → oben das Modell auswählen.
   - **Übersetzen:** Einstellungen → Übersetzen → Übersetzer: **Ollama**;
     bei „Ollama-Modell für Übersetzungen“ den Namen des geladenen Modells eintragen.

TZBrowser startet Ollama bei Bedarf selbst. Läuft Ollama auf einem anderen PC im Netzwerk:
Einstellungen → KI → **Ollama-Adresse** anpassen (z. B. `http://192.168.1.20:11434`).

## Deinstallieren

Windows-Einstellungen → Apps → Ollama → Deinstallieren. Die Modelle liegen in
`C:\Users\<Name>\.ollama` und können dort gelöscht werden.
