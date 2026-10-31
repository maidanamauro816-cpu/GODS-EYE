import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from 'satellite.js';
import { CameraLayer } from './layers/CameraLayer.js';
import { SatelliteLayer } from './layers/SatelliteLayer.js';
import { FlightLayer } from './layers/FlightLayer.js';
import { ShipLayer } from './layers/ShipLayer.js';
import { EarthquakeLayer } from './layers/EarthquakeLayer.js';
import { WeatherLayer } from './layers/WeatherLayer.js';
import { FireLayer } from './layers/FireLayer.js';

const $ = (id) => document.getElementById(id);
const hint = $('hint');
const status = $('sat-status');

if (!window.Cesium) {
  hint.textContent = 'No se pudo cargar CesiumJS. Revisá la conexión a internet y reiniciá la app.';
  throw new Error('CesiumJS CDN unavailable');
}

const viewer = new Cesium.Viewer('globe', {
  animation: false, timeline: false, geocoder: false, homeButton: false,
  sceneModePicker: false, baseLayerPicker: false, navigationHelpButton: false,
  fullscreenButton: false, infoBox: true, selectionIndicator: true,
  shouldAnimate: true, imageryProvider: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider()
});
viewer.imageryLayers.removeAll();
viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  credit: '© OpenStreetMap contributors', maximumLevel: 19
}));
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.showGroundAtmosphere = true;
viewer.scene.skyAtmosphere.show = true;
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 900;
viewer.scene.screenSpaceCameraController.maximumZoomDistance = 45000000;
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(-35, 18, 24500000),
  orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 }
});

