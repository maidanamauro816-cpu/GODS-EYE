import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from 'satellite.js';

const $ = (id) => document.getElementById(id);
const hint = $('hint');
const status = $('sat-status');
const flightStatus = $('flight-status');
const flightTools = $('flight-tools');
const flightList = $('flight-list');
const aircraftDetail = $('aircraft-detail');
const aircraftDetailContent = $('aircraft-detail-content');

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
let flightsEnabled = false;
let flightBusy = false;
let lastFlightQuery = 0;
const aircraft = new Map();
const FLIGHT_REFRESH_MS = 12000;
const MAX_TRAIL_POINTS = 45;
const metadataCache = new Map();
let selectedAircraftId = null;

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
  } catch (error) {
    status.textContent = 'Sin conexión a CelesTrak';
  }
}
function updateISS() {
  if (!lastTle) return;
  try {
    const now = new Date();
    const pv = propagate(lastTle, now);
    if (!pv.position || typeof pv.position === 'boolean') return;
    const geo = eciToGeodetic(pv.position, gstime(now));
    const pos = Cesium.Cartesian3.fromDegrees(degreesLong(geo.longitude), degreesLat(geo.latitude), geo.height * 1000);
    if (!issEntity) {
      issEntity = viewer.entities.add({
        name: 'ISS · Estación Espacial Internacional', position: pos,
        point: { pixelSize: 10, color: Cesium.Color.LIME, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
        label: { text: 'ISS', font: 'bold 13px sans-serif', fillColor: Cesium.Color.LIME, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -18) },
        description: 'Posición estimada a partir de elementos orbitales TLE públicos de CelesTrak.'
      });
    } else issEntity.position = pos;
    issEntity.show = issVisible;
  } catch (e) { console.warn('ISS position update failed', e); }
}

