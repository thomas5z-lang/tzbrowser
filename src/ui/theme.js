// Design anwenden (Farben, Schrift, Logo) – Werte kommen aus Einstellungen → Design
function applyTheme(t) {
  if (!t) return;
  const r = document.documentElement.style;
  if (t.accent) r.setProperty('--accent', t.accent);
  const vars = {
    '--bg': t.bg,
    '--text': t.text,
    '--bar': `color-mix(in srgb, ${t.bg} 80%, black)`,
    '--tab': `color-mix(in srgb, ${t.bg} 90%, ${t.text})`,
    '--tab-hover': `color-mix(in srgb, ${t.bg} 85%, ${t.text})`,
    '--tab-active': `color-mix(in srgb, ${t.bg} 78%, ${t.text})`,
    '--field': `color-mix(in srgb, ${t.bg} 92%, black)`,
    '--field-focus': `color-mix(in srgb, ${t.bg} 86%, ${t.text})`,
    '--muted': `color-mix(in srgb, ${t.text} 58%, ${t.bg})`,
  };
  for (const [k, v] of Object.entries(vars)) {
    if (t.custom && t.bg && t.text) r.setProperty(k, v); else r.removeProperty(k);
  }
  document.body.style.fontFamily = t.custom && t.font ? `"${t.font}", "Segoe UI", system-ui, sans-serif` : '';
  const logo = document.getElementById('logo');
  if (logo) {
    let img = logo.querySelector('img.custom-logo');
    if (t.logo) {
      if (!img) { img = document.createElement('img'); img.className = 'custom-logo'; logo.append(img); }
      img.src = t.logo;
      logo.querySelector('svg').style.display = 'none';
    } else {
      if (img) img.remove();
      logo.querySelector('svg').style.display = '';
    }
    logo.title = (t.name || 'TZBrowser') + '-Menü';
  }
}
