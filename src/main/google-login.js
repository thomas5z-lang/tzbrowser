'use strict';
// Google lehnt Anmeldungen in eingebetteten Chromium-Browsern (Electron) ab:
// "Dieser Browser oder diese App ist unter Umständen nicht sicher".
// Lösung wie bei anderen Electron-Browsern (Ferdium, Rambox): NUR auf der Google-Anmeldeseite
// meldet sich TZBrowser als Firefox. Überall sonst bleibt TZBrowser ein normaler Chrome.

const LOGIN_HOST = /^accounts\.google\.[a-z.]+$/i;
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

// Gleiches im Seiten-JavaScript (navigator.userAgent usw.), sonst passt es nicht zu den Headern
const PAGE_SCRIPT = `(() => {
  if (window.__ghostFx) return; window.__ghostFx = true;
  const def = (k, v) => { try { Object.defineProperty(Navigator.prototype, k, { get: () => v, configurable: true }); } catch (e) {} };
  def('userAgent', ${JSON.stringify(FIREFOX_UA)});
  def('appVersion', '5.0 (Windows)');
  def('vendor', '');
  def('platform', 'Win32');
  def('userAgentData', undefined);
  def('oscpu', 'Windows NT 10.0; Win64; x64');
  def('productSub', '20100101');
  def('buildID', '20181001000000');
})();`;

function attach(ses) {
  // Nur ein onBeforeSendHeaders pro Sitzung möglich – wird sonst nirgends in TZBrowser genutzt
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://accounts.google.com/*', '*://accounts.google.de/*'] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    for (const k of Object.keys(headers)) {
      if (/^user-agent$/i.test(k) || /^sec-ch-ua/i.test(k)) delete headers[k];
    }
    headers['User-Agent'] = FIREFOX_UA;
    callback({ requestHeaders: headers });
  });
}

module.exports = { attach, LOGIN_HOST, PAGE_SCRIPT };
