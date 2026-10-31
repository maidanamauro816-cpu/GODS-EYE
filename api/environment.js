const USGS = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const GDACS = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO&fromdate=' + new Date(Date.now()-7*86400000).toISOString().slice(0,10) + '&todate=' + new Date().toISOString().slice(0,10);
const NWS = 'https://api.weather.gov/alerts/active';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=180');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const results = await Promise.allSettled([
    fetch(USGS, { headers: { Accept: 'application/geo+json' }, signal: AbortSignal.timeout(12000) }).then(r => { if (!r.ok) throw new Error('USGS ' + r.status); return r.json(); }),
    fetch(GDACS, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }).then(r => { if (!r.ok) throw new Error('GDACS ' + r.status); return r.json(); }),
    fetch(NWS, { headers: { Accept: 'application/geo+json', 'User-Agent': 'El-Ojo-de-Dios/1.0 contact: public-data-client' }, signal: AbortSignal.timeout(12000) }).then(r => { if (!r.ok) throw new Error('NWS ' + r.status); return r.json(); })
  ]);
  const earthquakes = results[0].status === 'fulfilled' ? (results[0].value.features || []).map(f => ({
    id: 'usgs-' + f.id, kind: 'earthquake', title: f.properties.title || 'Sismo detectado',
    magnitude: f.properties.mag, place: f.properties.place || 'Ubicación no disponible',
    time: f.properties.time, updated: f.properties.updated, url: f.properties.url,
    coordinates: f.geometry?.coordinates, source: 'USGS'
  })) : [];
  const gdacsData = results[1].status === 'fulfilled' ? results[1].value : null;
  const gdacsFeatures = gdacsData?.features || gdacsData?.data?.features || [];
  const disasters = gdacsFeatures.map((f, i) => {
    const p = f.properties || f;
    const c = f.geometry?.coordinates || p.coordinates || [];
    return { id: 'gdacs-' + (p.eventid || p.eventId || i), kind: String(p.eventtype || p.eventType || p.type || 'disaster').toLowerCase(),
      title: p.name || p.title || p.eventname || 'Evento GDACS', place: p.country || p.countryname || p.name || 'Región no disponible',
      level: p.alertlevel || p.alertLevel || p.alert || 'Sin nivel', time: p.fromdate || p.fromDate || p.date || null,
      url: p.url || p.link || 'https://www.gdacs.org/', coordinates: Array.isArray(c[0]) ? c[0] : c, source: 'GDACS' };
  }).filter(x => Array.isArray(x.coordinates) && x.coordinates.length >= 2);
  const weatherData = results[2].status === 'fulfilled' ? results[2].value : null;
  const weatherAlerts = (weatherData?.features || []).map(f => {
    const p = f.properties || {};
    const c = f.geometry?.coordinates?.[0]?.[0] || null;
    return { id: 'nws-' + (p.id || f.id), kind: 'weather-alert', title: p.event || 'Alerta meteorológica',
      place: p.areaDesc || 'Área no disponible', level: p.severity || p.urgency || 'Unknown',
      time: p.sent ? Date.parse(p.sent) : null, expires: p.expires ? Date.parse(p.expires) : null,
      description: p.headline || p.description || '', url: p.web || p['@id'], coordinates: c, source: 'NOAA/NWS' };
  });
  const errors = results.map((r, i) => r.status === 'rejected' ? ['USGS','GDACS','NOAA/NWS'][i] + ': ' + r.reason.message : null).filter(Boolean);
  return res.status(200).json({ generated: Date.now(), events: [...earthquakes, ...disasters, ...weatherAlerts], sources: { usgs: results[0].status === 'fulfilled', gdacs: results[1].status === 'fulfilled', nws: results[2].status === 'fulfilled' }, errors });
}
