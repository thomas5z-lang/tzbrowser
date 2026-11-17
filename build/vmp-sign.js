// electron-builder afterSign (nach dem Bearbeiten der .exe, sonst ist die Signatur ungültig): TZBrowser für Widevine (Netflix, Crunchyroll, Disney+ …) VMP-signieren.
// Nutzt den kostenlosen castLabs-Dienst EVS. Einmalig einrichten:
//   build\evs-venv\Scripts\python.exe -m castlabs_evs.account signup
// Ohne Konto wird trotzdem gebaut, aber Streamingdienste können die Wiedergabe verweigern.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.default = async function afterSign(context) {
  const py = path.join(__dirname, 'evs-venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(py)) {
    console.warn('  • VMP-Signatur übersprungen: build\\evs-venv fehlt');
    return;
  }
  try {
    execFileSync(py, ['-m', 'castlabs_evs.vmp', 'sign-pkg', context.appOutDir], { stdio: 'inherit' });
    console.log('  • VMP-Signatur ok');
  } catch (e) {
    console.warn('  • VMP-Signatur fehlgeschlagen (EVS-Konto angemeldet?): ' + e.message);
  }
};
