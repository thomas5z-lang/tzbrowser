# TZBrowser – Ausführliche Anleitung

Diese Anleitung erklärt alles Schritt für Schritt – auch für Leute, die sich mit Computern
nicht so gut auskennen.

**Inhalt**
1. [Installieren](#1-installieren)
2. [Der erste Start](#2-der-erste-start)
3. [Die Oberfläche](#3-die-oberfläche)
4. [Tabs](#4-tabs)
5. [Lesezeichen, Verlauf, Passwörter](#5-lesezeichen-verlauf-passwörter)
6. [Werbeblocker](#6-werbeblocker)
7. [Streaming (Netflix, Crunchyroll …)](#7-streaming)
8. [Übersetzen](#8-übersetzen)
9. [Vorlesen](#9-vorlesen)
10. [Untertitel-Vorleser](#10-untertitel-vorleser)
11. [Eigenes Design](#11-eigenes-design)
12. [Datenschutz: DNS, VPN, private Tabs](#12-datenschutz-dns-vpn-private-tabs)
13. [Weitere Werkzeuge](#13-weitere-werkzeuge)
14. [Sicherung und Umzug auf einen neuen PC](#14-sicherung-und-umzug)
15. [KI-Assistent und KI-Schnittstelle](#15-ki-assistent-und-ki-schnittstelle)
16. [Tastenkürzel](#16-tastenkürzel)
17. [Probleme lösen](#17-probleme-lösen)
18. [Deinstallieren](#18-deinstallieren)

---

## 1. Installieren

1. Öffne die Seite **https://github.com/thomas5z-lang/tzbrowser/releases/latest**.
2. Klicke unter „Assets“ auf **TZBrowser-Setup-x.y.z.exe** (x.y.z ist die Versionsnummer).
3. Öffne die heruntergeladene Datei.
4. Falls ein blaues Fenster „Der Computer wurde durch Windows geschützt“ erscheint:
   auf **Weitere Informationen** klicken, dann auf **Trotzdem ausführen**.
   *(Das erscheint, weil TZBrowser keine kostenpflichtige Signatur hat. Der Quellcode ist offen einsehbar.)*
5. Im Installationsassistenten den Ordner bestätigen und auf **Installieren** klicken.
6. Fertig – auf dem Desktop liegt jetzt eine Verknüpfung **TZBrowser**.

Updates kommen automatisch: TZBrowser fragt nach, wenn eine neue Version da ist.

## 2. Der erste Start

- Beim ersten Start lädt TZBrowser im Hintergrund die Werbefilter und den Widevine-Baustein
  für Streamingdienste. Das dauert ein paar Sekunden.
- **Lesezeichen aus Chrome, Edge, Firefox, Brave oder Opera übernehmen:**
  Seitenleiste links → **Lesezeichen** (Stern-Symbol) → **Importieren** → Browser auswählen.
- **Als Standardbrowser festlegen:** Windows-Einstellungen → Apps → Standard-Apps → TZBrowser.

## 3. Die Oberfläche

```
┌ Logo ┬ Tabs ……………………………………………………… + ┐
├ ← → ⟳ │ Adressleiste  📖 🎧 🌐 ☆ 🎞 │ 🔊 VPN 🛡 ⬇ ⚙ ☰ │
├───┬────────────────────────────────────────────┤
│ ☆ │                                            │
│ 🕘 │              Webseite                      │
│ 🔑 │                                            │
│ … │                                            │
└───┴────────────────────────────────────────────┘
```

**Oben links das Logo** öffnet das Hauptmenü (wie ☰ ganz rechts).

**In der Adressleiste** erscheinen nur bei Bedarf kleine Knöpfe:
| Symbol | Bedeutung |
|---|---|
| 📖 Buch | Lesemodus (F9) – nur Text, ohne Werbung und Ablenkung |
| 🎧 Kopfhörer | Untertitel-Vorleser ein/aus (nur auf Streamingseiten) |
| 🌐 Übersetzen | Seite wurde übersetzt – Klick für Original/Optionen |
| ☆ Stern | Lesezeichen setzen (Strg+D) |
| 🎞 Film | Auf der Seite wurde eine Mediendatei erkannt – Klick zum Speichern |

**Rechts daneben:**
| Element | Bedeutung |
|---|---|
| 🔊 | erscheint beim Vorlesen – Klick stoppt |
| VPN | VPN ein/aus |
| 🛡 Schild mit Zahl | Werbeblocker: Zahl = blockierte Elemente. **Klick schaltet den Blocker für diese Seite aus/ein.** |
| ⬇ | Downloads |
| ⚙ Regler | **Schnelleinstellungen** – die wichtigsten Schalter, das Fenster bleibt offen |
| ☰ | Hauptmenü |

**Die Seitenleiste links** enthält Lesezeichen, Verlauf, Passwörter, VPN, Downloads,
den KI-Assistenten und weitere Panels (z. B. Messenger). Ganz unten: Design & Akzentfarbe.

**Das Hauptmenü** ist aufgeteilt in: Tabs · Bibliothek · Diese Seite · Schutz & Privatsphäre ·
Extras · Einstellungen · Sicherung · Weitere Werkzeuge · Hilfe. Es bleibt offen, solange du
Schalter umlegst, und schließt sich erst beim Klick daneben.

**Alle Einstellungen an einem Ort:** ☰ → **Einstellungen** oder **Strg + ,** – mit Suchfeld oben rechts.

## 4. Tabs

- **Neuer Tab:** Strg+T oder das + neben den Tabs.
- **Tab schließen:** Strg+W oder Mittelklick auf den Tab. **Versehentlich geschlossen?** Strg+Umschalt+T.
- **Rechtsklick auf einen Tab:** anheften, stummschalten, duplizieren, in neues Fenster verschieben, andere schließen.
- **Angeheftete Tabs** sind klein, stehen immer links und bleiben nach einem Neustart erhalten.
- **Tabs vom letzten Mal:** TZBrowser öffnet beim Start die Tabs vom letzten Mal wieder.
  Sie laden erst, wenn du sie anklickst (spart Zeit und Speicher). Abschaltbar in den Einstellungen.
- **Schlafende Tabs:** Nicht benutzte Tabs werden nach 30 Minuten schlafen gelegt (blasser dargestellt)
  und wachen beim Anklicken wieder auf. Tabs mit Ton oder halb ausgefüllten Formularen bleiben wach.
- **Container-Tabs** (☰ → Neuer Container-Tab): getrennte Cookies – z. B. zwei verschiedene Konten
  bei derselben Seite gleichzeitig.

## 5. Lesezeichen, Verlauf, Passwörter

- **Lesezeichen setzen:** Stern in der Adressleiste oder Strg+D.
- **Lesezeichen verwalten:** Strg+Umschalt+O. Auf den Titel klicken öffnet die Seite, „Umbenennen“ ändert den Namen.
- **Verlauf:** Strg+H – durchsuchbar, einzelne Einträge oder Zeiträume löschbar.
- **Passwörter:** TZBrowser fragt beim Anmelden, ob er das Passwort speichern soll. Beim nächsten
  Mal füllt er es aus. Verwalten: Strg+Umschalt+K. Passwörter werden mit der Windows-Verschlüsselung
  gesichert und nur nach Bestätigung angezeigt.

## 6. Werbeblocker

Der Werbeblocker ist immer an und blockiert Werbung, Tracker und Cookie-Banner-Skripte.

- **Für eine Seite ausschalten:** auf das Schild 🛡 klicken (die Seite lädt neu). Nochmal klicken = wieder an.
- **YouTube & Twitch** (☰ → Extras → YouTube & Twitch oder Schnelleinstellungen):
  - YouTube-Videowerbung überspringen
  - SponsorBlock: gesponserte Abschnitte überspringen
  - Dislikes wieder anzeigen
  - Twitch-Werbung blockieren
  - Twitch-Kanalpunkte automatisch abholen
- **Filterlisten aktualisieren:** ☰ → Schutz & Privatsphäre → Werbeblocker-Filterlisten jetzt aktualisieren.

## 7. Streaming

Netflix, Crunchyroll, Disney+, Prime Video, Joyn, RTL+ und andere funktionieren dank Widevine.
Beim allerersten Start dauert es kurz, bis der Widevine-Baustein geladen ist.

*Hinweis:* Manche Dienste spielen in Browsern, die nicht Chrome/Edge/Firefox heißen, nur in
geringerer Auflösung ab oder lehnen sie ganz ab. Das entscheidet der jeweilige Dienst.

## 8. Übersetzen

- **Einschalten:** Einstellungen → Übersetzen → „Fremdsprachige Seiten automatisch auf Deutsch“
  (oder in den Schnelleinstellungen). Danach wird jede fremdsprachige Seite ohne Nachfrage übersetzt.
- **Original anzeigen:** auf das 🌐-Symbol in der Adressleiste klicken.
- **Übersetzer wählen:**
  - **Google** – schnell, aber der Seitentext geht an Google.
  - **Ollama** – komplett lokal und privat, braucht das [Add-on Ollama](../addons/ollama/LIESMICH.md).
- **Ausnahmen:** Seiten oder Sprachen, die nie übersetzt werden sollen, kannst du in den Einstellungen eintragen.
- Private Tabs werden **nie** über Google übersetzt.

## 9. Vorlesen

- **Markierten Text vorlesen:** Text markieren → Rechtsklick → **Vorlesen**.
- **Ganze Seite vorlesen:** ☰ → Diese Seite → Vorlesen → **Seite vorlesen**.
- **Als MP3 speichern:** ☰ → Diese Seite → Vorlesen → **Seite als MP3 speichern …**
  (oder Rechtsklick auf markierten Text → „Als MP3 speichern“).
- **Stoppen:** das 🔊-Symbol oben anklicken.
- **Stimme und Tempo:** ☰ → Extras → Vorlese-Stimme.

Ohne Add-on wird die eingebaute Windows-Stimme genutzt. Viel natürlicher klingt es mit dem
[Add-on „Stimme“](../addons/stimme/LIESMICH.md).

## 10. Untertitel-Vorleser

Liest die **deutschen Untertitel** von Filmen und Serien laut vor – praktisch bei Animes oder
ausländischen Serien ohne deutsche Tonspur. Braucht das [Add-on „Stimme“](../addons/stimme/LIESMICH.md).

1. Add-on „Stimme“ installieren (einmalig).
2. Streamingseite öffnen (Crunchyroll, Netflix, Prime Video, Disney+, YouTube, Mediatheken …).
3. Auf das **🎧-Symbol** in der Adressleiste klicken (oder ☰ → Extras → Untertitel-Vorleser einschalten).
4. Im Player **deutsche Untertitel** einschalten und das Video starten.

Einstellungen (Stimme, Tempo, Lautstärke von Original und Vorleser, Männer/Frauen
unterschiedlich) findest du unter Einstellungen → Untertitel-Vorleser.
Auf Crunchyroll kann TZBrowser mit dem [Add-on Ollama](../addons/ollama/LIESMICH.md) sogar
erkennen, ob ein Mann oder eine Frau spricht.

## 11. Eigenes Design

Einstellungen → **Design**. Ideal z. B. für Firmen, die den Browser im eigenen Look möchten.

**Selbst einstellen:**
- Name (erscheint groß auf der Startseite), Akzentfarbe, Hintergrund, Schriftfarbe, Schriftart
- **Logo wählen …** – ersetzt das TZ-Logo oben links und auf der Startseite
- **Hintergrundbild** für die Startseite
- **Kacheln** der Startseite: eine pro Zeile im Format `Name | Adresse`
- Auf **Design anwenden** klicken.

**Von einer Webseite übernehmen:** Adresse der Firmen-Webseite eingeben → **Von Webseite übernehmen**.
TZBrowser liest Logo, Farben, Schrift und Namen aus. Danach kannst du alles noch anpassen.

**Weitergeben:** **Als Datei speichern …** erzeugt eine `.tzdesign`-Datei mit Logo und Bildern.
Auf anderen PCs mit **Design-Datei laden …** einlesen.

**Zurück zum Original:** Auf TZBrowser-Standard zurücksetzen.

## 12. Datenschutz: DNS, VPN, private Tabs

- **Verschlüsseltes DNS** (standardmäßig Cloudflare): dein Internetanbieter sieht nicht mehr,
  welche Seiten du aufrufst. Anbieter wählbar unter Einstellungen → Datenschutz.
- **VPN:** Klick auf **VPN** oben rechts (oder Strg+Umschalt+V). Beim ersten Mal fragt TZBrowser,
  ob ein kostenloses Cloudflare-WARP-Konto angelegt werden darf (dafür gelten Cloudflares Bedingungen).
  Das VPN gilt nur für TZBrowser, nicht für andere Programme.
- **Privater Tab:** Strg+Umschalt+P. Kein Verlauf, keine dauerhaften Cookies.
- **Alle Seiten dunkel:** Einstellungen → Datenschutz → „Dark Mode erzwingen“ (wirkt nach Neustart).

Was genau wohin geschickt wird: [DATENSCHUTZ.md](DATENSCHUTZ.md).

## 13. Weitere Werkzeuge

| Was | Wo |
|---|---|
| Auf der Seite suchen | Strg+F |
| Lesemodus | F9 oder 📖 in der Adressleiste |
| Bild-in-Bild (Video in kleinem Fenster) | ☰ → Diese Seite → Bild-in-Bild, oder Knopf auf dem Video |
| Screenshot (sichtbar / ganze Seite / PDF) | ☰ → Diese Seite → Screenshot – landet in `Downloads\TZBrowser\Screenshots` |
| Mediendatei speichern | 🎞 in der Adressleiste, sobald eine Datei oder ein Stream erkannt wurde |
| Chrome-Erweiterungen | ☰ → Extras → Erweiterungen → Chrome Web Store |
| Zoom | Strg + / Strg − / Strg 0 |

## 14. Sicherung und Umzug

☰ → **Sicherung (exportieren / einlesen) …** oder Einstellungen → Sicherung.

- **Exportieren:** Lesezeichen, Passwörter und Einstellungen landen in einer Datei, die mit
  einem Passwort deiner Wahl (mindestens 8 Zeichen) verschlüsselt wird.
- **Einlesen:** auf dem neuen PC die Datei auswählen und dasselbe Passwort eingeben.
- **Passwort vergessen = Sicherung verloren.** Niemand kann sie ohne Passwort öffnen.

## 15. KI-Assistent und KI-Schnittstelle

- **KI-Assistent:** Seitenleiste → KI-Symbol (Strg+Umschalt+A). Fragen stellen, Seiten
  zusammenfassen lassen – alles lokal. Braucht das [Add-on Ollama](../addons/ollama/LIESMICH.md).
- **KI-Schnittstelle:** erlaubt KI-Assistenten wie Claude oder eigenen Skripten, TZBrowser zu steuern
  (Tabs öffnen, Text lesen, übersetzen, vorlesen). Standardmäßig **aus**, nur auf deinem PC
  erreichbar und nur mit Schlüssel. Details: [KI-SCHNITTSTELLE.md](KI-SCHNITTSTELLE.md).

## 16. Tastenkürzel

| Kürzel | Funktion |
|---|---|
| Strg+T / Strg+W | Neuer Tab / Tab schließen |
| Strg+Umschalt+T | Geschlossenen Tab wiederherstellen |
| Strg+Tab / Strg+Umschalt+Tab | Nächster / vorheriger Tab |
| Strg+1 … Strg+9 | Tab 1 … letzter Tab |
| Strg+N | Neues Fenster |
| Strg+Umschalt+P | Privater Tab |
| Strg+L | Adressleiste |
| Strg+D | Lesezeichen setzen |
| Strg+Umschalt+O | Lesezeichen verwalten |
| Strg+H | Verlauf |
| Strg+Umschalt+K | Passwörter |
| Strg+J | Downloads |
| Strg+F, F3 | Suchen, nächster Treffer |
| F9 | Lesemodus |
| Strg+, | Einstellungen |
| Strg+Umschalt+V | VPN ein/aus |
| Strg+Umschalt+A | KI-Assistent |
| F5 / Strg+F5 | Neu laden / ohne Zwischenspeicher |
| Alt+← / Alt+→ | Zurück / Vorwärts |
| Strg+P / Strg+S | Drucken / Seite speichern |
| Strg+U | Seitenquelltext |
| F11 | Vollbild |
| F12 | Entwicklerwerkzeuge |
| Strg+Umschalt+Q | TZBrowser beenden |

## 17. Probleme lösen

| Problem | Lösung |
|---|---|
| Eine Seite funktioniert nicht richtig | Schild 🛡 anklicken (Werbeblocker für die Seite aus). Hilft das, war ein Filter schuld. |
| Video startet auf einer Streamingseite nicht | Seite mit F5 neu laden. Beim allerersten Start ein paar Minuten warten, bis Widevine geladen ist. |
| Vorlesen klingt nach „Roboter“ | Das ist die Windows-Stimme – [Add-on „Stimme“](../addons/stimme/LIESMICH.md) installieren. |
| „Sprach-Server nicht gefunden“ | Add-on „Stimme“ fehlt oder liegt woanders: Einstellungen → Vorlesen → Ordner wählen. |
| Erste Vorlese-Sekunden dauern lange | Die Stimme wird beim ersten Mal geladen (KI-Stimme bis ca. 1 Minute). Danach geht es schnell. |
| Übersetzung mit Ollama geht nicht | Prüfen, ob Ollama installiert ist und das Modell geladen wurde ([Add-on Ollama](../addons/ollama/LIESMICH.md)). |
| VPN verbindet nicht | Einmal aus- und wieder einschalten. Manche Netzwerke (Firmen, Schulen) blockieren WARP. |
| Alles zurücksetzen | TZBrowser beenden, Ordner `%APPDATA%\TZBrowser` umbenennen, neu starten. *(Achtung: Lesezeichen und Passwörter sind dann weg – vorher sichern!)* |

## 18. Deinstallieren

Windows-Einstellungen → Apps → **TZBrowser** → Deinstallieren.
Deine Daten (Lesezeichen, Passwörter) bleiben in `%APPDATA%\TZBrowser`, falls du ihn später
neu installierst. Wer alles entfernen will, löscht diesen Ordner danach von Hand.
