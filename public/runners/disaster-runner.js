const SEEN_KEY = 'gods-eye-background-alerts-v1';
const CENTER = { lat: -27.461, lon: -55.739 };
const SOURCES = {
  quakes: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
  significant: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson',
  eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100',
  storms: 'https://www.nhc.noaa.gov/CurrentStorms.json'
};

function distanceKm(lon, lat) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(lat - CENTER.lat), dLon = rad(lon - CENTER.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(CENTER.lat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function notificationId(key) {
  let hash = 2166136261;
  for (const ch of key) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % 2147483000 + 1;
}
async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}
async function seenSet() {
  try { return new Set(JSON.parse(CapacitorKV.get(SEEN_KEY).value || '[]')); }
  catch { return new Set(); }
}
async function alertOnce(seen, key, title, body, extra = {}) {
  if (seen.has(key)) return;
  seen.add(key);
  await CapacitorNotifications.schedule({
    id: notificationId(key), title, body, channelId: extra.kind === 'earthquake' ? 'sismos-live' : 'desastres-live',
    extra
  });
}
async function checkQuakes(seen) {
  const [recent, significant] = await Promise.all([json(SOURCES.quakes), json(SOURCES.significant)]);
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  const items = new Map();
  for (const q of [...(recent.features || []), ...(significant.features || [])]) {
    if (Number(q.properties?.time) >= cutoff) items.set(q.id, q);
  }
  for (const q of items.values()) {
    const p = q.properties || {}, c = q.geometry?.coordinates || [];
    const lon = Number(c[0]), lat = Number(c[1]), depth = Number(c[2]), mag = Number(p.mag);
    if (![lon, lat, depth, mag].every(Number.isFinite)) continue;
    const km = distanceKm(lon, lat);
    if (!(mag >= 4.5 || (km <= 1000 && mag >= 3))) continue;
    await alertOnce(seen, 'usgs:' + q.id,
      '🚨 SISMO M' + mag.toFixed(1) + ' · ' + (p.place || 'Ubicación no informada'),
      'Profundidad ' + depth.toFixed(1) + ' km · ' + new Date(p.time).toLocaleString() + (km <= 1000 ? ' · A ' + Math.round(km) + ' km de Candelaria' : ''),
      { kind: 'earthquake', lat, lon, magnitude: mag, eventId: q.id });
  }
}
async function checkEonet(seen) {
  const data = await json(SOURCES.eonet);
  const allowed = new Set(['severeStorms', 'wildfires', 'volcanoes', 'floods']);
  for (const event of data.events || []) {
    const categories = (event.categories || []).filter(c => allowed.has(c.id));
    if (!categories.length) continue;
    const latest = (event.geometry || []).slice(-1)[0];
    const coords = latest?.type === 'Point' && Array.isArray(latest.coordinates) ? latest.coordinates : null;
    const category = categories.map(c => c.title || c.id).join(', ');
    await alertOnce(seen, 'eonet:' + event.id, '🌍 ' + (event.title || 'Evento natural'),
      category + (event.description ? ' · ' + event.description : ''),
      { kind: 'natural-event', lat: coords ? Number(coords[1]) : null, lon: coords ? Number(coords[0]) : null, eventId: event.id });
  }
}
async function checkNhc(seen) {
  const data = await json(SOURCES.storms);
  for (const storm of data.activeStorms || data.active_storms || []) {
    const id = storm.id || storm.atcf || storm.name;
    await alertOnce(seen, 'noaa:' + id, '🌀 NOAA · ' + (storm.name || 'Sistema tropical activo'),
      'Sistema tropical activo. Consultá el parte oficial del NHC para trayectoria e intensidad.',
      { kind: 'tropical-storm', eventId: String(id) });
  }
}
addEventListener('checkDisasters', async (resolve, reject) => {
  try {
    const seen = await seenSet();
    await Promise.allSettled([checkQuakes(seen), checkEonet(seen), checkNhc(seen)]);
    CapacitorKV.set(SEEN_KEY, JSON.stringify([...seen].slice(-1200)));
    resolve();
  } catch (error) {
    console.error('GOD\'S EYE background alerts:', error);
    reject(error);
  }
});
