import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const SOURCES = {
  quakes: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
  significant: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson',
  eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100',
  storms: 'https://www.nhc.noaa.gov/CurrentStorms.json'
};
const CENTER = { lat: -27.461, lon: -55.739 };
const STORAGE_KEY = 'gods-eye-alerted-events-v1';
const MAX_REMEMBERED = 1200;

function distanceKm(lon, lat) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(lat - CENTER.lat), dLon = rad(lon - CENTER.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(CENTER.lat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function eventCoordinates(event) {
  const geometry = event?.geometry || [];
  const latest = geometry[geometry.length - 1];
  if (!latest?.coordinates) return null;
  const c = latest.coordinates;
  if (latest.type === 'Point' && Array.isArray(c)) return { lon: Number(c[0]), lat: Number(c[1]) };
  if (Array.isArray(c?.[0]) && typeof c[0][0] === 'number') return { lon: Number(c[0][0]), lat: Number(c[0][1]) };
  return null;
}
function stableId(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % 2147483000 + 1;
}
function readSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
}

export class DisasterWatcher {
  constructor({ onAlert = () => {}, onStatus = () => {}, onNavigate = () => {} } = {}) {
    this.onAlert = onAlert;
    this.onStatus = onStatus;
    this.onNavigate = onNavigate;
    this.seen = readSeen();
    this.timer = null;
    this.running = false;
    this.busy = false;
    this.listeners = [];
  }

  async start() {
    if (this.running) return;
    this.running = true;
    if (Capacitor.isNativePlatform()) {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') await LocalNotifications.requestPermissions();
      await LocalNotifications.createChannel({ id: 'sismos-live', name: 'Alertas sísmicas', description: 'Sismos importantes y cercanos', importance: 5, vibration: true });
      await LocalNotifications.createChannel({ id: 'desastres-live', name: 'Desastres naturales', description: 'Tormentas severas, incendios y volcanes', importance: 4, vibration: true });
      this.listeners.push(await LocalNotifications.addListener('localNotificationActionPerformed', event => {
        const extra = event.notification?.extra;
        if (Number.isFinite(extra?.lat) && Number.isFinite(extra?.lon)) this.onNavigate(extra);
      }));
    }
    this.listeners.push(await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) this.checkAll();
    }));
    document.addEventListener('visibilitychange', this.handleVisibility);
    await this.checkAll();
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.checkAll();
    }, 60_000);
    this.onStatus({ active: true, interval: '60 s en primer plano' });
  }

  handleVisibility = () => {
    if (document.visibilityState === 'visible') this.checkAll();
  };

  async checkAll() {
    if (this.busy || !this.running) return;
    this.busy = true;
    const outcomes = await Promise.allSettled([this.checkEarthquakes(), this.checkNasaEvents(), this.checkStorms()]);
    const failed = outcomes.filter(x => x.status === 'rejected').length;
    this.onStatus({ active: true, failedSources: failed, checkedAt: new Date().toISOString() });
    this.busy = false;
  }

  async fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' · ' + new URL(url).hostname);
    return response.json();
  }

  async notify({ key, title, body, channelId, lat, lon, metadata = {} }) {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const remembered = [...this.seen].slice(-MAX_REMEMBERED);
    this.seen = new Set(remembered);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(remembered)); } catch {}
    const alert = { title, body, lat, lon, ...metadata };
    this.onAlert(alert);
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({ notifications: [{
        id: stableId(key), title, body, channelId, schedule: undefined,
        extra: { lat, lon, eventId: key, ...metadata }
      }] });
    }
  }

  async checkEarthquakes() {
    const [recent, significant] = await Promise.all([this.fetchJson(SOURCES.quakes), this.fetchJson(SOURCES.significant)]);
    const quakes = new Map();
    for (const q of [...(recent.features || []), ...(significant.features || [])]) quakes.set(q.id, q);
    for (const q of quakes.values()) {
      const p = q.properties || {}, c = q.geometry?.coordinates || [];
      const lon = Number(c[0]), lat = Number(c[1]), depth = Number(c[2]), mag = Number(p.mag);
      if (![lon, lat, depth, mag].every(Number.isFinite)) continue;
      const km = distanceKm(lon, lat);
      if (!(mag >= 4.5 || (km <= 1000 && mag >= 3))) continue;
      const key = 'usgs:' + q.id;
      await this.notify({
        key, channelId: 'sismos-live', lat, lon,
        title: '🚨 SISMO M' + mag.toFixed(1) + ' · ' + (p.place || 'Ubicación no informada'),
        body: 'Profundidad: ' + depth.toFixed(1) + ' km · ' + new Date(p.time).toLocaleString() + (km <= 1000 ? ' · A ' + Math.round(km) + ' km de Candelaria' : ''),
        metadata: { kind: 'earthquake', magnitude: mag, place: p.place || 'Sismo', depthKm: depth }
      });
    }
  }

  async checkNasaEvents() {
    const data = await this.fetchJson(SOURCES.eonet);
    const accepted = new Set(['severeStorms', 'wildfires', 'volcanoes', 'floods']);
    for (const event of data.events || []) {
      const categories = (event.categories || []).map(c => c.id || c.title);
      if (!categories.some(c => accepted.has(c))) continue;
      const point = eventCoordinates(event);
      const coords = point && Number.isFinite(point.lat) && Number.isFinite(point.lon) ? point : { lat: 0, lon: 0 };
      const category = (event.categories || []).map(c => c.title || c.id).join(', ') || 'Evento natural';
      await this.notify({
        key: 'eonet:' + event.id, channelId: 'desastres-live',
        title: '🌍 ' + (event.title || 'Evento natural detectado'),
        body: category + (event.description ? ' · ' + event.description : '') + (point ? ' · ' + point.lat.toFixed(2) + ', ' + point.lon.toFixed(2) : ''),
        lat: coords.lat, lon: coords.lon,
        metadata: { kind: 'natural-event', eventId: event.id, category }
      });
    }
  }

  async checkStorms() {
    const data = await this.fetchJson(SOURCES.storms);
    const storms = data.activeStorms || data.active_storms || [];
    for (const storm of storms) {
      const id = storm.id || storm.atcf || storm.name;
      const name = storm.name || storm.id || 'Tormenta activa';
      const lat = Number(storm.latitude ?? storm.lat), lon = Number(storm.longitude ?? storm.lon);
      await this.notify({
        key: 'noaa:' + id, channelId: 'desastres-live',
        title: '🌀 NOAA · ' + name,
        body: 'Sistema tropical activo. Consultá el parte oficial del NHC para trayectoria e intensidad.',
        lat: Number.isFinite(lat) ? lat : 0, lon: Number.isFinite(lon) ? lon : 0,
        metadata: { kind: 'tropical-storm', eventId: String(id), source: 'NOAA NHC' }
      });
    }
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    for (const listener of this.listeners) listener.remove();
    this.listeners = [];
  }
}
