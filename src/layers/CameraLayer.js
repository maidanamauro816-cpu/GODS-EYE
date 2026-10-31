import { loadPublicCameras } from "../fetchers/cameras.js";

export class CameraLayer {
  constructor(viewer, onStatus = () => {}) {
    this.viewer = viewer;
    this.onStatus = onStatus;
    this.entities = new Map();
    this.sources = [];
    this.controller = null;
    this.visible = true;
  }

  async refresh() {
    this.controller?.abort();
    this.controller = new AbortController();
    this.onStatus({ loading: true, count: this.entities.size, sources: this.sources });
    try {
      const result = await loadPublicCameras({ signal: this.controller.signal });
      this.sources = result.sources;
      const incoming = new Set();
      for (const camera of result.cameras) {
        incoming.add(camera.id);
        const position = Cesium.Cartesian3.fromDegrees(camera.lon, camera.lat, 20);
        const description = [
          "<b>" + escapeHtml(camera.name) + "</b>",
          escapeHtml(camera.country || ""),
          "Proveedor: " + escapeHtml(camera.provider),
          "Tipo: imagen pública (no vídeo continuo)",
          '<a href="' + safeUrl(camera.source) + '" target="_blank" rel="noopener">Abrir fuente oficial</a>',
          camera.image ? '<br><img src="' + safeUrl(camera.image) + '" style="max-width:100%;max-height:220px" referrerpolicy="no-referrer">' : ""
        ].join("<br>");
        const existing = this.entities.get(camera.id);
        if (existing) {
          existing.position = position;
          existing.description = description;
          existing.show = this.visible;
        } else {
          const entity = this.viewer.entities.add({
            name: camera.name,
            position,
            point: { pixelSize: 7, color: Cesium.Color.fromCssColorString("#ff4545"), outlineColor: Cesium.Color.WHITE, outlineWidth: 1 },
            label: { text: "CAM", font: "9px sans-serif", fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -13), scaleByDistance: new Cesium.NearFarScalar(2e4, 1, 2e6, 0) },
            description
          });
          entity.show = this.visible;
          this.entities.set(camera.id, entity);
        }
      }
      for (const [id, entity] of this.entities) {
        if (!incoming.has(id)) {
          this.viewer.entities.remove(entity);
          this.entities.delete(id);
        }
      }
      this.onStatus({ loading: false, count: this.entities.size, sources: this.sources, updatedAt: result.updatedAt });
    } catch (error) {
      if (error.name !== "AbortError") this.onStatus({ loading: false, count: this.entities.size, sources: this.sources, error: error.message });
    }
  }

  setVisible(visible) {
    this.visible = visible;
    for (const entity of this.entities.values()) entity.show = visible;
  }

  destroy() {
    this.controller?.abort();
    for (const entity of this.entities.values()) this.viewer.entities.remove(entity);
    this.entities.clear();
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : "#"; }
  catch { return "#"; }
}
