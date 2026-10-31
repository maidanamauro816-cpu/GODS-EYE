const BASE="https://api.adsb.lol/v2";
const valid=p=>p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lon)&&Math.abs(+p.lat)<=90&&Math.abs(+p.lon)<=180;

export async function fetchFlights({lat,lon,radiusNm=250,signal}={}) {
  const radius=Math.max(1,Math.min(250,Math.round(radiusNm)));
  const url=BASE+"/point/"+encodeURIComponent(lat)+"/"+encodeURIComponent(lon)+"/"+radius;
  const response=await fetch(url,{signal,headers:{Accept:"application/json"},cache:"no-store"});
  if(!response.ok)throw new Error("ADSB.lol HTTP "+response.status);
  const data=await response.json();
  const aircraft=(data.ac||[]).filter(valid).map(p=>({
    id:String(p.hex||p.icao||((p.flight||"aircraft").trim()+"-"+p.lat+"-"+p.lon)),
    hex:p.hex||"",callsign:(p.flight||"").trim(),registration:p.r||"",
    type:p.t||"",lat:+p.lat,lon:+p.lon,
    altitudeFt:typeof p.alt_baro==="number"?p.alt_baro:null,
    groundSpeedKt:Number.isFinite(+p.gs)?+p.gs:null,
    track:Number.isFinite(+p.track)?+p.track:null,
    verticalRate:Number.isFinite(+p.baro_rate)?+p.baro_rate:null,
    squawk:p.squawk||"",seenSeconds:Number.isFinite(+p.seen_pos)?+p.seen_pos:null,
    onGround:p.alt_baro==="ground",source:"ADSB.lol"
  }));
  return {aircraft,receivedAt:new Date().toISOString(),total:data.total??aircraft.length};
}
