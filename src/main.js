import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from 'satellite.js';
import { CameraLayer } from './layers/CameraLayer.js';

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

let issEntity = null;
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
    } else {
      hint.textContent = layer === 'flights'
        ? 'Vuelos: pendiente de conectar ADS-B.LOL con un proxy de consulta responsable.'
        : 'Tráfico marítimo: pendiente de proveedor AIS autorizado. No se muestran posiciones inventadas.';
    }
    const active = layer === 'iss' ? issVisible : layer === 'haarp' ? haarpVisible : layer === 'cameras' ? camerasVisible : false;
    button.classList.toggle('active', active);
    button.querySelector('em').textContent = active ? 'ON' : 'OFF';
  });
});

loadISS().then(updateISS);
setInterval(updateISS, 2500);
setInterval(loadISS, 30 * 60 * 1000);
setInterval(() => { if (camerasVisible) cameraLayer.refresh(); }, 5 * 60 * 1000);
window.addEventListener('beforeunload', () => cameraLayer.destroy());
