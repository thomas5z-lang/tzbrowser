// Laeuft in der Crunchyroll-Seite selbst und schaut mit, wenn der Player
// eine Untertitel-Datei (ASS/VTT/SRT) laedt - oder die Liste der Untertitel
// (JSON vom Wiedergabe-Dienst), in der die Adressen pro Sprache stehen.
(() => {
  if (window.__animeVorleserInjected) return;
  window.__animeVorleserInjected = true;

  const URL_MUSTER = /\.(ass|ssa|vtt|srt)(\?|#|$)/i;
  const ADRESSE = /^https?:\/\/[^\s"']+\.(ass|ssa|vtt|srt)(\?[^\s"']*)?$/i;
  const SPRACHE = /^[a-z]{2}-[A-Z]{2}$/;

  function istUntertitel(text) {
    if (!text || text.length < 20) return false;
    const anfang = text.slice(0, 300).replace(/^﻿/, "").trimStart();
    return anfang.startsWith("[Script Info]") || anfang.startsWith("WEBVTT");
  }

  function senden(daten) {
    window.postMessage({ __animeVorleser: true, ...daten }, "*");
  }

  // In beliebigem JSON nach Untertitel-Adressen suchen und Sprache merken
  function adressenSuchen(obj, sprache, ergebnis, tiefe) {
    if (!obj || tiefe > 12) return;
    if (typeof obj === "string") {
      if (ADRESSE.test(obj)) ergebnis.push({ url: obj, sprache: sprache || "" });
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((x) => adressenSuchen(x, sprache, ergebnis, tiefe + 1));
      return;
    }
    if (typeof obj === "object") {
      const eigene = obj.language || obj.locale || obj.lang || obj.audio_locale;
      const s = typeof eigene === "string" && SPRACHE.test(eigene) ? eigene : sprache;
      for (const k in obj) {
        adressenSuchen(obj[k], SPRACHE.test(k) ? k : s, ergebnis, tiefe + 1);
      }
    }
  }

  function pruefen(url, text) {
    if (!text) return;
    if (istUntertitel(text)) {
      senden({ url: String(url), text });
      return;
    }
    const a = text.trimStart()[0];
    if ((a === "{" || a === "[") && /\.(ass|vtt|srt)/i.test(text)) {
      try {
        const liste = [];
        adressenSuchen(JSON.parse(text), "", liste, 0);
        if (liste.length) senden({ liste });
      } catch (e) {}
    }
  }

  function interessant(url, typ) {
    if (URL_MUSTER.test(url)) return true;
    if (/subtitle|caption|\/subs?\/|play|stream/i.test(url)) return true;
    return /json|text\/|octet-stream/i.test(typ || "");
  }

  // fetch mitlesen
  const altFetch = window.fetch;
  window.fetch = async function (...args) {
    const antwort = await altFetch.apply(this, args);
    try {
      const url = (args[0] && args[0].url) || String(args[0]);
      const typ = antwort.headers.get("content-type") || "";
      const groesse = Number(antwort.headers.get("content-length") || 0);
      if (!/video|audio|image|mp4|font/i.test(typ) && interessant(url, typ) && groesse < 5e6) {
        antwort.clone().text().then((t) => pruefen(url, t)).catch(() => {});
      }
    } catch (e) {}
    return antwort;
  };

  // XMLHttpRequest mitlesen
  const altOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (methode, url, ...rest) {
    this.__avUrl = String(url);
    return altOpen.call(this, methode, url, ...rest);
  };
  const altSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", () => {
      try {
        const typ = this.getResponseHeader("content-type") || "";
        if (/video|audio|image|mp4|font/i.test(typ) || !interessant(this.__avUrl, typ)) return;
        if (this.responseType === "" || this.responseType === "text") {
          pruefen(this.__avUrl, this.responseText);
        } else if (this.responseType === "json" && this.response) {
          pruefen(this.__avUrl, JSON.stringify(this.response));
        } else if (this.response instanceof ArrayBuffer && this.response.byteLength < 5e6) {
          pruefen(this.__avUrl, new TextDecoder().decode(this.response));
        }
      } catch (e) {}
    });
    return altSend.apply(this, args);
  };
})();
