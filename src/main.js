import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from 'satellite.js';
import { CameraLayer } from './layers/CameraLayer.js';
import { SatelliteLayer } from './layers/SatelliteLayer.js';
import { FlightLayer } from './layers/FlightLayer.js';
import { ShipLayer } from './layers/ShipLayer.js';
import { EarthquakeLayer } from './layers/EarthquakeLayer.js';
import { WeatherLayer } from './layers/WeatherLayer.js';
import { FireLayer } from './layers/FireLayer.js';
import { DisasterWatcher } from './services/DisasterWatcher.js';

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
const disasterWatcher = new DisasterWatcher({
  onAlert: (alert) => {
    hint.textContent = alert.title + ' · ' + alert.body;
    hint.classList.add('alert-pulse');
    window.setTimeout(() => hint.classList.remove('alert-pulse'), 5000);
  },
  onStatus: (state) => {
    const el = $('disaster-status');
    if (el) el.textContent = state.active ? 'VIGILANCIA ACTIVA · ' + (state.checkedAt ? new Date(state.checkedAt).toLocaleTimeString() : 'iniciando') : 'INACTIVA';
  },
  onNavigate: ({ lat, lon }) => viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, 500000),
    duration: 2
  })
});
disasterWatcher.start().catch(error => console.warn('Disaster watcher:', error));

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
viewer.scene.screenSpaceCameraController.zoomFactor = 3.0;
viewer.scene.screenSpaceCameraController.inertiaZoom = 0.82;
viewer.scene.screenSpaceCameraController.inertiaSpin = 0.88;
viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.88;
viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(-35, 18, 24500000),
  orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 }
});

const haarp = viewer.entities.add({
  name: 'HAARP · Gakona, Alaska',
  position: Cesium.Cartesian3.fromDegrees(-145.15, 62.39, 0),
  point: { pixelSize: 11, color: Cesium.Color.ORANGE, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
  label: { text: 'HAARP · ALASKA', font: '12px sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -20), scaleByDistance: new Cesium.NearFarScalar(1e5, 1, 1e7, .45) },
  description: 'Instalación terrestre de investigación de la ionosfera en Gakona, Alaska. No es un satélite.',
  show: false
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
let issVisible = false;
let haarpVisible = false;
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
// Keep entity selection and coordinate inspection in the same handler.
 // Replacing Cesium's default LEFT_CLICK action without picking entities prevents
 // camera markers from reaching selectedEntityChanged (and opening the camera viewer).
viewer.screenSpaceEventHandler.setInputAction((event) => {
  const picked = viewer.scene.pick(event.position);
  const entity = Cesium.defined(picked) && picked.id && typeof picked.id === 'object' && 'id' in picked.id
    ? picked.id
    : undefined;
  viewer.selectedEntity = entity;

  if (entity) return;
  const cartesian = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
  if (!cartesian) return;
  const c = Cesium.Cartographic.fromCartesian(cartesian);
  $('coords').textContent = Cesium.Math.toDegrees(c.latitude).toFixed(2) + '°, ' + Cesium.Math.toDegrees(c.longitude).toFixed(2) + '°';
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

const layerButtons = [...document.querySelectorAll('[data-layer]')];

function updateLayerButtonStates(selected) {
  for (const button of layerButtons) {
    const active = button.dataset.layer === selected;
    button.classList.toggle('active', active);
    const indicator = button.querySelector('em');
    if (indicator) indicator.textContent = active ? 'ON' : 'OFF';
  }
}

async function hideAllLayers() {
  flightsVisible = false; flightLayer.setVisible(false);
  shipsVisible = false; shipLayer.setVisible(false);
  camerasVisible = false; cameraLayer.setVisible(false);
  weatherVisible = false; weatherLayer.setVisible(false);
  earthquakesVisible = false; earthquakeLayer.setVisible(false);
  firesVisible = false; fireLayer.setVisible(false);
  issVisible = false; if (issEntity) issEntity.show = false;
  starlinkVisible = false; await starlinkLayer.setVisible(false);
  haarpVisible = false; haarp.show = false;
}

layerButtons.forEach(button => {
  button.addEventListener('click', async () => {
    const layer = button.dataset.layer;
    const alreadyActive = button.classList.contains('active');
    await hideAllLayers();
    if (alreadyActive) {
      updateLayerButtonStates(null);
      hint.textContent = 'Todas las capas están ocultas. Elegí una categoría para explorar el globo.';
      return;
    }

    if (layer === 'satellites') {
      issVisible = true;
      if (!lastTle) await loadISS();
      updateISS();
      if (issEntity) issEntity.show = true;
      starlinkVisible = true;
      await starlinkLayer.setVisible(true);
      hint.textContent = 'Satélites: ISS y objetos de la constelación Starlink calculados con elementos orbitales públicos. La cobertura depende del catálogo disponible.';
    } else if (layer === 'haarp') {
      haarpVisible = true; haarp.show = true;
      hint.textContent = 'Ubicación de HAARP en Alaska. Es una instalación terrestre, no un satélite.';
    } else if (layer === 'cameras') {
      camerasVisible = true; cameraLayer.setVisible(true);
      if (cameraLayer.entities.size === 0) await cameraLayer.refresh();
      hint.textContent = 'Cámaras públicas: acercá el globo y tocá un marcador para consultar la imagen o abrir la fuente oficial cuando esté disponible.';
    } else if (layer === 'flights') {
      flightsVisible = true; flightLayer.setVisible(true);
      hint.textContent = 'Vuelos ADS-B en vivo. La cobertura y los datos dependen de los receptores disponibles; mové o acercá el globo para consultar otra región.';
    } else if (layer === 'ships') {
      shipsVisible = true; shipLayer.setVisible(true);
      hint.textContent = 'Buques AIS. Se muestran los datos recibidos por el proxy seguro configurado para GODS EYE.';
    } else if (layer === 'earthquakes') {
      earthquakesVisible = true; earthquakeLayer.setVisible(true);
      hint.textContent = 'Sismos mundiales registrados por USGS durante las últimas 24 horas.';
    } else if (layer === 'weather') {
      weatherVisible = true; weatherLayer.setVisible(true);
      hint.textContent = 'Meteorología en el punto central del globo. Mové el mapa para consultar otra ubicación.';
    } else if (layer === 'fires') {
      firesVisible = true; fireLayer.setVisible(true);
      hint.textContent = 'Detecciones térmicas VIIRS de NASA FIRMS. Son observaciones satelitales de calor, no confirmaciones automáticas de incendio.';
    }
    updateLayerButtonStates(layer);
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
  cameraRefreshTimer = setTimeout(() => cameraLayer.refresh(), 5000);
});
window.addEventListener('beforeunload', () => { disasterWatcher.stop(); cameraLayer.destroy(); starlinkLayer.destroy(); flightLayer.destroy(); shipLayer.destroy(); earthquakeLayer.destroy(); weatherLayer.destroy(); fireLayer.destroy(); });
