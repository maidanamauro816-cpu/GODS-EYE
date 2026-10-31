const BASE = "https://hexdb.io/api/v2";
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const hex = String(req.query?.hex || "").trim().toLowerCase();
  const callsign = String(req.query?.callsign || "").trim().toUpperCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) return res.status(400).json({ error: "Invalid ICAO hex" });
  if (callsign && !/^[A-Z0-9-]{2,12}$/.test(callsign)) return res.status(400).json({ error: "Invalid callsign" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const requests = [
      fetch(`${BASE}/aircraft/${hex}`, { headers: { Accept: "application/json" }, signal: controller.signal })
    ];
    if (callsign) requests.push(fetch(`${BASE}/routes/${encodeURIComponent(callsign)}`, { headers: { Accept: "application/json" }, signal: controller.signal }));
    const results = await Promise.allSettled(requests);
    let aircraft = null;
    let route = null;
    if (results[0].status === "fulfilled" && results[0].value.ok) aircraft = await results[0].value.json();
    if (results[1]?.status === "fulfilled" && results[1].value.ok) route = await results[1].value.json();
    return res.status(200).json({ aircraft, route, source: "hexdb.io" });
  } catch (error) {
    return res.status(error?.name === "AbortError" ? 504 : 502).json({ error: "Aircraft database unavailable" });
  } finally {
    clearTimeout(timeout);
  }
}
