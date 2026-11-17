"""TZBrowser Add-on "Stimme" - lokaler Sprach-Server (by ZeroCool, MIT-Lizenz).

Nimmt Text vom TZBrowser entgegen und liefert deutsche Sprache als WAV zurueck.
Laeuft nur auf diesem PC (127.0.0.1). Webseiten koennen ihn nicht ansprechen:
Anfragen mit Origin-Header (also aus einem Browser-Tab heraus) werden abgelehnt.

Zwei Sprach-Engines:
- OmniVoice (KI-Stimme, Grafikkarte) - natuerlich, Standard
- Piper (schnell, Prozessor)          - Ersatz

Fertige Saetze landen im Ordner 'cache' - beim zweiten Anschauen ist alles sofort da.
"""
import hashlib
import io
import json
import os
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

import sprecher

PORT = 5577
ORDNER = os.path.dirname(os.path.abspath(__file__))
STIMMEN_ORDNER = os.path.join(ORDNER, "stimmen")
OMNI_ORDNER = os.path.join(STIMMEN_ORDNER, "omni")
EIGENE_ORDNER = os.path.join(STIMMEN_ORDNER, "eigene")  # eigene Aufnahmen: name.wav + name.txt
CACHE_ORDNER = os.path.join(ORDNER, "cache")
for o in (CACHE_ORDNER, OMNI_ORDNER, EIGENE_ORDNER):
    os.makedirs(o, exist_ok=True)

# Feste KI-Stimmen: werden beim ersten Gebrauch einmal "entworfen" und dann
# als Stimmprobe gespeichert, damit sie in jedem Satz gleich klingen.
OMNI_STIMMEN = {
    "omni_erzaehler": "male, elderly, low pitch",
    "omni_mann": "male, young adult, moderate pitch",
    "omni_frau": "female, young adult, moderate pitch",
    "omni_frau_tief": "female, middle-aged, low pitch",
}
PROBE_TEXT = ("Es war einmal ein junger Krieger, der sich auf eine lange Reise machte. "
              "Niemand glaubte daran, dass er jemals zurückkehren würde.")
STANDARD_STIMME = "omni_erzaehler"
OMNI_SCHRITTE = 24       # Qualitaet/Tempo der KI-Stimme (32 = beste, 16 = schnell)
MAX_BESCHLEUNIGUNG = 1.4  # zu lange Saetze hoechstens 1,4-fach schneller

# ---------------------------------------------------------------- OmniVoice
_omni = None
_omni_fehler = None
_omni_lock = threading.Lock()
_prompts = {}

try:
    import torch
    from omnivoice import OmniVoice, VoiceClonePrompt
    OMNI_VERFUEGBAR = torch.cuda.is_available()
    if not OMNI_VERFUEGBAR:
        _omni_fehler = "keine NVIDIA-Grafikkarte gefunden"
except Exception as e:  # venv ohne OmniVoice
    OMNI_VERFUEGBAR = False
    _omni_fehler = str(e)


def omni_modell():
    global _omni
    if _omni is None:
        print("Lade OmniVoice (beim ersten Mal wird das Modell heruntergeladen) ...", flush=True)
        _omni = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cuda:0", dtype=torch.float16)
        print("OmniVoice bereit.", flush=True)
    return _omni


def eigene_stimmen():
    return sorted(f[:-4] for f in os.listdir(EIGENE_ORDNER) if f.lower().endswith(".wav"))


def omni_prompt(name):
    """Stimmprobe holen - wird einmalig erzeugt und gespeichert."""
    if name in _prompts:
        return _prompts[name]
    modell = omni_modell()
    pt = os.path.join(OMNI_ORDNER, name + ".pt")
    if os.path.exists(pt):
        prompt = VoiceClonePrompt.load(pt)
    elif name.startswith("eigen_"):
        basis = os.path.join(EIGENE_ORDNER, name[6:])
        txt = basis + ".txt"
        ref_text = open(txt, encoding="utf-8").read().strip() if os.path.exists(txt) else None
        if ref_text is None:
            modell.load_asr_model()
        prompt = modell.create_voice_clone_prompt(ref_audio=basis + ".wav", ref_text=ref_text)
        prompt.save(pt)
    else:
        print(f"Entwerfe Stimme {name} ({OMNI_STIMMEN[name]}) ...", flush=True)
        audio = modell.generate(text=PROBE_TEXT, language="de", instruct=OMNI_STIMMEN[name], num_step=32)[0]
        wav_pfad = os.path.join(OMNI_ORDNER, name + "_probe.wav")
        with open(wav_pfad, "wb") as f:
            f.write(als_wav(audio, 24000))
        prompt = modell.create_voice_clone_prompt(ref_audio=wav_pfad, ref_text=PROBE_TEXT)
        prompt.save(pt)
    _prompts[name] = prompt
    return prompt


def omni_sprechen(text, name, tempo, max_sek):
    with _omni_lock:
        modell = omni_modell()
        prompt = omni_prompt(name)
        audio = modell.generate(text=text, language="de", voice_clone_prompt=prompt,
                                speed=tempo, num_step=OMNI_SCHRITTE)[0]
        dauer = len(audio) / 24000.0
        if max_sek and dauer > max_sek > 0.3:
            ziel = max(max_sek, dauer / MAX_BESCHLEUNIGUNG)
            audio = modell.generate(text=text, language="de", voice_clone_prompt=prompt,
                                    duration=ziel, num_step=OMNI_SCHRITTE)[0]
    return als_wav(audio, 24000)