const haarp = viewer.entities.add({
  name: 'HAARP · Gakona, Alaska',
  position: Cesium.Cartesian3.fromDegrees(-145.15, 62.39, 0),
  point: { pixelSize: 11, color: Cesium.Color.ORANGE, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
  label: { text: 'HAARP · ALASKA', font: '12px sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -20), scaleByDistance: new Cesium.NearFarScalar(1e5, 1, 1e7, .45) },
  description: 'Instalación terrestre de investigación de la ionosfera en Gakona, Alaska. No es un satélite.'
});

let flightsVisible = false;
let shipsVisible = false;
let earthquakesVisible = false;
let weatherVisible = false;
let firesVisible = false;
const flightLayer = new FlightLayer(viewer, state => {
  const el = $('flights-status');
  if (el) el.textContent = state.loading ? 'Consultando ADS-B…' : state.error ? state.error : state.count + ' aeronaves · ' + (state.coverage || 'ADS-B') + (state.worldStale ? ' · datos globales atrasados' : '');
});
const shipLayer = new ShipLayer(viewer, state => {
  const el = $('ships-status');
  if (el) el.textContent = state.loading ? 'Conectando AIS…' : state.error ? state.error : state.count + ' buques · ' + (state.coverage || 'AIS');
});
const earthquakeLayer = new EarthquakeLayer(viewer, state => {
  const el = $('earthquakes-status');
  if (el) el.textContent = state.loading ? 'Consultando USGS…' : state.error ? state.error : state.count + ' sismos · últimas 24 h';
});
const weatherLayer = new WeatherLayer(viewer, state => {
  const el = $('weather-status');
  if (el) el.textContent = state.loading ? 'Consultando Open-Meteo…' : state.error ? state.error : state.temperature + ' °C · ' + (state.summary || 'clima actual');
});
const fireLayer = new FireLayer(viewer, state => {
  const el = $('fires-status');
  if (el) el.textContent = state.loading ? 'Consultando NASA FIRMS…' : state.error ? state.error : state.count + ' detecciones VIIRS · 24 h';
});
let issEntity = null;
let starlinkVisible = false;
const starlinkLayer = new SatelliteLayer(viewer, (state) => {
  const el = $('starlink-status');
  if (el) el.textContent = state.loading ? 'Descargando TLE de CelesTrak…' : state.error ? state.error : state.count + ' objetos orbitales · CelesTrak';
});
let issVisible = true;
let haarpVisible = true;
let lastTle = null;
let camerasVisible = false;
const cameraLayer = new CameraLayer(viewer, (state) => {
  const cameraStatus = $('camera-status');
  if (!cameraStatus) return;
  if (state.loading) cameraStatus.textContent = 'Consultando fuentes públicas…';
  else if (state.error) cameraStatus.textContent = 'Error: ' + state.error;
  else {
    const active = state.sources.filter((s) => s.status === 'online');
    const failed = state.sources.filter((s) => s.status !== 'online');
    cameraStatus.textContent = state.count + ' cámaras · ' + active.length + '/' + state.sources.length + ' fuentes activas';
    const details = active.map((s) => s.name + ': ' + s.count).concat(failed.map((s) => s.name + ': no disponible'));
    cameraStatus.title = details.join('\n');
  }
});

async function loadISS() {
  try {
    const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const lines = (await response.text()).trim().split(/\r?\n/);
    const one = lines.find(x => x.startsWith('1 '));
    const two = lines.find(x => x.startsWith('2 '));
    if (!one || !two) throw new Error('TLE no disponible');
    lastTle = twoline2satrec(one, two);
    status.textContent = 'ISS · datos orbitales recibidos';
    hint.textContent = 'ISS: posición orbital calculada con elementos TLE públicos. Los datos pueden tener retraso.';
  } catch (error) {
    status.textContent = 'Sin conexión a CelesTrak';
    hint.textContent = 'El globo funciona; la órbita ISS necesita conexión con CelesTrak. ' + error.message;
  }
}

function updateISS() {
  if (!lastTle) return;
  try {
    const now = new Date();
    const pv = propagate(lastTle, now);
    if (!pv.position || typeof pv.position === 'boolean') return;
    const gmst = gstime(now);
    const geo = eciToGeodetic(pv.position, gmst);
    const lon = degreesLong(geo.longitude);
    const lat = degreesLat(geo.latitude);
    const alt = geo.height * 1000;
    const pos = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
    if (!issEntity) {
      issEntity = viewer.entities.add({
        name: 'ISS · Estación Espacial Internacional', position: pos,
        point: { pixelSize: 10, color: Cesium.Color.LIME, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
        label: { text: 'ISS', font: 'bold 13px sans-serif', fillColor: Cesium.Color.LIME, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -18) },
        description: 'Posición estimada a partir de elementos orbitales TLE públicos de CelesTrak.'
      });
    } else issEntity.position = pos;
  } catch (e) { console.warn('ISS position update failed', e); }
}

$('coords').textContent = 'VISTA GLOBAL · TIERRA 3D';
viewer.screenSpaceEventHandler.setInputAction((event) => {
  const cartesian = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
  if (!cartesian) return;
  const c = Cesium.Cartographic.fromCartesian(cartesian);
  $('coords').textContent = Cesium.Math.toDegrees(c.latitude).toFixed(2) + '°, ' + Cesium.Math.toDegrees(c.longitude).toFixed(2) + '°';
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

document.querySelectorAll('[data-layer]').forEach(button => {
  button.addEventListener('click', async () => {
    const layer = button.dataset.layer;
    if (layer === 'iss') {
      issVisible = !issVisible;
      if (issEntity) issEntity.show = issVisible;
    } else if (layer === 'starlink') {
      starlinkVisible = !starlinkVisible;
      await starlinkLayer.setVisible(starlinkVisible);
    } else if (layer === 'haarp') {
      haarpVisible = !haarpVisible;
      haarp.show = haarpVisible;
    } else if (layer === 'cameras') {
      camerasVisible = !camerasVisible;
      cameraLayer.setVisible(camerasVisible);
      if (camerasVisible && cameraLayer.entities.size === 0) await cameraLayer.refresh();
      hint.textContent = camerasVisible
        ? 'Cámaras públicas: tocá un marcador para ver la imagen disponible y abrir la fuente oficial.'
        : 'Capa de cámaras públicas oculta.';
    } else if (layer === 'flights') {
      flightsVisible = !flightsVisible;
      flightLayer.setVisible(flightsVisible);
      hint.textContent = flightsVisible ? 'Vuelos ADS-B en vivo. La consulta cubre hasta 250 millas náuticas alrededor del centro del mapa; acercá y mové el globo para explorar otras regiones.' : 'Capa de vuelos oculta.';
    } else if (layer === 'ships') {
      shipsVisible = !shipsVisible;
      shipLayer.setVisible(shipsVisible);
      hint.textContent = shipsVisible ? 'Buques AIS en directo para la región visible. Requiere el proxy seguro de GOD’S EYE configurado en Cloudflare.' : 'Capa de tráfico marítimo oculta.';
    } else if (layer === 'earthquakes') {
      earthquakesVisible = !earthquakesVisible;
      earthquakeLayer.setVisible(earthquakesVisible);
      hint.textContent = earthquakesVisible ? 'Sismos mundiales registrados por USGS durante las últimas 24 horas.' : 'Capa de terremotos oculta.';
    } else if (layer === 'weather') {
      weatherVisible = !weatherVisible;
      weatherLayer.setVisible(weatherVisible);
      hint.textContent = weatherVisible ? 'Clima actual en el punto central del globo. Mové el mapa para consultar otra ubicación.' : 'Capa meteorológica oculta.';
    } else if (layer === 'fires') {
      firesVisible = !firesVisible;
      fireLayer.setVisible(firesVisible);
      hint.textContent = firesVisible ? 'Detecciones térmicas VIIRS de NASA FIRMS. Son puntos satelitales de calor, no confirmaciones automáticas de incendio.' : 'Capa de incendios oculta.';
    }
    const active = layer === 'iss' ? issVisible : layer === 'starlink' ? starlinkVisible : layer === 'haarp' ? haarpVisible : layer === 'cameras' ? camerasVisible : layer === 'flights' ? flightsVisible : layer === 'ships' ? shipsVisible : layer === 'earthquakes' ? earthquakesVisible : layer === 'weather' ? weatherVisible : layer === 'fires' ? firesVisible : false;
    button.classList.toggle('active', active);
    button.querySelector('em').textContent = active ? 'ON' : 'OFF';
  });
});

loadISS().then(updateISS);
setInterval(updateISS, 2500);
setInterval(loadISS, 30 * 60 * 1000);
setInterval(() => { if (camerasVisible) cameraLayer.refresh(); }, 60 * 1000);
let flightRefreshTimer = null;
let weatherRefreshTimer = null;
viewer.camera.changed.addEventListener(() => {
  if (flightsVisible) {
    if (flightRefreshTimer) clearTimeout(flightRefreshTimer);
    flightRefreshTimer = setTimeout(() => flightLayer.refresh(), 1800);
  }
  if (weatherVisible) {
    if (weatherRefreshTimer) clearTimeout(weatherRefreshTimer);
    weatherRefreshTimer = setTimeout(() => weatherLayer.refresh(), 1800);
  }
});
let cameraRefreshTimer = null;
viewer.camera.changed.addEventListener(() => {
  if (!camerasVisible) return;
  if (cameraRefreshTimer) clearTimeout(cameraRefreshTimer);
  cameraRefreshTimer = setTimeout(() => cameraLayer.refresh(), 1500);
});
window.addEventListener('beforeunload', () => { cameraLayer.destroy(); starlinkLayer.destroy(); flightLayer.destroy(); shipLayer.destroy(); earthquakeLayer.destroy(); weatherLayer.destroy(); fireLayer.destroy(); });
