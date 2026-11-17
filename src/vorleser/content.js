// Herzstueck: bereitet die Saetze vorab beim Sprach-Server vor und spielt
// sie genau dann ab, wenn der Untertitel im Video erscheint.
(() => {
  if (window.__animeVorleserContent) return;
  window.__animeVorleserContent = true;

  const STANDARD = {
    an: true,
    stimme: "omni_erzaehler",
    tempo: 1.0,
    original: 15, // Lautstaerke Originalton in %
    lautstaerke: 100, // Lautstaerke Vorleser in %
    schilder: false, // Schilder/Einblendungen mitlesen
    spurWahl: "auto",
    geschlecht: true, // Maenner/Frauen unterschiedliche Stimmen
    stimmeM: "omni_mann",
    stimmeW: "omni_frau",
  };
  const VORLAUF_SEK = 90; // so weit im Voraus vertonen
  const PARALLEL = 3;
  const ZU_SPAET = 1.2;

  let einst = { ...STANDARD };
  let spuren = [];
  let aktiveUrl = null;
  let zeilen = [];
  let generation = 0;
  let video = null;
  let ctx = null;
  let gain = null;
  const puffer = new Map();
  const laeuft = new Set();
  let zeiger = 0;
  let quellen = [];
  let quelleEnde = 0;
  let gemerkteLautstaerke = null;
  let serverFehlerBis = 0;
  let serverOk = true;
  let gespielt = 0;
  let badge = null;
  let badgeTimer = null;
  let sprecher = { status: "aus", g: {} };
  let sprecherTimer = null;

  // ---------- Untertitel empfangen ----------
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data && e.data.__animeVorleser) {
      if (e.data.liste) {
        chrome.runtime.sendMessage({ typ: "liste", liste: e.data.liste }).catch(() => {});
      } else {
        chrome.runtime.sendMessage({ typ: "gefunden", url: e.data.url, text: e.data.text }).catch(() => {});
      }
    }
  });

  chrome.runtime.onMessage.addListener((m, _s, antworten) => {
    if (m.typ === "spuren") {
      spuren = m.spuren || [];
      spurWaehlen();
    }
    if (m.typ === "info" && video) {
      antworten({
        aktiv: !!aktiveUrl,
        url: aktiveUrl,
        zeilen: zeilen.length,
        bereit: puffer.size,
        gespielt,
        serverOk,
        sprecher: { status: sprecher.status, fortschritt: sprecher.fortschritt, weg: sprecher.weg, figuren: sprecher.figuren },
      });
    }
  });

  function spurWaehlen() {
    if (!spuren.length) return;
    let spur = einst.spurWahl !== "auto" && spuren.find((s) => s.url === einst.spurWahl);
    if (!spur) {
      const deutsch = spuren.filter((s) => s.deutsch);
      spur = (deutsch.length ? deutsch : spuren).reduce((a, b) => (b.zeit > a.zeit ? b : a));
    }
    if (spur.url !== aktiveUrl) {
      aktiveUrl = spur.url;
      neuAufbauen(spur.text);
    }
  }

  function neuAufbauen(text) {
    if (text == null) {
      const s = spuren.find((x) => x.url === aktiveUrl);
      if (!s) return;
      text = s.text;
    }
    zeilen = AVUntertitel.parse(text, einst.schilder);
    allesZuruecksetzen();
    sprecherStarten();
    if (video) zeigeBadge(`🔊 Vorleser: ${zeilen.length} Untertitel gefunden`);
  }

  // ---------- Sprecher-Erkennung (Mann/Frau) ----------
  function sprecherStarten() {
    clearTimeout(sprecherTimer);
    sprecher = { status: "aus", g: {} };
    if (!einst.geschlecht || !zeilen.length || !video) return;
    const gen = generation;
    const daten = zeilen.map((z) => ({ id: z.id, text: z.text, sprecher: z.sprecher || "" }));
    chrome.runtime.sendMessage({ typ: "sprecher", zeilen: daten }).then(function weiter(r) {
      if (gen !== generation || !r) return;
      sprecher = r;
      if (r.status === "laeuft") {
        sprecherTimer = setTimeout(() => chrome.runtime.sendMessage({ typ: "sprecher", schluessel: r.schluessel }).then(weiter), 3000);
      } else if (r.status === "fertig") {
        zeigeBadge("🎭 Sprecher erkannt – Männer- und Frauenstimmen aktiv");
      }
    }).catch(() => {});
  }

  function stimmeFuer(z) {
    if (!einst.geschlecht) return einst.stimme;
    const g = sprecher.g && sprecher.g[String(z.id)];
    if (g === "m") return einst.stimmeM;
    if (g === "w") return einst.stimmeW;
    return einst.stimme;
  }

  // Zeile noch nicht analysiert? Dann kurz warten, ausser sie kommt gleich dran.
  function wartetAufSprecher(z) {
    if (!einst.geschlecht || sprecher.status !== "laeuft") return false;
    if (sprecher.g && sprecher.g[String(z.id)]) return false;
    return z.start - video.currentTime > 6;
  }

  function allesZuruecksetzen() {
    generation++;
    quellenStoppen();
    puffer.clear();
    laeuft.clear();
    gespielt = 0;
    zeigerSetzen();
  }

  function zeigerSetzen() {
    const t = video ? video.currentTime : 0;
    zeiger = zeilen.findIndex((z) => z.start >= t - 0.3);
    if (zeiger < 0) zeiger = zeilen.length;
  }

  // ---------- Einstellungen ----------
  chrome.storage.sync.get(STANDARD).then((e) => {
    einst = e;
    chrome.runtime.sendMessage({ typ: "spuren" }).then((r) => {
      spuren = (r && r.spuren) || [];
      spurWaehlen();
    }).catch(() => {});
  });

  chrome.storage.onChanged.addListener((aenderung, bereich) => {
    if (bereich !== "sync") return;
    const alt = { ...einst };
    for (const k in aenderung) einst[k] = aenderung[k].newValue;
    if (alt.schilder !== einst.schilder) neuAufbauen();
    else if (alt.geschlecht !== einst.geschlecht) { allesZuruecksetzen(); sprecherStarten(); }
    else if (["stimme", "tempo", "stimmeM", "stimmeW"].some((k) => alt[k] !== einst[k])) allesZuruecksetzen();
    if (alt.spurWahl !== einst.spurWahl) { aktiveUrl = null; spurWaehlen(); }
    if (gain) gain.gain.value = einst.lautstaerke / 100;
    if (alt.an !== einst.an || alt.original !== einst.original) {
      if (!einst.an) quellenStoppen();
      originalLautstaerke();
      zeigeBadge(einst.an ? "🔊 Vorleser an" : "🔇 Vorleser aus");
    }
  });

  // ---------- Video finden ----------
  setInterval(() => {
    const v = document.querySelector("video");
    if (v && v !== video) anbinden(v);
  }, 1000);

  function anbinden(v) {
    video = v;
    gemerkteLautstaerke = null;
    if (!ctx) {
      ctx = new AudioContext();
      gain = ctx.createGain();
      gain.gain.value = einst.lautstaerke / 100;
      gain.connect(ctx.destination);
    }
    v.addEventListener("seeking", () => { quellenStoppen(); zeigerSetzen(); });
    v.addEventListener("pause", () => ctx.suspend());
    v.addEventListener("play", () => { ctx.resume(); originalLautstaerke(); });
    v.addEventListener("loadeddata", () => { originalLautstaerke(); zeigerSetzen(); });
    v.addEventListener("ratechange", () => quellen.forEach((q) => (q.playbackRate.value = v.playbackRate || 1)));
    zeigerSetzen();
    originalLautstaerke();
    if (zeilen.length) {
      zeigeBadge(`🔊 Vorleser bereit (${zeilen.length} Untertitel)`);
      if (sprecher.status === "aus") sprecherStarten();
    }
  }

  function originalLautstaerke() {
    if (!video) return;
    if (einst.an && aktiveUrl) {
      if (gemerkteLautstaerke === null) gemerkteLautstaerke = video.volume;
      video.volume = Math.max(0, Math.min(1, einst.original / 100));
    } else if (gemerkteLautstaerke !== null) {
      video.volume = gemerkteLautstaerke;
      gemerkteLautstaerke = null;
    }
  }

  // ---------- Vorab vertonen ----------
  function base64ZuBuffer(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  }

  function laden(z) {
    laeuft.add(z.id);
    const gen = generation;
    const naechste = zeilen[z.id + 1];
    const dauer = z.ende - z.start;
    let slot = naechste ? Math.min(naechste.start - z.start, dauer + 1.5) : dauer + 1.5;
    slot = Math.max(slot, dauer + 0.3);
    chrome.runtime
      .sendMessage({ typ: "tts", text: z.text, stimme: stimmeFuer(z), tempo: einst.tempo, max_sek: Math.round(slot * 100) / 100 })
      .then(async (r) => {
        if (gen !== generation) return;
        if (!r || r.fehler) throw new Error((r && r.fehler) || "keine Antwort");
        const buf = await ctx.decodeAudioData(base64ZuBuffer(r.audio));
        if (gen !== generation) return;
        puffer.set(z.id, buf);
        if (!serverOk) zeigeBadge("🔊 Sprach-Server wieder da");
        serverOk = true;
      })
      .catch((e) => {
        if (gen !== generation) return;
        serverOk = false;
        serverFehlerBis = Date.now() + 3000;
        zeigeBadge("⚠️ " + (e.message || "Fehler") + "");
      })
      .finally(() => { if (gen === generation) laeuft.delete(z.id); });
  }

  function vorbereiten() {
    if (Date.now() < serverFehlerBis || laeuft.size >= PARALLEL) return;
    const t = video.currentTime;
    for (let i = zeiger; i < zeilen.length && zeilen[i].start < t + VORLAUF_SEK; i++) {
      const z = zeilen[i];
      if (wartetAufSprecher(z)) break;
      if (!puffer.has(z.id) && !laeuft.has(z.id)) {
        laden(z);
        if (laeuft.size >= PARALLEL) break;
      }
    }
    for (const id of puffer.keys()) if (zeilen[id] && zeilen[id].ende < t - 30) puffer.delete(id);
  }

  // ---------- Abspielen ----------
  function quellenStoppen() {
    quellen.forEach((q) => { try { q.stop(); } catch (e) {} });
    quellen = [];
    quelleEnde = 0;
  }

  function abspielen(z) {
    const buf = puffer.get(z.id);
    const jetzt = ctx.currentTime;
    const rate = video.playbackRate || 1;
    let start = jetzt;
    if (quelleEnde > jetzt) {
      if (quelleEnde - jetzt < 0.8) start = quelleEnde; // kurz warten, nicht ueberlappen
      else quellenStoppen(); // alter Satz haengt zu weit hinterher
    }
    const q = ctx.createBufferSource();
    q.buffer = buf;
    q.playbackRate.value = rate;
    q.connect(gain);
    q.start(start);
    q.onended = () => (quellen = quellen.filter((x) => x !== q));
    quellen.push(q);
    quelleEnde = start + buf.duration / rate;
    gespielt++;
  }

  setInterval(() => {
    if (!einst.an || !video || !zeilen.length || !ctx) return;
    vorbereiten();
    if (video.paused || video.seeking) return;
    if (ctx.state === "suspended") ctx.resume();
    const t = video.currentTime;
    while (zeiger < zeilen.length && zeilen[zeiger].start <= t) {
      const z = zeilen[zeiger];
      const spaet = t - z.start;
      if (puffer.has(z.id)) {
        if (spaet < ZU_SPAET) abspielen(z);
        zeiger++;
      } else if (spaet > ZU_SPAET) {
        zeiger++; // nicht rechtzeitig fertig geworden - ueberspringen
      } else break; // kurz auf den Satz warten
    }
  }, 50);

  // ---------- kleine Statusanzeige im Video ----------
  function zeigeBadge(text) {
    if (!video || !video.parentElement) return;
    if (!badge || !badge.isConnected) {
      badge = document.createElement("div");
      badge.style.cssText =
        "position:absolute;top:16px;left:16px;z-index:2147483647;padding:6px 12px;border-radius:8px;" +
        "background:rgba(0,0,0,.75);color:#fff;font:600 14px system-ui,sans-serif;pointer-events:none;" +
        "transition:opacity .4s;opacity:0;border-left:3px solid #f47521";
      video.parentElement.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.opacity = "1";
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => (badge.style.opacity = "0"), 3500);
  }
})();
