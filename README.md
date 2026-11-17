<p align="center"><img src="assets/icon.png" width="96" alt="TZBrowser"></p>

<h1 align="center">TZBrowser</h1>
<p align="center">Schneller, privater Browser für Windows – mit starkem Werbeblocker, Vorlesen, Übersetzen und eigenem Design.<br>
Kostenlos, ohne Werbung, ohne Telemetrie. Von <b>ZeroCool</b>, gebaut mit Claude.</p>

---

## Was TZBrowser kann

- **Werbe- und Trackerblocker** für alle Seiten, dazu YouTube-Videowerbung überspringen, SponsorBlock, Dislikes und Twitch-Werbeblocker (jeweils abschaltbar)
- **Streaming** mit Widevine: Netflix, Crunchyroll, Disney+, Prime Video u. a.
- **Übersetzen**: fremdsprachige Seiten auf Deutsch, wahlweise über Google oder komplett lokal mit Ollama
- **Vorlesen**: markierten Text oder ganze Seiten vorlesen, als MP3 speichern
- **Untertitel-Vorleser**: deutsche Untertitel von Serien und Filmen werden laut vorgelesen, wie ein Hörbuch *(mit Add-on „Stimme“)*
- **Eigenes Design**: Farben, Schrift, Logo, Startseite – oder per Klick von einer Firmen-Webseite übernehmen
- **Datenschutz**: verschlüsseltes DNS, kostenloses VPN (Cloudflare WARP), private Tabs, Container-Tabs
- **Komfort**: Lesemodus, Bild-in-Bild, Screenshots (auch ganze Seite), Tabs schlafen legen, Sitzung wiederherstellen, angeheftete Tabs, Passwortmanager, Chrome-Erweiterungen, verschlüsselte Sicherung
- **KI**: eingebauter Assistent mit lokaler KI (Ollama) und eine lokale Schnittstelle, über die KI-Assistenten wie Claude den Browser steuern können

## Installieren

**Am einfachsten:** Unter [Releases](../../releases/latest) die Datei `TZBrowser-Setup-x.y.z.exe` herunterladen und starten.

> Windows zeigt beim ersten Start eventuell „Der Computer wurde durch Windows geschützt“.
> Das liegt daran, dass TZBrowser (noch) nicht kostenpflichtig signiert ist.
> Klicke auf **Weitere Informationen → Trotzdem ausführen**.

**Mit KI installieren lassen:** Wenn du Claude (Desktop-App mit Zugriff auf deinen PC) oder eine andere KI mit Terminal-Zugriff nutzt, sag einfach:

> „Installiere mir TZBrowser von https://github.com/thomas5z-lang/tzbrowser – halte dich an die Datei AI-INSTALL.md.“

Die KI findet dort eine genaue Schritt-für-Schritt-Anleitung, auch für die optionalen Add-ons.

## Optionale Add-ons

| Add-on | Wofür | Anleitung |
|---|---|---|
| **Stimme** | natürliche deutsche Vorlese-Stimmen (Piper, optional KI-Stimme OmniVoice) für „Vorlesen“ und den Untertitel-Vorleser | [addons/stimme/LIESMICH.md](addons/stimme/LIESMICH.md) |
| **Ollama** | lokale KI: Assistent im Browser, private Übersetzung, Sprecher-Erkennung beim Untertitel-Vorleser | [addons/ollama/LIESMICH.md](addons/ollama/LIESMICH.md) |

Ohne Add-ons funktioniert alles andere ganz normal; zum Vorlesen wird dann die Windows-Stimme genutzt.

## Dokumentation

- 📖 [Ausführliche Anleitung](docs/ANLEITUNG.md) – alle Funktionen Schritt für Schritt
- 🔒 [Datenschutz](docs/DATENSCHUTZ.md) – welche Funktion wann was an wen schickt
- 🤖 [KI-Installation](AI-INSTALL.md) – Anleitung für KI-Assistenten
- 🔌 [KI-Schnittstelle](docs/KI-SCHNITTSTELLE.md) – Browser per Skript oder KI steuern
- 📜 [Lizenzen der Fremdkomponenten](THIRD-PARTY-NOTICES.md)

## Hinweis zu Video-Downloads

TZBrowser kann frei abrufbare Mediendateien und Streams von Webseiten speichern.
Ein Downloader für Videoplattformen wie YouTube ist **bewusst nicht enthalten**, weil deren
Nutzungsbedingungen das Herunterladen in der Regel nicht erlauben. Kopiergeschützte Inhalte
(DRM) lassen sich grundsätzlich nicht speichern.

## Haftungsausschluss

TZBrowser ist ein privates, nicht-kommerzielles Hobbyprojekt und wird ohne jede Gewähr
bereitgestellt (siehe [LICENSE](LICENSE)). Du bist selbst dafür verantwortlich, die
Nutzungsbedingungen der Webseiten und Dienste einzuhalten, die du damit besuchst.
TZBrowser steht in keiner Verbindung zu den genannten Diensten und Marken.

## Selbst bauen

Voraussetzungen: Windows 10/11 (64 Bit), [Node.js](https://nodejs.org) 20 oder neuer, Git.

```powershell
git clone https://github.com/thomas5z-lang/tzbrowser.git
cd tzbrowser
npm install
npm run fetch-bin      # ffmpeg, wgcf, wireproxy nach bin\ laden
npm start              # TZBrowser direkt starten
npm run dist           # Installer bauen → dist\TZBrowser-Setup-x.y.z.exe
```

Für Streamingdienste muss ein selbst gebauter TZBrowser von castLabs signiert werden
(kostenlos): einmalig `build\EVS-Konto-einrichten.bat` ausführen, danach signiert `npm run dist` automatisch.

## Lizenz

MIT © 2026 ZeroCool – siehe [LICENSE](LICENSE). Fremdkomponenten: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
