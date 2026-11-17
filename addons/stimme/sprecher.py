"""Sprecher-Erkennung: Wer spricht - Mann oder Frau?

Die lokale KI (Ollama) liest die Untertitel einer ganzen Folge:
1. Figurenliste mit Geschlecht erstellen
2. Jede Zeile einem Geschlecht zuordnen (m / w / ?)
Sind Sprechernamen in der Untertitel-Datei, werden die direkt genutzt.
Ergebnisse werden im Ordner 'analysen' gespeichert.
"""
import hashlib
import json
import os
import re
import threading
import urllib.request

OLLAMA = "http://127.0.0.1:11434/api/chat"
MODELLE = ["qwen3:14b", "qwen2.5:14b", "qwen2.5:7b"]  # das erste vorhandene wird genutzt
MODELL = None
BLOCK = 30  # Zeilen pro KI-Anfrage

ORDNER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "analysen")
os.makedirs(ORDNER, exist_ok=True)

_analysen = {}
_lock = threading.Lock()


def modell_waehlen():
    global MODELL
    if MODELL:
        return MODELL
    try:
        vorhanden = [m["name"] for m in json.loads(urllib.request.urlopen(
            "http://127.0.0.1:11434/api/tags", timeout=10).read())["models"]]
    except Exception:
        vorhanden = []
    MODELL = next((m for m in MODELLE if m in vorhanden), MODELLE[-1])
    print("Sprecher-Erkennung nutzt", MODELL, flush=True)
    return MODELL


def ki(system, nutzer, json_antwort=True):
    modell_waehlen()
    daten = {
        "think": False,
        "model": MODELL,
        "stream": False,
        "keep_alive": "15m",
        "options": {"temperature": 0, "num_ctx": 8192},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": nutzer}],
    }
    if json_antwort:
        daten["format"] = "json"
    req = urllib.request.Request(OLLAMA, data=json.dumps(daten).encode(),
                                 headers={"Content-Type": "application/json"})
    antwort = json.loads(urllib.request.urlopen(req, timeout=180).read())
    text = antwort["message"]["content"]
    return json.loads(text) if json_antwort else text


def g_norm(wert):
    w = str(wert or "").strip().lower()
    if w[:1] in ("m",) or "mann" in w or "male" == w:
        return "m"
    if w[:1] in ("w", "f") or "frau" in w or "female" == w:
        return "w"
    return "?"


SYS_FIGUREN = (
    "Du analysierst deutsche Anime-Untertitel. Erstelle eine Liste der Figuren, die in der Folge "
    "vorkommen oder angesprochen werden, mit Geschlecht. Antworte nur als JSON: "
    '{"figuren": [{"name": "...", "g": "m" oder "w", "info": "kurz, z.B. Held, Schwester"}]}'
)

SYS_ZEILEN = (
    "Du bekommst nummerierte deutsche Anime-Untertitel in zeitlicher Reihenfolge und eine Figurenliste. "
    "Finde fuer JEDE Zeile heraus, WER sie sagt (spricht) und zu WEM (zu).\n"
    "WICHTIG: Ein Name in der Zeile ist fast immer die ANGESPROCHENE Person (zu), NICHT der Sprecher. "
    "Beispiel: 'Takeshi, warte!' -> spricht: jemand anderes, zu: Takeshi. "
    "Die Antwort auf eine Zeile kommt meist von der angesprochenen Person. "
    "Anreden helfen: 'Schwesterherz'/'Onee-chan' sagt jemand ZU einer Frau, 'Meister' sagt der Schueler. "
    "g ist das Geschlecht des SPRECHERS: m oder w, '?' wenn unklar.\n"
    'Antworte nur als JSON: {"1": {"spricht": "Name oder ?", "zu": "Name oder ?", "g": "m"}, "2": {...}, ...}'
)


def zeile_g(eintrag, figuren_g):
    if isinstance(eintrag, dict):
        name = str(eintrag.get("spricht", "")).strip()
        for n, g in figuren_g.items():
            if name and (name.lower() in n.lower() or n.lower() in name.lower()):
                return g
        return g_norm(eintrag.get("g"))
    return g_norm(eintrag)


