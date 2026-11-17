'use strict';
// Seitenleiste: Panels (WhatsApp, Discord, …) und Werkzeuge

const $ = (id) => document.getElementById(id);

ghost.on('panels', ({ apps, open }) => {
  const nav = $('apps');
  nav.textContent = '';
  for (const app of apps) {
    const b = document.createElement('button');
    b.className = 'item' + (app.id === open ? ' active' : '');
    b.title = `${app.name}${app.id === open ? ' (schließen)' : ''}`;
    const img = document.createElement('img');
    img.src = app.icon;
    b.append(img);
    b.addEventListener('click', () => ghost.send('panel', app.id));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); ghost.send('menu', { which: 'panel', id: app.id, x: e.clientX + 56, y: e.clientY + 84 }); });
    nav.append(b);
  }
});

const pos = (el) => { const r = el.getBoundingClientRect(); return { x: r.right + 4, y: r.top + 84 }; };

$('t-passwords').addEventListener('click', () => ghost.send('open-passwords'));
$('t-bookmarks').addEventListener('click', () => ghost.send('open-library', 'lesezeichen'));
$('t-history').addEventListener('click', () => ghost.send('open-library', 'verlauf'));
$('t-vpn').addEventListener('click', () => ghost.send('vpn-toggle'));
$('t-downloads').addEventListener('click', (e) => ghost.send('menu', { which: 'downloads', ...pos(e.currentTarget) }));
$('t-theme').addEventListener('click', (e) => { const p = pos(e.currentTarget); ghost.send('menu', { which: 'theme', x: p.x, y: p.y - 220 }); });

ghost.on('vpn', ({ state, info }) => {
  $('t-vpn').className = 'item ' + state;
  $('t-vpn').title = state === 'on' ? `VPN aktiv (${info ? info.loc : ''}) – klicken zum Ausschalten` : 'VPN (Cloudflare WARP) einschalten';
});
ghost.on('downloads', (s) => $('t-downloads').classList.toggle('active', s.active > 0));
ghost.on('theme', applyTheme);
