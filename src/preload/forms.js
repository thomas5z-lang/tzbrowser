'use strict';
// Passwortmanager – Seitenteil (isolierte Welt, jede Webseite):
//  - erkennt Logins und bietet das Speichern an
//  - füllt gespeicherte Zugangsdaten auf der passenden Seite aus

const { ipcRenderer, webFrame } = require('electron');

// Passkeys nur auf Wunsch: Seiten wie Google starten die Passkey-Abfrage automatisch beim Laden.
// In Electron öffnet das sofort den Windows-Sicherheitsdialog. TZBrowser erlaubt die Abfrage nur,
// wenn der Nutzer gerade selbst geklickt/getippt hat (z. B. "Mit Passkey anmelden").
const PASSKEY_GUARD = `(() => {
  if (window.__ghostPasskeyGuard || !navigator.credentials) return;
  window.__ghostPasskeyGuard = true;
  try {
    if (window.PublicKeyCredential) {
      PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false);
    }
    const orig = navigator.credentials.get.bind(navigator.credentials);
    navigator.credentials.get = function get(options) {
      const wantsPasskey = options && options.publicKey;
      const userAsked = navigator.userActivation && navigator.userActivation.isActive;
      if (wantsPasskey && (options.mediation === 'conditional' || !userAsked)) {
        return Promise.reject(new DOMException('Passkey-Abfrage ohne Klick von TZBrowser blockiert', 'NotAllowedError'));
      }
      return orig(options);
    };
  } catch (e) { /* egal */ }
})();`;

if (/^https?:$/.test(location.protocol)) {
  webFrame.executeJavaScript(PASSKEY_GUARD).catch(() => {});
  if (/^accounts\.google\./i.test(location.hostname)) {
    try {
      const fx = ipcRenderer.sendSync('ghost:google-login-script', location.hostname);
      if (fx) webFrame.executeJavaScript(fx).catch(() => {});
    } catch { /* egal */ }
  }
  const USER_HINT = /user|mail|login|identifier|account|konto|benutzer|nutzer|name|e-mail|phone|tel|id$/i;
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.disabled;
  const pwFields = () => [...document.querySelectorAll('input[type="password"]')].filter(visible);
  const describe = (i) => `${i.name || ''} ${i.id || ''} ${i.autocomplete || ''} ${i.placeholder || ''} ${i.getAttribute('aria-label') || ''}`;

  // Benutzerfeld zum Passwortfeld finden (das passende Feld davor)
  function userFieldFor(pw) {
    const scope = pw.form || pw.closest('form, [role="dialog"], main, body') || document;
    const inputs = [...scope.querySelectorAll('input')]
      .filter((i) => visible(i) && /^(text|email|tel|)$/i.test(i.type) && !/search|suche|captcha|code|otp/i.test(describe(i)));
    const before = inputs.filter((i) => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
    return before.reverse().find((i) => USER_HINT.test(describe(i))) || before[0] || null;
  }

  // Mehrstufige Logins (erst E-Mail, dann Passwort): Benutzernamen merken
  const remember = (v) => { try { if (v) sessionStorage.setItem('__ghost_user', v); } catch { /* egal */ } };
  const recall = () => { try { return sessionStorage.getItem('__ghost_user') || ''; } catch { return ''; } };
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.tagName === 'INPUT' && /^(text|email|tel)$/i.test(t.type) && USER_HINT.test(describe(t))) remember(t.value.trim());
  }, true);

  // ---------- Speichern anbieten ----------
  let lastSent = '';
  function capture() {
    const fields = pwFields().filter((p) => p.value);
    if (!fields.length) return;
    // Registrierung/Passwort ändern: das letzte (neue) Passwortfeld nehmen
    const pw = fields[fields.length - 1];
    if (/current-password|old/i.test(describe(pw)) && fields.length > 1) return;
    const u = userFieldFor(fields[0]);
    const username = (u && u.value.trim()) || recall();
    const key = `${username}\n${pw.value}`;
    if (key === lastSent) return;
    lastSent = key;
    ipcRenderer.send('ghost:pw-capture', { username, password: pw.value });
  }
  document.addEventListener('submit', capture, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.type === 'password') capture();
  }, true);
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button, input[type="submit"], [role="button"]');
    if (b && pwFields().some((p) => p.value)) setTimeout(capture, 0);
  }, true);
  window.addEventListener('pagehide', capture);

  // ---------- Ausfüllen ----------
  const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  function setValue(el, value) {
    el.focus();
    nativeSet.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.style.transition = 'background-color .4s';
    el.style.backgroundColor = 'rgba(250, 30, 78, .14)';
    el.title = 'Von TZBrowser ausgefüllt';
    setTimeout(() => { el.style.backgroundColor = ''; }, 1600);
  }

  async function fillWith(username, pw) {
    const cred = await ipcRenderer.invoke('ghost:pw-fill', username);
    if (!cred) return;
    const u = userFieldFor(pw);
    if (u && cred.username && u.value !== cred.username) setValue(u, cred.username);
    setValue(pw, cred.password);
    pw.blur();
  }

  let accounts = null;
  let filled = false;
  async function tryFill() {
    if (filled) return;
    const pw = pwFields()[0];
    if (!pw || pw.value) return;
    if (!accounts) {
      try { accounts = await ipcRenderer.invoke('ghost:pw-query'); } catch { accounts = []; }
    }
    if (!accounts.length) return;
    filled = true;
    if (accounts.length === 1) {
      await fillWith(accounts[0].username, pw);
    } else {
      // Mehrere Konten: beim Klick ins Feld Auswahl anzeigen, sonst das zuletzt genutzte vorschlagen
      const offer = async (e) => {
        if (!e.isTrusted) return;
        const choice = await ipcRenderer.invoke('ghost:pw-choose');
        if (choice !== null) fillWith(choice, pwFields()[0] || pw);
      };
      const u = userFieldFor(pw);
      [u, pw].filter(Boolean).forEach((f) => f.addEventListener('mousedown', offer));
      await fillWith(accounts[0].username, pw);
    }
  }

  // Formulare erscheinen oft erst später (Single-Page-Apps, Login-Popups)
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(tryFill, 250); };
  window.addEventListener('DOMContentLoaded', () => {
    schedule();
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 30_000);
  });
}