# ---------------------------------------------------------------- Piper
_piper = {}
_piper_lock = threading.Lock()
try:
    from piper import PiperVoice
    try:
        from piper import SynthesisConfig
    except ImportError:
        SynthesisConfig = None
    PIPER_VERFUEGBAR = True
except Exception:
    PIPER_VERFUEGBAR = False


def piper_stimmen():
    if not PIPER_VERFUEGBAR:
        return []
    return sorted(f[:-5] for f in os.listdir(STIMMEN_ORDNER)
                  if f.endswith(".onnx") and os.path.exists(os.path.join(STIMMEN_ORDNER, f + ".json")))


def piper_synthese(stimme, text, ls):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        if SynthesisConfig is not None:
            stimme.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=ls))
        else:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(stimme.config.sample_rate)
            stimme.synthesize(text, w, length_scale=ls)
    daten = buf.getvalue()
    with wave.open(io.BytesIO(daten), "rb") as r:
        return daten, r.getnframes() / float(r.getframerate())


def piper_sprechen(text, name, tempo, max_sek):
    with _piper_lock:
        if name not in _piper:
            _piper[name] = PiperVoice.load(os.path.join(STIMMEN_ORDNER, name + ".onnx"))
        stimme = _piper[name]
        ls = 1.0 / tempo
        daten, dauer = piper_synthese(stimme, text, ls)
        if max_sek and dauer > max_sek > 0.3:
            ls2 = max(ls / MAX_BESCHLEUNIGUNG, ls * max_sek / dauer)
            daten, _ = piper_synthese(stimme, text, ls2)
    return daten


# ---------------------------------------------------------------- allgemein
def als_wav(audio, rate):
    pcm = (np.clip(np.asarray(audio, dtype=np.float32), -1, 1) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def alle_stimmen():
    liste = []
    if OMNI_VERFUEGBAR:
        liste += list(OMNI_STIMMEN) + ["eigen_" + n for n in eigene_stimmen()]
    return liste + piper_stimmen()


def sprechen(text, name, tempo=1.0, max_sek=None):
    stimmen = alle_stimmen()
    if name not in stimmen:
        name = STANDARD_STIMME if STANDARD_STIMME in stimmen else stimmen[0]
    tempo = max(0.6, min(1.8, float(tempo or 1.0)))
    schluessel = hashlib.sha1(f"v2|{name}|{tempo:.2f}|{max_sek}|{text}".encode("utf-8")).hexdigest()
    cache = os.path.join(CACHE_ORDNER, schluessel + ".wav")
    if os.path.exists(cache):
        with open(cache, "rb") as f:
            return f.read()
    if name.startswith(("omni_", "eigen_")):
        daten = omni_sprechen(text, name, tempo, max_sek)
    else:
        daten = piper_sprechen(text, name, tempo, max_sek)
    with open(cache, "wb") as f:
        f.write(daten)
    return daten


class Handler(BaseHTTPRequestHandler):
    def _header(self, code=200, typ="application/json"):
        self.send_response(code)
        self.send_header("Content-Type", typ)
        self.end_headers()

    def _fremd(self):
        """Nur TZBrowser selbst (ohne Origin, Host 127.0.0.1) darf zugreifen."""
        host = (self.headers.get("Host") or "").split(":")[0]
        if self.headers.get("Origin") or host not in ("127.0.0.1", "localhost"):
            self._header(403)
            return True
        return False

    def do_OPTIONS(self):
        self._header(403)

    def do_GET(self):
        if self._fremd():
            return
        if self.path.startswith("/sprecher/"):
            self._header()
            self.wfile.write(json.dumps(sprecher.stand(self.path.split("/")[-1])).encode())
            return
        if self.path.startswith("/status"):
            self._header()
            self.wfile.write(json.dumps({"ok": True, "stimmen": alle_stimmen(),
                                         "standard": STANDARD_STIMME}).encode())
        else:
            self._header(404)

    def do_POST(self):
        if self._fremd():
            return
        laenge = min(int(self.headers.get("Content-Length", 0)), 2_000_000)
        roh = self.rfile.read(laenge)
        if self.path.startswith("/sprecher"):
            self._header()
            self.wfile.write(json.dumps(sprecher.anfragen(json.loads(roh)["zeilen"])).encode())
            return
        if not self.path.startswith("/tts"):
            self._header(404)
            return
        try:
            daten = json.loads(roh or b"{}")
            text = (daten.get("text") or "").strip()
            if not text:
                self._header(400)
                return
            wav = sprechen(text, daten.get("stimme") or STANDARD_STIMME,
                           daten.get("tempo", 1.0), daten.get("max_sek"))
            self._header(200, "audio/wav")
            self.wfile.write(wav)
        except Exception as e:  # Fehler melden, Server laeuft weiter
            print("Fehler:", e, flush=True)
            self._header(500)
            self.wfile.write(json.dumps({"fehler": str(e)}).encode())

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print("TZBrowser Add-on Stimme - Sprach-Server")
    if OMNI_VERFUEGBAR:
        omni_modell()
        for n in OMNI_STIMMEN:  # Stimmproben vorbereiten (nur beim allerersten Start dauert das)
            omni_prompt(n)
    else:
        print("OmniVoice nicht verfuegbar:", _omni_fehler, "- nutze Piper.")
    print("Stimmen:", ", ".join(alle_stimmen()))
    print(f"Laeuft auf http://127.0.0.1:{PORT}  -  Fenster offen lassen, schliessen = beenden.", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
