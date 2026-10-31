const ADSB_PROXY=import.meta.env.VITE_ADSB_PROXY || "/api/adsb";
const WORLD_PROXY=import.meta.env.VITE_TRAFFIC_PROXY_URL;
const endpoint=value=>new URL(value,window.location.origin);
const valid=p=>p&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lon)&&Math.abs(+p.lat)<=90&&Math.abs(+p.lon)<=180;

export async function fetchFlights({lat,lon,radiusNm=250,signal}={}) {
  const radius=Math.max(1,Math.min(250,Math.round(radiusNm)));
  if(!ADSB_PROXY)throw new Error("Falta configurar VITE_ADSB_PROXY");
  const url=endpoint(ADSB_PROXY);
  url.searchParams.set("lat",String(lat));url.searchParams.set("lon",String(lon));url.searchParams.set("dist",String(radius));
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

export async function fetchWorldFlights({signal}={}){
  if(!WORLD_PROXY)throw new Error("Proxy global OpenSky no configurado (VITE_TRAFFIC_PROXY_URL)");
  const url=endpoint(WORLD_PROXY);url.searchParams.set("mode","global");
  const response=await fetch(url,{signal,headers:{Accept:"application/json"},cache:"no-store"});
  if(!response.ok)throw new Error("OpenSky HTTP "+response.status);
  const data=await response.json(),states=Array.isArray(data.states)?data.states:[];
  const epoch=Number(data.time)||Math.floor(Date.now()/1000);
  const aircraft=states.map(row=>{
    if(!Array.isArray(row))return null;
    const hex=String(row[0]||"").trim().toLowerCase(),lat=Number(row[6]),lon=Number(row[5]);
    if(!hex||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
    const altitudeM=Number(row[7]),speedMps=Number(row[9]),positionTime=Number(row[3]);
    return {
      id:hex,hex,callsign:String(row[1]||"").trim(),registration:"",type:"",
      lat,lon,altitudeFt:Number.isFinite(altitudeM)?altitudeM/0.3048:null,
      groundSpeedKt:Number.isFinite(speedMps)?speedMps*1.943844:null,
      track:Number.isFinite(Number(row[10]))?Number(row[10]):null,
      verticalRate:Number.isFinite(Number(row[11]))?Number(row[11])*196.8504:null,
      squawk:row[14]||"",seenSeconds:Number.isFinite(positionTime)?Math.max(0,epoch-positionTime):null,
      onGround:row[8]===true,source:"OpenSky Network"
    };
  }).filter(Boolean);
  return {aircraft,receivedAt:new Date(epoch*1000).toISOString(),ageMs:Number(data._meta?.ageMs)||0,stale:!!data._meta?.stale,authenticated:!!data._meta?.authenticated,total:aircraft.length};
}
