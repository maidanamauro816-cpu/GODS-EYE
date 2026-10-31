export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=90, stale-while-revalidate=300');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radius = Math.min(2500, Math.max(50, Number(req.query.radius) || 1200));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Coordenadas inválidas', expected: { lat: '-90..90', lon: '-180..180' } });
  }
  const latDelta = radius / 111;
  const lonDelta = Math.min(180, radius / Math.max(10, 111 * Math.cos(lat * Math.PI / 180)));
  const west = Math.max(-180, lon - lonDelta);
  const east = Math.min(180, lon + lonDelta);
  const south = Math.max(-90, lat - latDelta);
  const north = Math.min(90, lat + latDelta);
  const bbox = [west, south, east, north].map(n => n.toFixed(4)).join(',');
  const url = 'https://opencctv.org/api/cameras?bbox=' + encodeURIComponent(bbox) + '&limit=500';
  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': "GodsEye/1.0 public-camera-map" },
      signal: AbortSignal.timeout(12000)
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: 'El directorio público de cámaras no respondió', upstreamStatus: upstream.status, cameras: [] });
    }
    const data = await upstream.json();
    const rows = Array.isArray(data) ? data : (data.cameras || data.items || data.results || data.features || data.data || []);
    return res.status(200).json({
      provider: 'OpenCCTV public camera directory',
      attribution: 'Cámaras publicadas por operadores públicos. Directorio: opencctv.org',
      count: rows.length,
      cameras: rows.slice(0, 500)
    });
  } catch (error) {
    return res.status(502).json({ error: 'No se pudo consultar el directorio público de cámaras', cameras: [] });
  }
}