# Add-on „Stimme“ – natürliche deutsche Vorlese-Stimmen

Ohne dieses Add-on liest TZBrowser mit der eingebauten Windows-Stimme vor. Mit dem Add-on
klingt es deutlich natürlicher, und der **Untertitel-Vorleser** für Filme und Serien wird möglich.

Das Add-on ist ein kleiner Sprach-Server, der **nur auf deinem PC** läuft (Adresse
127.0.0.1:5577). Webseiten können ihn nicht ansprechen. TZBrowser startet und beendet ihn
automatisch, du musst nichts von Hand starten.

## Zwei Stufen

| Stufe | Klang | Voraussetzung | Download |
|---|---|---|---|
| **Piper** (Standard) | gut, sehr schnell | jeder Windows-PC | ca. 300 MB |
| **+ KI-Stimme OmniVoice** | sehr natürlich, wie ein Hörbuch | NVIDIA-Grafikkarte mit mind. 6 GB Speicher | ca. 6–8 GB |

## Installation (Schritt für Schritt)

1. **Python installieren** (falls noch nicht vorhanden):
   https://www.python.org/downloads/ → Version 3.12 → beim Installieren unbedingt den Haken
   **„Add python.exe to PATH“** setzen.
   *(Alternativ in der Eingabeaufforderung: `winget install Python.Python.3.12`)*
2. Dieses Repository als ZIP herunterladen (grüner Knopf **Code → Download ZIP**) und entpacken.
3. Den Ordner `addons\stimme` öffnen, in die Adresszeile des Explorers `powershell` tippen, Enter.
4. Im blauen Fenster eingeben:
   - nur Piper:
     ```powershell
     powershell -ExecutionPolicy Bypass -File installieren.ps1
     ```
   - Piper **und** KI-Stimme (NVIDIA-Grafikkarte):
     ```powershell
     powershell -ExecutionPolicy Bypass -File installieren.ps1 -Ki
     ```
5. Warten, bis **Fertig!** erscheint. Das Add-on liegt jetzt in `C:\Users\<Name>\TZBrowser-Stimme`.
6. In TZBrowser: ☰ → Extras → **Vorlese-Stimme** → eine der neuen Stimmen wählen.

Beim allerersten Vorlesen mit der KI-Stimme wird das Modell (ca. 3 GB) einmalig von
HuggingFace geladen und die Stimmen werden vorbereitet – das kann ein paar Minuten dauern.
Danach startet sie in etwa 20–60 Sekunden.

## Eigene Stimme (nur KI-Stimme)

Eine kurze, saubere Aufnahme (10–20 Sekunden, WAV) als `name.wav` in
`TZBrowser-Stimme\stimmen\eigene\` legen, dazu den gesprochenen Text als `name.txt`.
Sie erscheint dann als „Eigene: name“. **Nur Stimmen verwenden, für die du die Erlaubnis hast.**

## Anderer Ordner

Liegt das Add-on woanders: TZBrowser → Einstellungen → Vorlesen → **Ordner des Sprach-Add-ons** → Ordner wählen.
Oder bei der Installation: `installieren.ps1 -Ziel D:\Stimme`.

## Lizenzen

- Code dieses Add-ons: MIT (ZeroCool)
- Piper: GPL-3.0 · Stimmen Thorsten/Kerstin: CC0 · Ramona: M-AILABS (BSD-artig)
- OmniVoice: Code Apache-2.0, **Modell CC BY-NC 4.0 (nur nicht-kommerzielle Nutzung)**

Alle Komponenten werden bei der Installation direkt von ihren offiziellen Quellen
(PyPI, PyTorch, HuggingFace) geladen.

## Deinstallieren

Den Ordner `C:\Users\<Name>\TZBrowser-Stimme` löschen. Das KI-Modell liegt zusätzlich im
HuggingFace-Zwischenspeicher `C:\Users\<Name>\.cache\huggingface` und kann dort gelöscht werden.
