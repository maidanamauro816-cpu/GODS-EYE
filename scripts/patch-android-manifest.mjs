import { readFile, writeFile } from 'node:fs/promises';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let xml = await readFile(manifestPath, 'utf8');
const permissions = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.CAMERA',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
];
const features = [
  'android.hardware.microphone',
  'android.hardware.camera',
  'android.hardware.location.gps',
];
const additions = [];
for (const permission of permissions) {
  if (!xml.includes(`android:name="${permission}"`)) {
    additions.push(`    <uses-permission android:name="${permission}" />`);
  }
}
for (const feature of features) {
  const marker = `android:name="${feature}"`;
  if (!xml.includes(marker)) {
    additions.push(`    <uses-feature android:name="${feature}" android:required="false" />`);
  }
}
if (additions.length) {
  xml = xml.replace(/(<manifest\\b[^>]*>)/, `$1\\n${additions.join('\\n')}\\n`);
  await writeFile(manifestPath, xml);
}
console.log(`Android manifest permissions verified; added ${additions.length} declarations.`);
