const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const first = (...values) => values.find(value => value !== undefined && value !== null && value !== '');
function normalizeCamera(row, index) {
  const p = row?.properties || row || {};
  const coords = row?.geometry?.coordinates;
  const lat = Number(first(p.lat, p.latitude, p.y, coords?.[1]));
  const lon = Number(first(p.lon, p.lng, p.longitude, p.x, coords?.[0]));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const page = first(p.page_url, p.source_url, p.website, p.url, row?.url);
  const stream = first(p.stream_url, p.hls_url, p.mjpeg_url, p.video_url, p.feed_url);
  const image = first(p.image_url, p.snapshot_url, p.frame_url, p.thumbnail, p.image);
  return {
    id: String(first(p.id, p.camera_id, row?.id, 'public-camera-' + index)),
    name: String(first(p.name, p.title, p.label, p.description, 'Cámara pública')),
    location: String(first(p.location, p.city, p.place, p.address, p.region, 'Ubicación no especificada')),
    country: String(first(p.country, p.country_name, p.country_code, '')),
    category: String(first(p.category, p.kind, p.type, p.camera_type, 'Pública')),
    provider: String(first(p.source_name, p.source, p.operator, p.provider, 'Operador público')),
    lat, lon,
    pageUrl: safeUrl(page),
    streamUrl: safeUrl(stream),
    imageUrl: safeUrl(image),
    active: p.active !== false && p.is_active !== false && p.status !== 'inactive'
  };
}
function safeUrl(value) {
  if (!value) return '';
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function cameraCenter(viewer) {
  const canvas = viewer.scene.canvas;
  const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
  const point = viewer.camera.pickEllipsoid(center, viewer.scene.globe.ellipsoid) || Cesium.Cartesian3.fromDegrees(-58.98, -27.46);
  const geo = Cesium.Cartographic.fromCartesian(point);
  return { lat: Cesium.Math.toDegrees(geo.latitude), lon: Cesium.Math.toDegrees(geo.longitude) };
}
export function initCameraLayer(viewer, onStatus = () => {}, onHint = () => {}) {
  const entities = new Map();
  const list = document.getElementById('camera-list');
  const tools = document.getElementById('camera-tools');
  const detail = document.getElementById('camera-viewer');
  const close = document.getElementById('close-camera');
  const title = document.getElementById('camera-viewer-title');
  const meta = document.getElementById('camera-viewer-meta');
  const media = document.getElementById('camera-media');
  const sourceLink = document.getElementById('camera-source-link');
  let enabled = false;
  let busy = false;
  let lastFetch = 0;
  let selected = null;
  function closeViewer() {
    detail.hidden = true;
    media.innerHTML = '';
    selected = null;
  }
  close?.addEventListener('click', closeViewer);
  function showCamera(camera) {
    selected = camera;
    title.textContent = camera.name;
    meta.textContent = [camera.location, camera.country, camera.category, camera.provider].filter(Boolean).join(' · ');
    sourceLink.href = camera.pageUrl || camera.streamUrl || camera.imageUrl || 'https://opencctv.org/open-cameras';
    sourceLink.hidden = !(camera.pageUrl || camera.streamUrl || camera.imageUrl);
    media.innerHTML = '';
    if (camera.streamUrl && /\.m3u8($|\?)/i.test(camera.streamUrl)) {
      const video = document.createElement('video');
      video.controls = true; video.autoplay = true; video.playsInline = true;
      video.className = 'camera-video';
      media.appendChild(video);
      if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
        hls.loadSource(camera.streamUrl); hls.attachMedia(video);
        video.addEventListener('emptied', () => hls.destroy(), { once: true });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = camera.streamUrl;
      else media.textContent = 'Este dispositivo no puede reproducir este formato. Abrí la señal en el sitio del proveedor.';
    } else if (camera.streamUrl && /youtube\.com|youtu\.be/i.test(camera.streamUrl)) {
      const match = camera.streamUrl.match(/(?:youtu\.be\/|v=|embed\/|live\/)([\w-]{6,})/);
      if (match) {
        const frame = document.createElement('iframe');
        frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(match[1]);
        frame.allow = 'autoplay; encrypted-media; picture-in-picture'; frame.allowFullscreen = true;
        frame.className = 'camera-frame'; media.appendChild(frame);
      }
    } else if (camera.imageUrl) {
      const image = document.createElement('img');
      image.src = camera.imageUrl; image.alt = camera.name; image.className = 'camera-frame-image';
      image.referrerPolicy = 'no-referrer'; media.appendChild(image);
    } else {
      media.textContent = 'La ficha está disponible, pero el proveedor no publica un reproductor compatible. Usá el enlace de la fuente para abrir la cámara.';
    }
    detail.hidden = false;
  }
  function render() {
    const cameras = Array.from(entities.values()).sort((a,b) => a.name.localeCompare(b.name));
    if (!cameras.length) {
      list.innerHTML = '<span class="muted">No hay cámaras publicadas en esta zona. Mové el globo y actualizá.</span>';
      return;
    }
    list.innerHTML = cameras.slice(0, 80).map(camera =>
      '<button class="camera-row" data-camera="' + esc(camera.id) + '"><span class="camera-dot"></span><span><b>' +
      esc(camera.name) + '</b><small>' + esc([camera.location, camera.category].filter(Boolean).join(' · ')) +
      '</small></span><i>›</i></button>'
    ).join('');
    list.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => {
      const camera = entities.get(button.dataset.camera);
      if (!camera) return;
      viewer.selectedEntity = camera.entity;
      viewer.flyTo(camera.entity, { duration: 1.1, offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 180000) });
      showCamera(camera);
    }));
  }
  async function refresh(force = false) {
    if (!enabled || busy || (!force && Date.now() - lastFetch < 60000)) return;
    busy = true; onStatus('Buscando cámaras públicas…');
    try {
      const center = cameraCenter(viewer);
      const response = await fetch('/api/cameras?lat=' + encodeURIComponent(center.lat) + '&lon=' + encodeURIComponent(center.lon) + '&radius=1200', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error del directorio');
      const incoming = (data.cameras || []).map(normalizeCamera).filter(camera => camera && camera.active);
      const visibleIds = new Set(incoming.map(camera => camera.id));
      incoming.forEach(camera => {
        let item = entities.get(camera.id);
        const position = Cesium.Cartesian3.fromDegrees(camera.lon, camera.lat, 0);
        if (!item) {
          const entity = viewer.entities.add({
            name: camera.name, position,
            point: { pixelSize: 9, color: Cesium.Color.fromCssColorString('#43e6a8'), outlineColor: Cesium.Color.WHITE, outlineWidth: 1.5, disableDepthTestDistance: 1e7 },
            label: { text: 'CAM', font: 'bold 9px sans-serif', fillColor: Cesium.Color.fromCssColorString('#9dffd8'), outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -13), scaleByDistance: new Cesium.NearFarScalar(1e5, 1, 5e6, .4), disableDepthTestDistance: 1e7 },
            description: '<b>' + esc(camera.name) + '</b><br>' + esc(camera.location) + '<br>Fuente: ' + esc(camera.provider)
          });
          item = { ...camera, entity };
          entities.set(camera.id, item);
        } else {
          Object.assign(item, camera); item.entity.position = position; item.entity.show = true;
        }
      });
      for (const [id, item] of entities) if (!visibleIds.has(id)) { viewer.entities.remove(item.entity); entities.delete(id); }
      lastFetch = Date.now(); render();
      onStatus(incoming.length + ' cámaras públicas en la zona');
      onHint('Cámaras publicadas por sus operadores. Algunas son video en vivo y otras imágenes que se actualizan periódicamente.');
    } catch (error) {
      onStatus('No se pudieron cargar cámaras');
      list.innerHTML = '<span class="muted">' + esc(error.message) + '</span>';
    } finally { busy = false; }
  }
  function setEnabled(value) {
    enabled = value; tools.hidden = !value;
    if (value) refresh(true);
    else { for (const item of entities.values()) item.entity.show = false; closeViewer(); }
    if (value) for (const item of entities.values()) item.entity.show = true;
    onStatus(value ? 'Activando directorio público…' : 'Desactivadas');
  }
  document.getElementById('refresh-cameras')?.addEventListener('click', () => refresh(true));
  viewer.camera.moveEnd.addEventListener(() => { if (enabled) refresh(false); });
  return { setEnabled, refresh };
}