function getGlobeCenter() {
  const canvas = viewer.scene.canvas;
  const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
  let point = viewer.camera.pickEllipsoid(center, viewer.scene.globe.ellipsoid);
  if (!point) point = Cesium.Cartesian3.fromDegrees(-58.98, -27.46, 0);
  const geo = Cesium.Cartographic.fromCartesian(point);
  return { lat: Cesium.Math.toDegrees(geo.latitude), lon: Cesium.Math.toDegrees(geo.longitude) };
}
function safeText(value, fallback) {
  return String(value === undefined || value === null || value === '' ? fallback : value).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
}
function aircraftDescription(a) {
  const altitude = typeof a.alt_baro === 'number' ? Math.round(a.alt_baro).toLocaleString('es-AR') + ' ft' : String(a.alt_baro || 'No disponible');
  const speed = typeof a.gs === 'number' ? Math.round(a.gs) + ' kt' : 'No disponible';
  const track = typeof a.track === 'number' ? Math.round(a.track) + '°' : 'No disponible';
  return '<b>Vuelo:</b> ' + safeText((a.flight || '').trim(), 'Sin indicativo') +
    '<br><b>Aeronave:</b> ' + safeText(a.t, 'No identificada') +
    '<br><b>Matrícula:</b> ' + safeText(a.r, 'No disponible') +
    '<br><b>ICAO:</b> ' + safeText(a.hex, 'No disponible') +
    '<br><b>Altitud:</b> ' + altitude + '<br><b>Velocidad:</b> ' + speed +
    '<br><b>Rumbo:</b> ' + track +
    '<br><b>Posición:</b> ' + Number(a.lat).toFixed(4) + ', ' + Number(a.lon).toFixed(4) +
    '<br><small>Fuente: ADS-B.lol. La línea muestra el recorrido observado por GOD’S EYE desde que se detectó, no una ruta futura programada.</small>';
}
function upsertAircraft(a) {
  if (!a.hex || !Number.isFinite(a.lat) || !Number.isFinite(a.lon)) return;
  const id = String(a.hex);
  const pos = Cesium.Cartesian3.fromDegrees(a.lon, a.lat, Math.max(0, (Number(a.alt_baro) || 0) * 0.3048));
  let item = aircraft.get(id);
  if (!item) {
    const entity = viewer.entities.add({
      id: 'flight-' + id, name: (a.flight || id).trim() + ' · ' + id, position: pos,
      point: { pixelSize: 8, color: Cesium.Color.fromCssColorString('#45d7ff'), outlineColor: Cesium.Color.WHITE, outlineWidth: 1.5, disableDepthTestDistance: 1e7 },
      label: { text: (a.flight || id).trim(), font: 'bold 10px sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -14), scaleByDistance: new Cesium.NearFarScalar(1e5, 1, 1e7, .35), disableDepthTestDistance: 1e7 },
      description: aircraftDescription(a)
    });
    const trail = viewer.entities.add({
      name: 'Trayectoria observada · ' + id,
      polyline: { positions: [pos], width: 2, material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.12, color: Cesium.Color.fromCssColorString('#27cfff') }), clampToGround: false },
      show: true
    });
    item = { entity, trail, positions: [pos], lastLat: a.lat, lastLon: a.lon, lastSeen: Date.now(), data: a };
    aircraft.set(id, item);
  } else {
    const moved = Cesium.Cartesian3.distance(
      Cesium.Cartesian3.fromDegrees(item.lastLon, item.lastLat, 0),
      Cesium.Cartesian3.fromDegrees(a.lon, a.lat, 0)
    );
    if (moved > 250) {
      item.positions.push(pos);
      if (item.positions.length > MAX_TRAIL_POINTS) item.positions.shift();
      item.trail.polyline.positions = item.positions.slice();
      item.lastLat = a.lat;
      item.lastLon = a.lon;
    }
    item.entity.position = pos;
    item.entity.name = (a.flight || id).trim() + ' · ' + id;
    item.entity.description = aircraftDescription(a);
    item.lastSeen = Date.now();
    item.data = a;
  }
}
function renderFlightList() {
  const items = Array.from(aircraft.entries()).sort((x, y) => y[1].lastSeen - x[1].lastSeen);
  if (!items.length) {
    flightList.innerHTML = '<span class="muted">No se detectaron aeronaves en esta zona. Mové el globo y actualizá.</span>';
    return;
  }
  flightList.innerHTML = items.slice(0, 18).map(([id, item]) => {
    const a = item.data;
    const call = safeText((a.flight || '').trim(), id.toUpperCase());
    const type = safeText(a.t, 'Aeronave');
    const alt = typeof a.alt_baro === 'number' ? Math.round(a.alt_baro / 100) / 10 + ' × 1.000 ft' : 'Alt. N/D';
    return '<button class="flight-row" data-flight="' + safeText(id, '') + '"><span class="flight-dot"></span><span class="flight-row-main"><b>' + call + '</b><small>' + type + ' · ' + alt + '</small></span><span class="flight-arrow">›</span></button>';
  }).join('');
  flightList.querySelectorAll('[data-flight]').forEach(button => button.addEventListener('click', () => selectFlight(button.dataset.flight)));
}
function detailRow(label, value) {
  const shown = value === undefined || value === null || value === '' ? 'No disponible' : String(value);
  return '<div class="detail-row"><span>' + safeText(label, '') + '</span><b>' + safeText(shown, 'No disponible') + '</b></div>';
}
function renderAircraftDetail(item, metadata, route, loading) {
  const a = item.data;
  const altitude = typeof a.alt_baro === 'number' ? Math.round(a.alt_baro).toLocaleString('es-AR') + ' ft' : a.alt_baro;
  const speed = typeof a.gs === 'number' ? Math.round(a.gs) + ' kt' : a.gs;
  const vertical = typeof a.baro_rate === 'number' ? Math.round(a.baro_rate) + ' ft/min' : a.baro_rate;
  const heading = typeof a.track === 'number' ? Math.round(a.track) + '°' : a.track;
  const squawk = a.squawk || a.sqk;
  const origin = route && route.origin ? (route.origin.name || route.origin.icao || '') + (route.origin.iata ? ' (' + route.origin.iata + ')' : '') : '';
  const destination = route && route.destination ? (route.destination.name || route.destination.icao || '') + (route.destination.iata ? ' (' + route.destination.iata + ')' : '') : '';
  const owner = metadata && (metadata.registered_owner || metadata.registeredOwners);
  const manufacturer = metadata && (metadata.manufacturer || metadata.Manufacturer);
  const model = metadata && (metadata.type || metadata.Type || a.t);
  const operator = metadata && (metadata.registered_owner || metadata.registeredOwners || metadata.operator_flag_code || metadata.OperatorFlagCode);
  aircraftDetailContent.innerHTML =
    '<div class="detail-flight-title">' + safeText((a.flight || '').trim(), 'SIN INDICATIVO') + '</div>' +
    '<div class="detail-subtitle">' + safeText(a.r || (metadata && metadata.registration), 'Matrícula no identificada') + ' · ' + safeText(a.hex, '') + '</div>' +
    '<div class="detail-section">IDENTIDAD Y OPERADOR</div>' +
    detailRow('Aerolínea / operador', operator) +
    detailRow('Fabricante', manufacturer) +
    detailRow('Modelo', model) +
    detailRow('Código de tipo ICAO', (metadata && metadata.icao_type_code) || a.t) +
    detailRow('Matrícula', a.r || (metadata && metadata.registration)) +
    detailRow('Propietario registrado', owner) +
    detailRow('Año de fabricación', metadata && (metadata.year || metadata.built)) +
    detailRow('País de registro', metadata && (metadata.country || metadata.country_code)) +
    '<div class="detail-section">VUELO EN TIEMPO REAL</div>' +
    detailRow('Altitud barométrica', altitude) +
    detailRow('Altitud geométrica', typeof a.alt_geom === 'number' ? Math.round(a.alt_geom) + ' ft' : a.alt_geom) +
    detailRow('Velocidad respecto al suelo', speed) +
    detailRow('Velocidad indicada', typeof a.ias === 'number' ? Math.round(a.ias) + ' kt' : a.ias) +
    detailRow('Velocidad verdadera', typeof a.tas === 'number' ? Math.round(a.tas) + ' kt' : a.tas) +
    detailRow('Velocidad vertical', vertical) +
    detailRow('Rumbo', heading) +
    detailRow('Código transpondedor (Squawk)', squawk) +
    detailRow('Categoría ADS-B', a.category) +
    detailRow('Estado', a.alt_baro === 'ground' ? 'En tierra' : 'En vuelo') +
    '<div class="detail-section">RUTA Y POSICIÓN</div>' +
    detailRow('Origen', origin) +
    detailRow('Destino', destination) +
    detailRow('Latitud', Number(a.lat).toFixed(5)) +
    detailRow('Longitud', Number(a.lon).toFixed(5)) +
    detailRow('Última señal', a.seen !== undefined ? Math.round(a.seen) + ' s atrás' : (a.now ? new Date(a.now).toLocaleTimeString('es-AR') : 'No disponible')) +
    detailRow('Calidad de señal', a.rssi !== undefined ? a.rssi + ' dBFS' : '') +
    (loading ? '<p class="detail-loading">Buscando ficha técnica y ruta en bases públicas…</p>' : '') +
    '<p class="detail-disclaimer">Datos ADS-B en vivo + base pública de identificación. La ruta comercial puede no estar publicada; la línea celeste del mapa es el recorrido observado por GOD’S EYE, no una predicción.</p>';
  aircraftDetail.hidden = false;
}
async function enrichAircraft(id, item) {
  if (metadataCache.has(id)) {
    const cached = metadataCache.get(id);
    renderAircraftDetail(item, cached.metadata, cached.route, false);
    return;
  }
  renderAircraftDetail(item, null, null, true);
  const callsign = (item.data.flight || '').trim();
  try {
    const query = '/api/aircraft?hex=' + encodeURIComponent(id) + (callsign ? '&callsign=' + encodeURIComponent(callsign) : '');
    const response = await fetch(query, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    metadataCache.set(id, { metadata: data.aircraft || null, route: data.route || null });
    if (selectedAircraftId === id && aircraft.has(id)) renderAircraftDetail(aircraft.get(id), data.aircraft || null, data.route || null, false);
  } catch (error) {
    if (selectedAircraftId === id) renderAircraftDetail(item, null, null, false);
    console.warn('Aircraft enrichment unavailable', error);
  }
}
function selectFlight(id) {
  const item = aircraft.get(id);
  if (!item) return;
  selectedAircraftId = id;
  viewer.selectedEntity = item.entity;
  viewer.flyTo(item.entity, { duration: 1.2, offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 450000) });
  renderAircraftDetail(item, null, null, true);
  enrichAircraft(id, item);
  hint.textContent = 'Ficha ampliada de ' + (item.data.flight || id).trim() + '. Se están consultando datos técnicos y ruta pública.';
}
async function loadFlights(force) {
  if (!flightsEnabled || flightBusy) return;
  if (!force && Date.now() - lastFlightQuery < FLIGHT_REFRESH_MS) return;
  flightBusy = true;
  flightStatus.textContent = 'Consultando ADS-B…';
  try {
    const center = getGlobeCenter();
    const url = '/api/adsb?lat=' + encodeURIComponent(center.lat.toFixed(4)) + '&lon=' + encodeURIComponent(center.lon.toFixed(4)) + '&dist=250';
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data.ac)) throw new Error(data.message || data.error || 'Respuesta ADS-B no válida');
    data.ac.forEach(upsertAircraft);
    lastFlightQuery = Date.now();
    renderFlightList();
    flightStatus.textContent = data.ac.length + ' aeronaves · actualizado';
    hint.textContent = 'ADS-B en vivo: ' + data.ac.length + ' aeronaves detectadas en el área consultada. Mové el globo para explorar otra región.';
    const now = Date.now();
    for (const [id, item] of aircraft) {
      if (now - item.lastSeen > 180000) {
        viewer.entities.remove(item.entity);
        viewer.entities.remove(item.trail);
        aircraft.delete(id);
      }
    }
    renderFlightList();
  } catch (error) {
    flightStatus.textContent = 'No se pudo actualizar';
    flightList.innerHTML = '<span class="muted">Error consultando vuelos: ' + safeText(error.message, 'desconocido') + '</span>';
    hint.textContent = 'No se pudo consultar ADS-B. Revisá la conexión e intentá actualizar nuevamente.';
  } finally { flightBusy = false; }
}
function setFlightsEnabled(enabled) {
  flightsEnabled = enabled;
  flightTools.hidden = !enabled;
  if (enabled) {
    loadFlights(true);
    hint.textContent = 'Buscando aeronaves reales cerca del centro del globo…';
  } else {
    flightStatus.textContent = 'Desactivados';
    for (const item of aircraft.values()) { item.entity.show = false; item.trail.show = false; }
  }
  if (enabled) for (const item of aircraft.values()) { item.entity.show = true; item.trail.show = true; }
}

