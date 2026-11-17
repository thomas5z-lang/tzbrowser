'use strict';
// Datenschutz-Extras: verschlüsseltes DNS (DNS over HTTPS) und Dark Mode für alle Seiten.

const { app } = require('electron');
const settings = require('./settings');

const DNS = {
  aus: { label: 'Aus (DNS des Internetanbieters)', servers: null },
  cloudflare: { label: 'Cloudflare (1.1.1.1)', servers: ['https://cloudflare-dns.com/dns-query'] },
  quad9: { label: 'Quad9 (blockt Schadseiten, Schweiz)', servers: ['https://dns.quad9.net/dns-query'] },
  mullvad: { label: 'Mullvad (blockt Werbung, Schweden)', servers: ['https://adblock.dns.mullvad.net/dns-query'] },
  google: { label: 'Google (8.8.8.8)', servers: ['https://dns.google/dns-query'] },
};

const dnsKey = () => (DNS[settings.get('dns')] ? settings.get('dns') : 'cloudflare');

// Vor app.ready aufrufen: Schalter, die Chromium nur beim Start liest
function earlyFlags() {
  if (settings.get('forceDark')) app.commandLine.appendSwitch('enable-features', 'WebContentsForceDark');
}

// Nach app.ready: DNS über HTTPS einstellen. „streng“ = nie unverschlüsselt zurückfallen.
function applyDns() {
  const d = DNS[dnsKey()];
  try {
    if (!d.servers) app.configureHostResolver({ secureDnsMode: 'off' });
    else app.configureHostResolver({ secureDnsMode: settings.get('dnsStrict') ? 'secure' : 'automatic', secureDnsServers: d.servers });
    console.log(`[dns] ${d.label}${d.servers && settings.get('dnsStrict') ? ' (streng)' : ''}`);
  } catch (e) {
    console.error('[dns] ' + e.message);
  }
}

module.exports = { DNS, dnsKey, earlyFlags, applyDns };
