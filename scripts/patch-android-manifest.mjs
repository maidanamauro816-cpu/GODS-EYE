import { readFile, writeFile } from 'node:fs/promises';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let xml = await readFile(manifestPath, 'utf8');
const permissions = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
];
const features = [
  'android.hardware.microphone',
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
  // AndroidManifest.xml starts with an XML declaration, so locate the
  // manifest element itself rather than treating the first '>' as its end.
  const manifestTag = /<manifest\\b[^>]*>/s.exec(xml);
  if (!manifestTag) {
    throw new Error('AndroidManifest.xml has no valid manifest root element');
  }
  const insertAt = manifestTag.index + manifestTag[0].length;
  const newline = String.fromCharCode(10);
  xml = xml.slice(0, insertAt) + newline + additions.join(newline) + xml.slice(insertAt);
  await writeFile(manifestPath, xml);
}
console.log(`Android manifest permissions verified; added ${additions.length} declarations.`);
