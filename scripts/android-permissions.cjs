// Adds the microphone permissions the voice memo needs to the generated Android manifest.
// Run after `npx cap add android` (the GitHub workflow does this for you).
const fs = require('fs');
const path = 'android/app/src/main/AndroidManifest.xml';
if (!fs.existsSync(path)) { console.log('Geen Android-project gevonden; sla over.'); process.exit(0); }
let xml = fs.readFileSync(path, 'utf8');
const perms = ['android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'];
let added = 0;
for (const p of perms) {
  if (!xml.includes(p)) {
    xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
    added++;
  }
}
fs.writeFileSync(path, xml);
console.log(added ? `Microfoonrechten toegevoegd (${added}).` : 'Microfoonrechten stonden er al.');
