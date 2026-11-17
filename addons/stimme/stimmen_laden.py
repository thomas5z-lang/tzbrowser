"""Laedt deutsche Piper-Stimmen von HuggingFace (rhasspy/piper-voices).

Lizenzen der Stimmen (siehe MODEL_CARD der jeweiligen Stimme):
- thorsten, thorsten_emotional, kerstin: CC0 (gemeinfrei)
- ramona: M-AILABS-Lizenz (BSD-artig)
"""
import os
import urllib.request

BASIS = "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/"
STIMMEN = {
    "de_DE-thorsten-high": "thorsten/high/",
    "de_DE-thorsten_emotional-medium": "thorsten_emotional/medium/",
    "de_DE-kerstin-low": "kerstin/low/",
    "de_DE-ramona-low": "ramona/low/",
}
ZIEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stimmen")
os.makedirs(ZIEL, exist_ok=True)

for name, pfad in STIMMEN.items():
    for endung in (".onnx", ".onnx.json"):
        datei = os.path.join(ZIEL, name + endung)
        if os.path.exists(datei) and os.path.getsize(datei) > 0:
            print("vorhanden:", name + endung)
            continue
        url = BASIS + pfad + name + endung + "?download=true"
        print("lade:", name + endung)
        try:
            urllib.request.urlretrieve(url, datei)
        except Exception as e:
            print("FEHLER bei", name + endung, e)
            if os.path.exists(datei):
                os.remove(datei)
print("Stimmen fertig.")
