# Datenschutz in TZBrowser

TZBrowser sammelt **keine Telemetrie** und hat **keinen eigenen Server**. Alles, was du
speicherst (Lesezeichen, Verlauf, Passwörter, Einstellungen), bleibt auf deinem PC im
Ordner `%APPDATA%\TZBrowser`. Passwörter werden mit der Windows-Verschlüsselung (DPAPI)
geschützt.

Einige Funktionen sprechen aber mit fremden Diensten. Hier steht genau, welche:

| Funktion | Standard | Was wird wohin geschickt? |
|---|---|---|
| Seiten aufrufen | – | wie bei jedem Browser: an die besuchte Seite |
| Verschlüsseltes DNS | **an** (Cloudflare) | Namen der aufgerufenen Seiten an den gewählten DNS-Anbieter (Cloudflare, Quad9, Mullvad oder Google) – verschlüsselt, dafür sieht sie dein Internetanbieter nicht mehr. Abschaltbar. |
| Suche in der Adressleiste | DuckDuckGo | deine Suchbegriffe an DuckDuckGo |
| Symbole der Startseiten-Kacheln | an | Adresse der Kachel-Seite an `icons.duckduckgo.com` |
| Werbeblocker | an | lädt regelmäßig Filterlisten herunter (keine Daten über dich) |
| Automatisch übersetzen | **aus** | Text der Seite an **Google Translate** – oder, bei Einstellung „Ollama“, nur an deine lokale KI. Private Tabs nutzen nie Google. |
| YouTube: SponsorBlock | aus | ein Kürzel der Video-ID an `sponsor.ajay.app` |
| YouTube: Dislikes | aus | die Video-ID an `returnyoutubedislikeapi.com` |
| Twitch-Werbeblocker | aus | lädt das Skript „Purple AdBlock“ von GitHub |
| VPN (Cloudflare WARP) | aus | nach deiner Zustimmung wird ein kostenloses WARP-Konto angelegt; deine Verbindungen laufen dann über Cloudflare |
| Streaming (Widevine) | – | Google liefert beim ersten Start den Widevine-Baustein; Streamingdienste prüfen ihn |
| Chrome-Erweiterungen | – | nur wenn du welche aus dem Chrome Web Store installierst |
| Updates | an | fragt GitHub, ob es eine neue TZBrowser-Version gibt |
| Add-on „Stimme“ | nicht installiert | läuft komplett auf deinem PC (127.0.0.1) |
| Add-on „Ollama“ / KI-Assistent | nicht installiert | läuft komplett auf deinem PC |
| KI-Schnittstelle | **aus** | nur auf deinem PC (127.0.0.1), nur mit Schlüssel, private Tabs sind unsichtbar |

**Private Tabs** speichern keinen Verlauf, keine Cookies über das Schließen hinaus und
werden nie in der Sitzung wiederhergestellt.
