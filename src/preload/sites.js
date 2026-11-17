'use strict';
// Läuft in jeder Seite (isolierte Welt), wird aber nur auf YouTube und Twitch aktiv.
//  YouTube: SponsorBlock (Segmente überspringen) + Dislikes anzeigen
//  Twitch:  Purple AdBlock einspielen, Werbung notfalls stummschalten, Kanalpunkte einsammeln

const { ipcRenderer, webFrame } = require('electron');

const host = location.hostname;
const isYouTube = /(^|\.)youtube\.com$/i.test(host);
const isGoogleConsent = /^consent\.(youtube|google)\.[a-z.]+$/i.test(host);
const isTwitch = /(^|\.)twitch\.tv$/i.test(host);

// Eigene Zustimmungsseite (consent.youtube.com / consent.google.com): "Alle ablehnen" klicken
if (isGoogleConsent && window === window.top) {
  window.addEventListener('DOMContentLoaded', () => {
    const btn = [...document.querySelectorAll('button, input[type=submit]')]
      .find((b) => /^(alle ablehnen|reject all)/i.test((b.getAttribute('aria-label') || b.value || b.textContent || '').trim()));
    if (btn) btn.click();
  });
}

if ((isYouTube || isTwitch) && window === window.top) {
  let cfg = {};
  try { cfg = ipcRenderer.sendSync('ghost:site-config', host) || {}; } catch { /* TZBrowser-Hauptprozess nicht erreichbar */ }

  // ---------- kleine Einblendung ----------
  const toast = (text) => {
    try { ipcRenderer.send('ghost:site-event', `${host}: ${text}`); } catch { /* egal */ }
    const show = () => {
      let el = document.getElementById('ghost-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'ghost-toast';
        el.style.cssText = 'position:fixed;left:24px;bottom:24px;z-index:2147483647;padding:10px 16px;border-radius:10px;'
          + 'background:#1e2230ee;color:#e6e8ee;font:600 14px "Segoe UI",system-ui,sans-serif;box-shadow:0 8px 30px #0008;'
          + 'border-left:4px solid #8b6cff;transition:opacity .3s;pointer-events:none';
        document.documentElement.appendChild(el);
      }
      el.textContent = '👻 ' + text;
      el.style.opacity = '1';
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.style.opacity = '0'; }, 2600);
    };
    if (document.documentElement) show();
  };

  // =============================== YouTube ===============================
  if (isYouTube) {
    // Werbeplätze entfernen, bevor YouTubes Player sie sieht (Hauptwelt)
    if (cfg.ytScript) webFrame.executeJavaScript(cfg.ytScript).catch(() => {});

    const LABELS = {
      sponsor: 'Sponsor', selfpromo: 'Eigenwerbung', interaction: 'Abo-Aufruf',
      music_offtopic: 'Nicht-Musik-Teil', intro: 'Intro', outro: 'Abspann', preview: 'Vorschau', filler: 'Füller',
    };
    let currentId = null;
    let segments = [];
    const skipped = new Set();
    let dislikeValue = null;

    const videoId = () => {
      try {
        const u = new URL(location.href);
        if (u.pathname === '/watch') return u.searchParams.get('v');
        const m = /^\/(shorts|live)\/([\w-]{11})/.exec(u.pathname);
        return m ? m[2] : null;
      } catch { return null; }
    };

    const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' Mio.' : n >= 1e4 ? Math.round(n / 1e3) + ' Tsd.' : n.toLocaleString('de-DE'));

    const paintDislikes = () => {
      if (dislikeValue == null) return;
      const buttons = document.querySelectorAll('dislike-button-view-model button, #segmented-dislike-button button, ytd-reel-video-renderer[is-active] #dislike-button button');
      buttons.forEach((btn) => {
        let span = btn.querySelector('.ghost-dislikes');
        if (!span) {
          span = document.createElement('span');
          span.className = 'ghost-dislikes';
          span.style.cssText = 'margin-left:6px;font-weight:500;white-space:nowrap';
          btn.appendChild(span);
          btn.style.width = 'auto';
          btn.style.paddingRight = '14px';
        }
        span.textContent = fmt(dislikeValue);
        span.title = 'Dislikes (Schätzung von Return YouTube Dislike)';
      });
    };

    const onNavigate = () => {
      const id = videoId();
      if (id === currentId) return;
      currentId = id;
      segments = [];
      skipped.clear();
      dislikeValue = null;
      document.querySelectorAll('.ghost-dislikes').forEach((s) => s.remove());
      if (!id) return;
      if (cfg.sponsorblock) {
        ipcRenderer.invoke('ghost:sb', id).then((s) => { if (currentId === id) segments = s || []; }).catch(() => {});
      }
      if (cfg.dislikes) {
        ipcRenderer.invoke('ghost:ryd', id).then((n) => { if (currentId === id && n != null) { dislikeValue = n; paintDislikes(); } }).catch(() => {});
      }
    };

    // Cookie-Zustimmung von YouTube/Google automatisch mit "Alle ablehnen" beantworten
    let consentDone = false;
    const consentTimer = setInterval(() => {
      const reject = [...document.querySelectorAll('button')]
        .find((b) => b.getClientRects().length && /^(alle ablehnen|reject all)$/i.test((b.textContent || '').trim() || (b.getAttribute('aria-label') || '').trim()));
      if (reject && !consentDone) {
        consentDone = true;
        reject.click();
        toast('Cookie-Abfrage von YouTube abgelehnt');
        setTimeout(() => { consentDone = false; }, 5000);
      }
    }, 800);
    setTimeout(() => clearInterval(consentTimer), 60_000);

    // Zweite Schutzschicht gegen YouTube-Werbung: kommt eine Anzeige durch,
    // Ton aus, ans Ende springen und "Überspringen" klicken.
    if (cfg.youtubeAds) {
      let adActive = false;
      let wasMuted = false;
      let skippedAds = 0;
      setInterval(() => {
        const player = document.querySelector('#movie_player');
        const v = player && player.querySelector('video');
        const adShowing = !!(player && player.classList.contains('ad-showing'));
        if (adShowing && v) {
          if (!adActive) { adActive = true; wasMuted = v.muted; }
          v.muted = true;
          if (v.playbackRate !== 16) v.playbackRate = 16;
          if (v.paused) v.play().catch(() => {});
          const skip = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button, button[id^="skip-button"]');
          if (skip) skip.click();
        } else if (adActive) {
          adActive = false;
          skippedAds++;
          if (v) { v.muted = wasMuted; v.playbackRate = 1; }
          toast(`YouTube-Werbung übersprungen (${skippedAds}× in diesem Tab)`);
        }
        // Werbebanner und "Gesponsert"-Kästen ausblenden
        document.querySelectorAll('.ytp-ad-overlay-container, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, #player-ads, ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]')
          .forEach((el) => {
            el.style.display = 'none';
            // sonst bleibt auf der Startseite ein leeres schwarzes Feld im Raster stehen
            const slot = el.closest('ytd-rich-item-renderer, ytd-rich-section-renderer');
            if (slot) slot.style.display = 'none';
          });
        // leere Rasterfelder (Werbung bereits entfernt) ebenfalls ausblenden
        document.querySelectorAll('ytd-rich-item-renderer').forEach((el) => {
          const c = el.querySelector(':scope > #content');
          if (!c || c.children.length || el.style.display === 'none') { delete el.dataset.ghostEmpty; return; }
          // erst ausblenden, wenn das Feld 2 s leer bleibt (beim Laden sind Felder kurz leer)
          const since = Number(el.dataset.ghostEmpty || 0);
          if (!since) el.dataset.ghostEmpty = String(Date.now());
          else if (Date.now() - since > 2000) el.style.display = 'none';
        });
      }, 250);
    }

    // Segmente überspringen
    setInterval(() => {
      if (!segments.length) return;
      if (document.querySelector('.ad-showing')) return; // während Werbung nichts tun
      const v = document.querySelector('#movie_player video, video.html5-main-video, ytd-reel-video-renderer[is-active] video');
      if (!v || v.paused && v.currentTime === 0) return;
      const t = v.currentTime;
      for (const s of segments) {
        const key = `${s.start}-${s.end}`;
        if (t < s.start - 0.5) skipped.delete(key); // wieder davor (z. B. zurückgespult) -> erneut überspringen
        if (t >= s.start && t < s.end - 0.4 && !skipped.has(key)) {
          skipped.add(key);
          v.currentTime = Math.min(s.end, v.duration || s.end);
          toast(`${LABELS[s.category] || 'Segment'} übersprungen (${Math.round(s.end - s.start)} s)`);
        }
      }
    }, 300);

    // YouTube ist eine Single-Page-App: Seitenwechsel abfangen
    document.addEventListener('yt-navigate-finish', onNavigate);
    window.addEventListener('DOMContentLoaded', onNavigate);
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) { lastUrl = location.href; onNavigate(); }
      if (dislikeValue != null && !document.querySelector('.ghost-dislikes')) paintDislikes();
    }, 700);
  }

  // =============================== Twitch ===============================
  if (isTwitch) {
    // Purple AdBlock muss vor Twitchs eigenen Skripten laufen (Hauptwelt)
    if (cfg.twitchScript) webFrame.executeJavaScript(cfg.twitchScript).catch(() => {});

    // Rückfallebene: kommt doch Werbung durch, Ton aus und Hinweis zeigen
    if (cfg.twitchAds) {
      let mutedByGhost = false;
      setInterval(() => {
        const ad = document.querySelector('[data-a-target="video-ad-label"], [data-a-target="video-ad-countdown"], [data-test-selector="ad-banner-default-text"]');
        const videos = document.querySelectorAll('video');
        if (ad && !mutedByGhost) {
          mutedByGhost = true;
          videos.forEach((v) => { v.dataset.ghostMuted = v.muted ? '0' : '1'; v.muted = true; });
          toast('Twitch-Werbung erkannt – Ton aus, bis sie vorbei ist');
        } else if (!ad && mutedByGhost) {
          mutedByGhost = false;
          videos.forEach((v) => { if (v.dataset.ghostMuted === '1') v.muted = false; delete v.dataset.ghostMuted; });
        }
      }, 1000);
    }

    // Cookie-Banner von Twitch ablehnen
    const twConsent = setInterval(() => {
      const hasBanner = /Cookies und Werbeanzeigen|Cookies and Advertising/i.test(document.body ? document.body.innerText.slice(0, 3000) : '');
      const btn = document.querySelector('button[data-a-target="consent-banner-reject"]')
        || (hasBanner && [...document.querySelectorAll('button')].find((b) => /^(ablehnen|reject)$/i.test((b.textContent || '').trim())));
      if (btn && btn.getClientRects().length) { btn.click(); clearInterval(twConsent); toast('Cookie-Abfrage von Twitch abgelehnt'); }
    }, 1000);
    setTimeout(() => clearInterval(twConsent), 60_000);

    // Kanalpunkte-Bonus automatisch abholen
    if (cfg.twitchPoints) {
      let claimed = 0;
      setInterval(() => {
        const icon = document.querySelector('.claimable-bonus__icon, [data-test-selector="community-points-summary"] [class*="claimable-bonus"]');
        const btn = icon && icon.closest('button');
        if (btn) {
          btn.click();
          claimed++;
          toast(`Kanalpunkte-Bonus abgeholt (${claimed}× in dieser Sitzung)`);
        }
      }, 5000);
    }
  }
}