$('coords').textContent = 'VISTA GLOBAL · TIERRA 3D';
viewer.screenSpaceEventHandler.setInputAction((event) => {
  const cartesian = viewer.camera.pickEllipsoid(event.position, viewer.scene.globe.ellipsoid);
  if (!cartesian) return;
  const c = Cesium.Cartographic.fromCartesian(cartesian);
  $('coords').textContent = Cesium.Math.toDegrees(c.latitude).toFixed(2) + '°, ' + Cesium.Math.toDegrees(c.longitude).toFixed(2) + '°';
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

document.querySelectorAll('[data-layer]').forEach(button => {
  button.addEventListener('click', () => {
    const layer = button.dataset.layer;
    let active = false;
    if (layer === 'iss') {
      issVisible = !issVisible;
      if (issEntity) issEntity.show = issVisible;
      active = issVisible;
    } else if (layer === 'haarp') {
      haarpVisible = !haarpVisible;
      haarp.show = haarpVisible;
      active = haarpVisible;
    } else if (layer === 'flights') {
      setFlightsEnabled(!flightsEnabled);
      active = flightsEnabled;
    } else {
      hint.textContent = 'La capa marítima requiere un proveedor AIS. No se mostrarán barcos inventados.';
    }
    button.classList.toggle('active', active);
    button.querySelector('em').textContent = active ? 'ON' : 'OFF';
  });
});
$('refresh-flights').addEventListener('click', () => loadFlights(true));
viewer.camera.moveEnd.addEventListener(() => {
  if (flightsEnabled) loadFlights(true);
});
loadISS().then(updateISS);
setInterval(updateISS, 2500);
setInterval(loadISS, 30 * 60 * 1000);
setInterval(() => loadFlights(false), FLIGHT_REFRESH_MS);
