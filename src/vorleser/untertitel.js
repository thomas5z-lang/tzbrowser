// Untertitel-Dateien (ASS / VTT / SRT) in eine einfache Liste umwandeln:
// [{ start, ende, text }] - Zeiten in Sekunden.
const AVUntertitel = (() => {
  // Stile, die meist keine gesprochenen Dialoge sind (Schilder, Lieder, Titel)
  const KEIN_DIALOG = /(sign|schild|song|lyric|karaoke|kara|^op\b|^ed\b|^op[_ -]|^ed[_ -]|opening|ending|title|titel|note|insert|logo|credit)/i;
  const DIALOG_STIL = /(default|main|dialog|italic|top|flash|thought|gedanke|narrat|internal|overlap|alt)/i;

  function zeitAss(s) {
    const m = s.trim().match(/(\d+):(\d+):(\d+)[.,](\d+)/);
    if (!m) return NaN;
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + +("0." + m[4]);
  }

  function zeitVtt(s) {
    const teile = s.trim().replace(",", ".").split(":");
    let sek = 0;
    for (const t of teile) sek = sek * 60 + parseFloat(t);
    return sek;
  }

  function saeubern(text) {
    return text
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\[Nn]/g, " ")
      .replace(/\\h/g, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseAss(daten, mitSchildern) {
    const zeilen = daten.split(/\r?\n/);
    let format = null;
    let inEvents = false;
    const liste = [];
    for (const zeile of zeilen) {
      const z = zeile.trim();
      if (z.startsWith("[")) { inEvents = /^\[events\]/i.test(z); continue; }
      if (!inEvents) continue;
      if (/^format:/i.test(z)) {
        format = z.slice(7).split(",").map((f) => f.trim().toLowerCase());
        continue;
      }
      if (!/^dialogue:/i.test(z) || !format) continue;
      const rest = z.slice(9);
      const felder = [];
      let pos = 0;
      for (let i = 0; i < format.length - 1; i++) {
        const komma = rest.indexOf(",", pos);
        felder.push(rest.slice(pos, komma).trim());
        pos = komma + 1;
      }
      felder.push(rest.slice(pos));
      const f = {};
      format.forEach((name, i) => (f[name] = felder[i] || ""));
      const roh = f.text || "";
      if (/\\p[1-9]/.test(roh)) continue; // Zeichnungen
      const stil = f.style || "";
      if (!mitSchildern) {
        if (KEIN_DIALOG.test(stil)) continue;
        if (/\\(pos|move)\(/.test(roh) && !DIALOG_STIL.test(stil)) continue;
      }
      const text = saeubern(roh);
      if (!text) continue;
      liste.push({ start: zeitAss(f.start), ende: zeitAss(f.end), text, sprecher: f.name || "" });
    }
    return liste;
  }

  function parseVtt(daten) {
    const bloecke = daten.replace(/\r/g, "").split(/\n\n+/);
    const liste = [];
    for (const block of bloecke) {
      const zeilen = block.split("\n");
      const idx = zeilen.findIndex((l) => l.includes("-->"));
      if (idx < 0) continue;
      const [a, b] = zeilen[idx].split("-->");
      const text = saeubern(zeilen.slice(idx + 1).join(" "));
      if (!text) continue;
      liste.push({ start: zeitVtt(a), ende: zeitVtt(b.trim().split(/\s+/)[0]), text, sprecher: "" });
    }
    return liste;
  }

  function parse(daten, mitSchildern) {
    const sauber = daten.replace(/^﻿/, "");
    let liste = sauber.trimStart().startsWith("[Script Info]")
      ? parseAss(sauber, mitSchildern)
      : parseVtt(sauber);
    liste = liste.filter((e) => isFinite(e.start) && isFinite(e.ende));
    liste.sort((a, b) => a.start - b.start);

    // Gleichzeitige Zeilen zusammenfassen, doppelte entfernen
    const ergebnis = [];
    for (const e of liste) {
      const letzte = ergebnis[ergebnis.length - 1];
      if (letzte && Math.abs(letzte.start - e.start) < 0.05) {
        if (!letzte.text.includes(e.text)) letzte.text += " " + e.text;
        letzte.ende = Math.max(letzte.ende, e.ende);
        continue;
      }
      ergebnis.push({ ...e });
    }
    ergebnis.forEach((e, i) => (e.id = i));
    return ergebnis;
  }

  return { parse };
})();
