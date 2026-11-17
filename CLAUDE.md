# Hinweise für Claude und andere KI-Assistenten

- **TZBrowser für einen Nutzer installieren** (inkl. optionaler Add-ons „Stimme“ und „Ollama“):
  folge [AI-INSTALL.md](AI-INSTALL.md).
- **Am Code arbeiten:** Electron-App (castLabs Electron for Content Security, Widevine).
  - Einstieg: `src/main/main.js` · Tabs: `src/main/tabs.js` · Oberfläche: `src/ui/`
  - Starten: `npm install`, `npm run fetch-bin`, `npm start`
  - Installer: `npm run dist` (VMP-Signatur nur mit EVS-Konto, siehe `build/EVS-Konto-einrichten.bat`)
  - Kommentare und Oberfläche sind auf Deutsch – bitte beibehalten.
- **Browser steuern:** [docs/KI-SCHNITTSTELLE.md](docs/KI-SCHNITTSTELLE.md) (lokale HTTP-API und MCP-Server `tools/tzbrowser-mcp.js`).
- Ein Downloader für Videoplattformen ist bewusst nicht enthalten und soll nicht hinzugefügt werden.
