const SOURCES = [
  { id: "fintraffic", name: "Fintraffic · Finlandia", url: "https://tie.digitraffic.fi/api/weathercam/v1/stations",
    map: d => (d.features || []).flatMap(f => { const p=f.properties||{}, c=f.geometry?.coordinates||[]; return (p.presets||[]).map(v=>({id:"fi-"+(p.id||f.id)+"-"+(v.id||"view"),name:p.name||"Cámara de carretera",country:"Finlandia",lat:+c[1],lon:+c[0],image:v.id?"https://weathercam.digitraffic.fi/"+v.id+".jpg":"",source:"https://www.digitraffic.fi/en/road-traffic/",provider:"Fintraffic",kind:"snapshot"})); }) },
  { id: "tfl", name: "Transport for London · Reino Unido", url: "https://api.tfl.gov.uk/Place/Type/JamCam",
    map: d => (Array.isArray(d)?d:[]).map(p=>({id:"tfl-"+p.id,name:p.commonName||"London traffic camera",country:"Reino Unido",lat:+p.lat,lon:+p.lon,image:p.additionalProperties?.find(x=>x.key==="imageUrl")?.value||"",source:"https://tfl.gov.uk",provider:"TfL",kind:"snapshot"})) },
  { id: "ontario", name: "Ontario 511 · Canadá", url: "https://511on.ca/api/v2/get/cameras?format=json",
    map: d => (Array.isArray(d)?d:d.cameras||[]).map(p=>({id:"on-"+(p.Id||p.id),name:p.Location||p.Name||"Ontario traffic camera",country:"Canadá",lat:+(p.Latitude??p.Lat),lon:+(p.Longitude??p.Lon),image:p.Views?.[0]?.Url||p.Url||p.ImageUrl||"",source:"https://511on.ca/",provider:"Ontario 511",kind:"snapshot"})) },
  { id: "alberta", name: "Alberta 511 · Canadá", url: "https://511.alberta.ca/api/v2/get/cameras?format=json",
    map: d => (Array.isArray(d)?d:d.cameras||[]).map(p=>({id:"ab-"+(p.Id||p.id),name:p.Location||p.Name||"Alberta traffic camera",country:"Canadá",lat:+(p.Latitude??p.Lat),lon:+(p.Longitude??p.Lon),image:p.Views?.[0]?.Url||p.Url||p.ImageUrl||"",source:"https://511.alberta.ca/",provider:"Alberta 511",kind:"snapshot"})) },
  { id: "singapore", name: "LTA · Singapur", url: "https://api.data.gov.sg/v1/transport/traffic-images",
    map: d => (d.items||[]).flatMap(i=>i.cameras||[]).map(p=>({id:"sg-"+p.camera_id,name:"Traffic camera "+p.camera_id,country:"Singapur",lat:+p.location?.latitude,lon:+p.location?.longitude,image:p.image||"",source:"https://data.gov.sg/",provider:"LTA",kind:"snapshot"})) },
  { id: "geonet", name: "GeoNet · Nueva Zelanda", url: "https://images.geonet.org.nz/volcano/cameras/all.json",
    map: d => (Array.isArray(d)?d:d.cameras||[]).map(p=>({id:"nz-"+(p.id||p.name),name:p.name||"Volcano camera",country:"Nueva Zelanda",lat:+(p.latitude??p.lat),lon:+(p.longitude??p.lon),image:p.image||p.url||"",source:"https://www.geonet.org.nz/",provider:"GeoNet",kind:"snapshot"})) }
];
const valid = c => c.id && c.name && Number.isFinite(c.lat) && Number.isFinite(c.lon) && Math.abs(c.lat)<=90 && Math.abs(c.lon)<=180;

export async function loadPublicCameras({signal,bbox,zoom=4}={}) {
  const tasks = SOURCES.map(async source => {
    const response=await fetch(source.url,{signal,headers:{Accept:"application/json"},cache:"no-store"});
    if(!response.ok) throw new Error("HTTP "+response.status);
    return {source,cameras:source.map(await response.json()).filter(valid)};
  });
  const results=await Promise.allSettled(tasks);
  const cameras=[],sources=[];
  for(let i=0;i<results.length;i++){
    const r=results[i],s=SOURCES[i];
    if(r.status==="fulfilled"){cameras.push(...r.value.cameras);sources.push({id:s.id,name:s.name,status:"online",count:r.value.cameras.length});}
    else sources.push({id:s.id,name:s.name,status:"unavailable",count:0,error:r.reason?.message||"No disponible"});
  }

  // OpenEye publica un catálogo mundial con CORS abierto. Solo se consultan
  // cámaras gratuitas del rectángulo visible; el mapa nunca descarga el catálogo entero.
  try {
    const box=bbox||[-180,-85,180,85];
    const url=new URL("https://api.openeye.cam/v1/catalog/map");
    url.searchParams.set("bbox",box.join(","));
    url.searchParams.set("zoom",String(zoom));
    url.searchParams.set("cluster","auto");
    url.searchParams.set("limit","500");
    const response=await fetch(url,{signal,headers:{Accept:"application/json"},cache:"no-store"});
    if(!response.ok) throw new Error("HTTP "+response.status);
    const data=await response.json();
    const rows=data.items||data.clusters||[];
    for(const p of rows){
      if(!Number.isFinite(+p.lat)||!Number.isFinite(+p.lon)) continue;
      const isCluster=!!p.count;
      cameras.push({
        id:"openeye-"+p.id,name:p.title||p.handle||"Cámara pública",
        country:p.country||"",lat:+p.lat,lon:+p.lon,
        image:p.preview_url||p.view?.url||"",
        source:p.page_url||p.url||"https://openeye.cam/",
        provider:"OpenEye · catálogo público",kind:isCluster?"cluster":(p.kind||p.feed_kind||"public"),
        handle:p.handle||"",count:isCluster?p.count:0,free:p.is_free!==false
      });
    }
    sources.push({id:"openeye",name:"OpenEye · catálogo mundial",status:"online",count:rows.length,total:data.total||rows.length});
  } catch(error) {
    if(error.name==="AbortError") throw error;
    sources.push({id:"openeye",name:"OpenEye · catálogo mundial",status:"unavailable",count:0,error:error.message});
  }
  return {cameras:cameras.filter(valid),sources,updatedAt:new Date().toISOString()};
}
