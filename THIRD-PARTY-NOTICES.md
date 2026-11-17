# Fremdkomponenten und Lizenzen

TZBrowser selbst steht unter der MIT-Lizenz (siehe `LICENSE`). Er nutzt die folgenden
Komponenten anderer Projekte. Deren Rechte und Lizenzen bleiben unberührt.

## Im Installer enthalten

| Komponente | Zweck | Lizenz | Quelle |
|---|---|---|---|
| Electron for Content Security (castLabs) | Browser-Unterbau (Chromium) mit Widevine-Unterstützung | MIT (Chromium-Teile: BSD u. a.) | https://github.com/castlabs/electron-releases |
| @ghostery/adblocker-electron | Werbe- und Trackerblocker | MPL-2.0 | https://github.com/ghostery/adblocker |
| @mozilla/readability | Lesemodus | Apache-2.0 | https://github.com/mozilla/readability |
| electron-chrome-extensions | Chrome-Erweiterungen | MIT | https://github.com/samuelmaddock/electron-browser-shell |
| electron-chrome-web-store | Installation aus dem Chrome Web Store | MIT | https://github.com/samuelmaddock/electron-browser-shell |
| electron-updater | Updates | MIT | https://github.com/electron-userland/electron-builder |
| FFmpeg (LGPL-Build von BtbN) | Streams zu MP4 zusammensetzen, MP3-Export | LGPL-3.0-or-later | https://ffmpeg.org · Build: https://github.com/BtbN/FFmpeg-Builds |
| wgcf | Profil für Cloudflare WARP (VPN) | MIT | https://github.com/ViRb3/wgcf |
| wireproxy | WireGuard als lokaler Proxy (VPN) | ISC | https://github.com/whyvl/wireproxy |

FFmpeg wird unverändert als eigenständiges Programm mitgeliefert. Der Quellcode ist
unter https://ffmpeg.org/download.html bzw. über das Build-Repository erhältlich.

Der Widevine-Baustein (CDM) wird **nicht** mitgeliefert, sondern beim ersten Start von
Googles Servern geladen und unterliegt Googles Bedingungen.

## Zur Laufzeit geladen (nicht im Installer)

| Dienst / Daten | Zweck | Hinweis |
|---|---|---|
| Filterlisten (EasyList, uBlock-Filter u. a.) über Ghostery | Werbeblocker | jeweilige Listen-Lizenzen (z. B. CC BY-SA 3.0, GPL-3.0) |
| Purple AdBlock | Twitch-Werbung (optional) | Apache-2.0 · https://github.com/arthurbolsoni/Purple-adblock |
| SponsorBlock-API | YouTube-Sponsoren überspringen (optional) | Daten: CC BY-NC-SA 4.0 · https://sponsor.ajay.app |
| Return YouTube Dislike-API | Dislikes anzeigen (optional) | https://returnyoutubedislike.com |
| Cloudflare WARP | VPN (optional, Zustimmung zu Cloudflares Bedingungen nötig) | https://www.cloudflare.com/application/terms/ |

## Optionale Add-ons (nicht im Installer, werden vom Nutzer selbst installiert)

| Komponente | Lizenz | Hinweis |
|---|---|---|
| Piper (piper-tts) | GPL-3.0-or-later | https://github.com/OHF-Voice/piper1-gpl |
| Piper-Stimmen Thorsten, Thorsten emotional, Kerstin | CC0 | https://huggingface.co/rhasspy/piper-voices |
| Piper-Stimme Ramona | M-AILABS-Lizenz (BSD-artig) | https://huggingface.co/rhasspy/piper-voices |
| OmniVoice (Code) | Apache-2.0 | https://github.com/k2-fsa/OmniVoice |
| OmniVoice (Modell) | **CC BY-NC 4.0 – nur nicht-kommerziell** | https://huggingface.co/k2-fsa/OmniVoice |
| PyTorch | BSD-3-Clause | https://pytorch.org |
| Ollama | MIT | https://ollama.com – Modelle haben eigene Lizenzen |

## Marken

Alle genannten Marken- und Produktnamen (z. B. YouTube, Twitch, Netflix, Crunchyroll,
Disney+, Google, Cloudflare, Chrome) gehören ihren jeweiligen Inhabern. TZBrowser steht
in keiner Verbindung zu diesen Unternehmen und wird von ihnen weder unterstützt noch geprüft.
