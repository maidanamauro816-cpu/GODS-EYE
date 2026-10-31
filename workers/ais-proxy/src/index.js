const DEFAULT_ORIGINS="https://localhost,capacitor://localhost,http://localhost:5173";

let openSkyCache=null,openSkyToken=null,openSkyTokenExpiry=0,openSkyInflight=null;
async function getOpenSkyToken(env){
  if(!env.OPENSKY_CLIENT_ID||!env.OPENSKY_CLIENT_SECRET)return null;
  if(openSkyToken&&Date.now()<openSkyTokenExpiry-60000)return openSkyToken;
  const body=new URLSearchParams({grant_type:"client_credentials",client_id:env.OPENSKY_CLIENT_ID,client_secret:env.OPENSKY_CLIENT_SECRET});
  const response=await fetch("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error("OpenSky OAuth HTTP "+response.status);
  const token=await response.json();
  if(!token.access_token)throw new Error("OpenSky OAuth token missing");
  openSkyToken=token.access_token;openSkyTokenExpiry=Date.now()+Math.max(60,Number(token.expires_in)||1800)*1000;
  return openSkyToken;
}
async function readOpenSky(env){
  const authenticated=!!(env.OPENSKY_CLIENT_ID&&env.OPENSKY_CLIENT_SECRET);
  const ttl=authenticated?90000:15*60*1000;
  if(openSkyCache&&Date.now()-openSkyCache.fetchedAt<ttl)
    return {...openSkyCache.payload,_meta:{source:"OpenSky Network",fetchedAt:openSkyCache.fetchedAt,ageMs:Date.now()-openSkyCache.fetchedAt,stale:false,authenticated}};
  if(openSkyInflight)return openSkyInflight;
  openSkyInflight=(async()=>{
    try{
      const token=await getOpenSkyToken(env);
      const headers={Accept:"application/json"};
      if(token)headers.Authorization="Bearer "+token;
      const response=await fetch("https://opensky-network.org/api/states/all?extended=1",{headers,signal:AbortSignal.timeout(12000)});
      if(!response.ok){
        if(openSkyCache&&(response.status===429||response.status>=500))
          return {...openSkyCache.payload,_meta:{source:"OpenSky Network",fetchedAt:openSkyCache.fetchedAt,ageMs:Date.now()-openSkyCache.fetchedAt,stale:true,upstreamStatus:response.status,authenticated}};
        throw new Error("OpenSky HTTP "+response.status);
      }
      const payload=await response.json();
      if(!Array.isArray(payload.states))throw new Error("OpenSky snapshot malformed");
      openSkyCache={payload,fetchedAt:Date.now()};
      return {...payload,_meta:{source:"OpenSky Network",fetchedAt:openSkyCache.fetchedAt,ageMs:0,stale:false,authenticated}};
    }finally{openSkyInflight=null;}
  })();
  return openSkyInflight;
}


function originAllowed(request,env){
  const origin=request.headers.get("Origin")||"";
  const allowed=(env.ALLOWED_ORIGINS||DEFAULT_ORIGINS).split(",").map(x=>x.trim()).filter(Boolean);
  return allowed.includes(origin)?origin:null;
}
function corsHeaders(origin){
  return {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"86400","Vary":"Origin"};
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const origin=originAllowed(request,env);
    if(!origin)return new Response("Origin not allowed",{status:403});
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(origin)});

    if(url.pathname==="/fires"&&request.method==="GET"){
      if(!env.FIRMS_MAP_KEY)return new Response("FIRMS_MAP_KEY secret missing",{status:503});
      const bbox=(url.searchParams.get("bbox")||"").split(",").map(Number);
      if(bbox.length!==4||!bbox.every(Number.isFinite)||bbox[0]<-180||bbox[2]>180||bbox[1]<-90||bbox[3]>90||bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||(bbox[2]-bbox[0])*(bbox[3]-bbox[1])>1500)
        return new Response("Invalid fire map bounds",{status:400,headers:corsHeaders(origin)});
      const area=bbox.join(",");
      const upstream=await fetch("https://firms.modaps.eosdis.nasa.gov/api/area/csv/"+encodeURIComponent(env.FIRMS_MAP_KEY)+"/VIIRS_NOAA20_NRT/"+area+"/1",{cf:{cacheTtl:0}});
      return new Response(await upstream.text(),{status:upstream.status,headers:{...corsHeaders(origin),"Content-Type":"text/csv; charset=utf-8","Cache-Control":"no-store","X-Data-Source":"NASA FIRMS VIIRS NOAA-20"}});
    }

    if(url.pathname==="/flights"&&request.method==="GET"){
      if(url.searchParams.get("mode")==="global"){
        try{
          const payload=await readOpenSky(env);
          return new Response(JSON.stringify(payload),{status:200,headers:{...corsHeaders(origin),"Content-Type":"application/json","Cache-Control":"no-store","X-Data-Source":"OpenSky Network","X-Data-Age-Ms":String(payload._meta?.ageMs??0),"X-Data-Stale":String(!!payload._meta?.stale)}});
        }catch(error){
          return new Response(JSON.stringify({error:error.message,states:[]}),{status:503,headers:{...corsHeaders(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});
        }
      }
      const lat=Number(url.searchParams.get("lat")),lon=Number(url.searchParams.get("lon")),dist=Number(url.searchParams.get("dist")||250);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||!Number.isFinite(dist)||dist<1||dist>250)
        return new Response(JSON.stringify({error:"Invalid coordinates or radius"}),{status:400,headers:{...corsHeaders(origin),"Content-Type":"application/json"}});
      const upstream=await fetch("https://api.adsb.lol/v2/point/"+lat+"/"+lon+"/"+Math.round(dist),{headers:{Accept:"application/json"},cf:{cacheTtl:0}});
      return new Response(await upstream.text(),{status:upstream.status,headers:{...corsHeaders(origin),"Content-Type":"application/json","Cache-Control":"no-store","X-Data-Source":"ADSB.lol"}});
    }

    if(url.pathname!=="/ais"||request.headers.get("Upgrade")!=="websocket")
      return new Response("GOD'S EYE traffic proxy · use /flights or /ais",{status:404});
    if(!env.AISSTREAM_API_KEY)return new Response("AISSTREAM_API_KEY secret missing",{status:503});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    server.accept();
    let upstream=null,closed=false,subscribed=false;
    const closeBoth=(code=1000,reason="closed")=>{
      if(closed)return;closed=true;
      try{upstream?.close(code,reason)}catch{}
      try{server.close(code,reason)}catch{}
    };
    server.addEventListener("message",event=>{
      if(subscribed){server.send(JSON.stringify({type:"error",message:"La suscripción ya está activa"}));return;}
      let payload;try{payload=JSON.parse(event.data)}catch{closeBoth(1008,"invalid JSON");return;}
      let boxes;
      if(payload.global===true){
        boxes=[[[90,-180],[-90,180]]];
      }else{
        const b=payload.bbox;
        if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)){closeBoth(1008,"invalid bbox");return;}
        const [west,south,east,north]=b;
        if(west < -180||east>180||south < -85||north>85||west>=east||south>=north||(east-west)*(north-south)>600){closeBoth(1008,"bbox outside allowed limits");return;}
        boxes=[[[north,west],[south,east]]];
      }
      subscribed=true;
      upstream=new WebSocket("wss://stream.aisstream.io/v0/stream");
      upstream.addEventListener("open",()=>{
        upstream.send(JSON.stringify({APIKey:env.AISSTREAM_API_KEY,BoundingBoxes:boxes,FilterMessageTypes:["PositionReport","StandardClassBPositionReport","ExtendedClassBPositionReport","ShipStaticData","StaticDataReport"]}));
      });
      upstream.addEventListener("message",msg=>{if(closed)return;try{server.send(msg.data)}catch{closeBoth(1011,"relay failed");}});
      upstream.addEventListener("error",()=>{try{server.send(JSON.stringify({type:"error",message:"Proveedor AIS no disponible"}))}catch{}closeBoth(1011,"upstream error");});
      upstream.addEventListener("close",()=>{if(!closed)closeBoth(1011,"AIS upstream closed");});
    });
    server.addEventListener("close",()=>closeBoth());
    server.addEventListener("error",()=>closeBoth(1011,"client error"));
    return new Response(null,{status:101,webSocket:client});
  }
};
