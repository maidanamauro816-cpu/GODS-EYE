export default {
  async fetch(request, env) {
    const upgrade=request.headers.get("Upgrade");
    if(upgrade!=="websocket")return new Response("GOD'S EYE AIS proxy · WebSocket required",{status:426});
    if(!env.AISSTREAM_API_KEY)return new Response("AISSTREAM_API_KEY secret missing",{status:503});
    const origin=request.headers.get("Origin")||"";
    if(env.ALLOWED_ORIGIN && origin!==env.ALLOWED_ORIGIN)return new Response("Origin not allowed",{status:403});
    const pair=new WebSocketPair();
    const client=pair[0],server=pair[1];
    server.accept();
    let upstream=null,closed=false,subscribed=false;
    const closeBoth=(code=1000,reason="closed")=>{
      if(closed)return;closed=true;
      try{upstream?.close(code,reason)}catch{}
      try{server.close(code,reason)}catch{}
    };
    server.addEventListener("message",event=>{
      if(subscribed){server.send(JSON.stringify({type:"error",message:"La suscripción ya está activa"}));return;}
      let payload;
      try{payload=JSON.parse(event.data)}catch{closeBoth(1008,"invalid JSON");return;}
      const b=payload.bbox;
      if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)){closeBoth(1008,"invalid bbox");return;}
      const [west,south,east,north]=b;
      if(west < -180||east>180||south < -85||north>85||west>=east||south>=north||(east-west)*(north-south)>600){closeBoth(1008,"bbox outside allowed limits");return;}
      subscribed=true;
      upstream=new WebSocket("wss://stream.aisstream.io/v0/stream");
      upstream.addEventListener("open",()=>{
        upstream.send(JSON.stringify({
          APIKey:env.AISSTREAM_API_KEY,
          BoundingBoxes:[[[north,west],[south,east]]],
          FilterMessageTypes:["PositionReport","ShipStaticData","StaticDataReport"]
        }));
      });
      upstream.addEventListener("message",msg=>{
        if(closed)return;
        try{server.send(typeof msg.data==="string"?msg.data:msg.data)}catch{closeBoth(1011,"relay failed");}
      });
      upstream.addEventListener("error",()=>{try{server.send(JSON.stringify({type:"error",message:"Proveedor AIS no disponible"}))}catch{}closeBoth(1011,"upstream error");});
      upstream.addEventListener("close",()=>{if(!closed)closeBoth(1011,"AIS upstream closed");});
    });
    server.addEventListener("close",()=>closeBoth());
    server.addEventListener("error",()=>closeBoth(1011,"client error"));
    return new Response(null,{status:101,webSocket:client});
  }
};
