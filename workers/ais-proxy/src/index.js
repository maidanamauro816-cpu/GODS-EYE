const DEFAULT_ORIGINS="https://localhost,capacitor://localhost,http://localhost:5173";

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
      const b=payload.bbox;
      if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)){closeBoth(1008,"invalid bbox");return;}
      const [west,south,east,north]=b;
      if(west < -180||east>180||south < -85||north>85||west>=east||south>=north||(east-west)*(north-south)>600){closeBoth(1008,"bbox outside allowed limits");return;}
      subscribed=true;
      upstream=new WebSocket("wss://stream.aisstream.io/v0/stream");
      upstream.addEventListener("open",()=>{
        upstream.send(JSON.stringify({APIKey:env.AISSTREAM_API_KEY,BoundingBoxes:[[[north,west],[south,east]]],FilterMessageTypes:["PositionReport","ShipStaticData","StaticDataReport"]}));
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
