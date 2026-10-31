const SOURCES = [
  {
    id: "fintraffic",
    name: "Fintraffic · Finlandia",
    url: "https://tie.digitraffic.fi/api/weathercam/v1/stations",
    map: (data) => (data.features || []).flatMap((feature) => {
      const p = feature.properties || {};
      const c = feature.geometry?.coordinates || [];
      const id = p.id || feature.id;
      return (p.presets || []).map((preset) => ({
        id: "fi-" + id + "-" + (preset.id || preset.presentationName || "view"),
        name: p.name || "Cámara de carretera",
        country: "Finlandia",
        lat: Number(c[1]), lon: Number(c[0]),
        image: preset.id ? "https://weathercam.digitraffic.fi/" + preset.id + ".jpg" : "",
        source: "https://www.digitraffic.fi/en/road-traffic/",
        provider: "Fintraffic",
        kind: "snapshot"
      }));
    })
  },
  {
    id: "tfl",
    name: "Transport for London · Reino Unido",
    url: "https://api.tfl.gov.uk/Place/Type/JamCam",
    map: (data) => (Array.isArray(data) ? data : []).map((p) => ({
      id: "tfl-" + p.id, name: p.commonName || "London traffic camera",
      country: "Reino Unido", lat: Number(p.lat), lon: Number(p.lon),
      image: p.additionalProperties?.find((x) => x.key === "imageUrl")?.value || "",
      source: "https://tfl.gov.uk", provider: "TfL", kind: "snapshot"
    }))
  },
  {
    id: "ontario",
    name: "Ontario 511 · Canadá",
    url: "https://511on.ca/api/v2/get/cameras?format=json",
    map: (data) => (Array.isArray(data) ? data : data.cameras || []).map((p) => ({
      id: "on-" + (p.Id || p.id), name: p.Location || p.Name || "Ontario traffic camera",
      country: "Canadá", lat: Number(p.Latitude ?? p.Lat), lon: Number(p.Longitude ?? p.Lon),
      image: p.Views?.[0]?.Url || p.Url || p.ImageUrl || "",
      source: "https://511on.ca/", provider: "Ontario 511", kind: "snapshot"
    }))
  },
  {
    id: "alberta",
    name: "Alberta 511 · Canadá",
    url: "https://511.alberta.ca/api/v2/get/cameras?format=json",
    map: (data) => (Array.isArray(data) ? data : data.cameras || []).map((p) => ({
      id: "ab-" + (p.Id || p.id), name: p.Location || p.Name || "Alberta traffic camera",
      country: "Canadá", lat: Number(p.Latitude ?? p.Lat), lon: Number(p.Longitude ?? p.Lon),
      image: p.Views?.[0]?.Url || p.Url || p.ImageUrl || "",
      source: "https://511.alberta.ca/", provider: "Alberta 511", kind: "snapshot"
    }))
  },
  {
    id: "singapore",
    name: "LTA · Singapur",
    url: "https://api.data.gov.sg/v1/transport/traffic-images",
    map: (data) => (data.items || []).flatMap((item) => item.cameras || []).map((p) => ({
      id: "sg-" + p.camera_id, name: "Traffic camera " + p.camera_id,
      country: "Singapur", lat: Number(p.location?.latitude), lon: Number(p.location?.longitude),
      image: p.image, source: "https://data.gov.sg/", provider: "LTA", kind: "snapshot"
    }))
  },
  {
    id: "geonet",
    name: "GeoNet · Nueva Zelanda",
    url: "https://images.geonet.org.nz/volcano/cameras/all.json",
    map: (data) => (Array.isArray(data) ? data : data.cameras || []).map((p) => ({
      id: "nz-" + (p.id || p.name), name: p.name || "Volcano camera",
      country: "Nueva Zelanda", lat: Number(p.latitude ?? p.lat), lon: Number(p.longitude ?? p.lon),
      image: p.image || p.url || "", source: "https://www.geonet.org.nz/", provider: "GeoNet", kind: "snapshot"
    }))
  }
];

const valid = (c) => c.id && c.name && Number.isFinite(c.lat) && Number.isFinite(c.lon)
  && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180;

export async function loadPublicCameras({ signal } = {}) {
  const results = await Promise.allSettled(SOURCES.map(async (source) => {
    const response = await fetch(source.url, {
      signal, headers: { Accept: "application/json" }, cache: "no-store"
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    return { source, cameras: source.map(data).filter(valid) };
  }));
  const cameras = [];
  const sources = [];
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    const source = SOURCES[i];
    if (result.status === "fulfilled") {
      cameras.push(...result.value.cameras);
      sources.push({ id: source.id, name: source.name, status: "online", count: result.value.cameras.length });
    } else {
      sources.push({ id: source.id, name: source.name, status: "unavailable", count: 0, error: result.reason?.message || "No disponible" });
    }
  }
  return { cameras, sources, updatedAt: new Date().toISOString() };
}
