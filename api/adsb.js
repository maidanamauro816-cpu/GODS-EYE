const UPSTREAM = "https://api.adsb.lol/v2";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept");
  res.setHeader("Cache-Control", "public, s-maxage=5, stale-while-revalidate=10");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const lat = Number(req.query?.lat);
  const lon = Number(req.query?.lon);
  const dist = Number(req.query?.dist ?? 250);

  if (
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lon) || lon < -180 || lon > 180 ||
    !Number.isFinite(dist) || dist < 1 || dist > 250
  ) {
    return res.status(400).json({
      error: "Invalid coordinates or distance",
      expected: { lat: "−90..90", lon: "−180..180", dist: "1..250" }
    });
  }

  const url = `${UPSTREAM}/lat/${lat}/lon/${lon}/dist/${Math.round(dist)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "GODS-EYE/1.0" },
      signal: controller.signal
    });
    const body = await upstream.text();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (!upstream.ok) {
      return res.status(upstream.status).send(body || JSON.stringify({ error: "ADSB.lol upstream error" }));
    }
    return res.status(200).send(body);
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut ? "ADSB.lol request timed out" : "Unable to reach ADSB.lol"
    });
  } finally {
    clearTimeout(timeout);
  }
}
