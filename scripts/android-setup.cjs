// Prepares the generated Capacitor Android project. Run after `npx cap add android`
// (the GitHub workflow does this for you):
//  - microphone permissions for the voice memo
//  - Gradle variables for native Google sign-in (@capacitor-firebase/authentication)
//  - google-services.json from the GOOGLE_SERVICES_JSON environment variable, if set
const fs = require('fs');

if (!fs.existsSync('android')) { console.log('Geen Android-project gevonden; sla over.'); process.exit(0); }

// 1. Microphone
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let xml = fs.readFileSync(manifestPath, 'utf8');
for (const p of ['android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS']) {
  if (!xml.includes(p)) xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
}
fs.writeFileSync(manifestPath, xml);
console.log('Microfoonrechten staan erin.');

// 2. Google sign-in Gradle variables
const varsPath = 'android/variables.gradle';
let vars = fs.readFileSync(varsPath, 'utf8');
const want = { rgcfaIncludeGoogle: 'true', androidxCredentialsVersion: "'1.3.0'" };
for (const [k, v] of Object.entries(want)) {
  if (!new RegExp(`\\b${k}\\b`).test(vars)) vars = vars.replace(/ext\s*\{/, m => `${m}\n    ${k} = ${v}`);
}
fs.writeFileSync(varsPath, vars);
console.log('Gradle-instellingen voor Google-inloggen staan erin.');

// 3. google-services.json
const gs = process.env.GOOGLE_SERVICES_JSON;
if (gs && gs.trim()) {
  JSON.parse(gs); // fail loudly on a broken paste
  fs.writeFileSync('android/app/google-services.json', gs);
  console.log('google-services.json geplaatst.');
} else {
  console.log('Let op: geen GOOGLE_SERVICES_JSON; inloggen met Google werkt dan niet in de Android-app.');
}
