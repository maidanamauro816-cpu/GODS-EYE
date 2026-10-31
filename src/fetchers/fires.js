const PROXY=import.meta.env.VITE_FIRE_PROXY_URL;
function parseCsv(text){
  const lines=text.trim().split(/\r?\n/);
  if(lines.length<2)return [];
  const headers=lines.shift().split(",");
  return lines.map(line=>{
    const values=line.split(","),row={};
    headers.forEach((h,i)=>row[h.trim()]=(values[i]||"").trim());
    return row;
  });
}
export async function fetchFires({bbox,signal}={}){
  if(!PROXY)throw new Error("Falta configurar el proxy FIRMS de NASA");
  const url=new URL(PROXY);url.searchParams.set("bbox",bbox.join(","));
  const response=await fetch(url,{signal,headers:{Accept:"text/csv"},cache:"no-store"});
  if(!response.ok)throw new Error("NASA FIRMS HTTP "+response.status);
  const rows=parseCsv(await response.text());
  return rows.map((r,i)=>({
    id:[r.latitude,r.longitude,r.acq_date,r.acq_time,r.satellite].join("-")+i,
    lat:+r.latitude,lon:+r.longitude,confidence:r.confidence||"unknown",
    frp:Number.isFinite(+r.frp)?+r.frp:null,
    date:r.acq_date,time:r.acq_time,satellite:r.satellite||"VIIRS",
    daynight:r.daynight||""
  })).filter(f=>Number.isFinite(f.lat)&&Number.isFinite(f.lon)&&Math.abs(f.lat)<=90&&Math.abs(f.lon)<=180);
}