def analysieren(schluessel, zeilen):
    a = _analysen[schluessel]
    try:
        # --- Weg 1: Sprechernamen in der Datei ---
        namen = sorted({z["sprecher"].strip() for z in zeilen if z.get("sprecher", "").strip()})
        mit_namen = sum(1 for z in zeilen if z.get("sprecher", "").strip())
        if namen and mit_namen > len(zeilen) * 0.5:
            beispiele = {n: [z["text"] for z in zeilen if z.get("sprecher", "").strip() == n][:4] for n in namen}
            frage = "Bestimme das Geschlecht dieser Anime-Figuren. Beispielsaetze dazu:\n" + "\n".join(
                f"- {n}: " + " | ".join(b) for n, b in beispiele.items())
            ant = ki('Antworte nur als JSON: {"Name": "m" oder "w", ...}', frage)
            karte = {n: g_norm(ant.get(n)) for n in namen}
            for z in zeilen:
                a["g"][str(z["id"])] = karte.get(z.get("sprecher", "").strip(), "?")
            a["figuren"] = [{"name": n, "g": g} for n, g in karte.items()]
            a["weg"] = "Sprechernamen"
            a["fortschritt"] = 100
            a["status"] = "fertig"
            return

        # --- Weg 2: KI liest den Text ---
        a["weg"] = "KI-Zusammenhang"
        gesamt = "\n".join(z["text"] for z in zeilen)
        if len(gesamt) > 14000:  # gleichmaessig kuerzen
            schritt = len(zeilen) / (14000 / max(1, len(gesamt) / len(zeilen)))
            gesamt = "\n".join(zeilen[int(i * schritt)]["text"] for i in range(int(len(zeilen) / schritt)))
        figuren = ki(SYS_FIGUREN, gesamt).get("figuren", [])
        a["figuren"] = [{"name": f.get("name", ""), "g": g_norm(f.get("g")), "info": f.get("info", "")}
                        for f in figuren if f.get("name")]
        liste = "\n".join(f"- {f['name']}: {f['g']} ({f['info']})" for f in a["figuren"]) or "(unbekannt)"
        figuren_g = {f["name"]: f["g"] for f in a["figuren"] if f["g"] in ("m", "w")}

        for start in range(0, len(zeilen), BLOCK):
            block = zeilen[start:start + BLOCK]
            vorher = zeilen[max(0, start - 6):start]
            kontext = "\n".join(f"[{a.setdefault('wer', {}).get(str(z['id']), '?')}] {z['text']}" for z in vorher)
            nummern = "\n".join(f"{i + 1}. {z['text']}" for i, z in enumerate(block))
            frage = (f"Figuren:\n{liste}\n\n"
                     + (f"Davor (schon zugeordnet):\n{kontext}\n\n" if kontext else "")
                     + f"Zuordnen:\n{nummern}")
            try:
                ant = ki(SYS_ZEILEN, frage)
            except Exception:
                ant = {}
            for i, z in enumerate(block):
                e = ant.get(str(i + 1))
                a["g"][str(z["id"])] = zeile_g(e, figuren_g)
                if isinstance(e, dict):
                    a.setdefault("wer", {})[str(z["id"])] = str(e.get("spricht", "?"))
            a["fortschritt"] = int(100 * min(len(zeilen), start + BLOCK) / len(zeilen))
        a["status"] = "fertig"
    except Exception as e:
        a["status"] = "fehler"
        a["fehler"] = str(e)
        print("Sprecher-Erkennung Fehler:", e, flush=True)
    finally:
        try:  # Grafikspeicher fuer die Stimme wieder freigeben
            urllib.request.urlopen(urllib.request.Request(
                "http://127.0.0.1:11434/api/generate",
                data=json.dumps({"model": MODELL, "keep_alive": 0}).encode(),
                headers={"Content-Type": "application/json"}), timeout=20).read()
        except Exception:
            pass
        if a["status"] == "fertig":
            with open(os.path.join(ORDNER, schluessel + ".json"), "w", encoding="utf-8") as f:
                json.dump(a, f, ensure_ascii=False, indent=1)
            m = sum(1 for v in a["g"].values() if v == "m")
            w = sum(1 for v in a["g"].values() if v == "w")
            print(f"Sprecher-Erkennung fertig ({a['weg']}): {m} Mann, {w} Frau, "
                  f"{len(a['g']) - m - w} unklar", flush=True)


def anfragen(zeilen):
    """Startet die Analyse (falls noch nicht da) und gibt den Stand zurueck."""
    schluessel = hashlib.sha1(json.dumps([z["text"] for z in zeilen], ensure_ascii=False)
                              .encode("utf-8")).hexdigest()[:16]
    with _lock:
        if schluessel not in _analysen:
            datei = os.path.join(ORDNER, schluessel + ".json")
            if os.path.exists(datei):
                _analysen[schluessel] = json.load(open(datei, encoding="utf-8"))
            else:
                _analysen[schluessel] = {"status": "laeuft", "fortschritt": 0, "g": {}, "figuren": [], "weg": ""}
                with open(os.path.join(ORDNER, schluessel + "_zeilen.json"), "w", encoding="utf-8") as f:
                    json.dump(zeilen, f, ensure_ascii=False, indent=0)
                print(f"Sprecher-Erkennung startet ({len(zeilen)} Zeilen) ...", flush=True)
                threading.Thread(target=analysieren, args=(schluessel, zeilen), daemon=True).start()
    return stand(schluessel)


def stand(schluessel):
    a = _analysen.get(schluessel)
    if not a:
        return {"status": "unbekannt"}
    return {"schluessel": schluessel, **a}
