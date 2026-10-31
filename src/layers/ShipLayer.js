export class ShipLayer {
  constructor(viewer,onStatus=()=>{}){
    this.viewer=viewer;this.onStatus=onStatus;this.entities=new Map();this.vessels=new Map();this.lastSeen=new Map();
    this.socket=null;this.visible=false;this.retry=0;this.retryTimer=null;this.renderTimer=null;this.lastMessageAt=0;
  }
  center(){
    const p=this.viewer.camera.pickEllipsoid(new Cesium.Cartesian2(this.viewer.canvas.clientWidth/2,this.viewer.canvas.clientHeight/2),this.viewer.scene.globe.ellipsoid);
    const c=p?Cesium.Cartographic.fromCartesian(p):this.viewer.camera.positionCartographic;
    return {lat:Cesium.Math.toDegrees(c.latitude),lon:Cesium.Math.toDegrees(c.longitude)};
  }
  connect(){
    if(!this.visible)return;
    const endpoint=import.meta.env.VITE_AIS_PROXY_URL;
    if(!endpoint){this.onStatus({loading:false,count:this.vessels.size,error:"Falta configurar el proxy seguro AIS de GOD'S EYE"});return;}
    this.disconnect(false);
    this.onStatus({loading:true,count:this.vessels.size,coverage:"AIS mundial · conectando"});
    try{
      const socket=new WebSocket(endpoint);this.socket=socket;
      socket.addEventListener("open",()=>{
        this.retry=0;
        socket.send(JSON.stringify({global:true}));
        this.onStatus({loading:false,count:this.vessels.size,coverage:"Suscripción AIS mundial activa"});
      });
      socket.addEventListener("message",event=>this.handleMessage(event.data));
      socket.addEventListener("error",()=>this.onStatus({loading:false,count:this.vessels.size,error:"No se pudo conectar al proxy AIS"}));
      socket.addEventListener("close",()=>{
        if(this.socket!==socket)return;
        this.socket=null;
        if(this.visible)this.scheduleReconnect();
      });
    }catch(error){this.onStatus({loading:false,count:this.vessels.size,error:error.message});}
  }
  handleMessage(raw){
    let event;try{event=JSON.parse(typeof raw==="string"?raw:new TextDecoder().decode(raw));}catch{return;}
    if(event.MessageType==="SubscriptionConfirmation"){this.onStatus({loading:false,count:this.vessels.size,coverage:"AIS mundial conectado · esperando posiciones"});return;}
    if(event.type==="error"){this.onStatus({loading:false,count:this.vessels.size,error:event.message||"Error AIS"});return;}
    const meta=event.MetaData||{},message=event.Message||{};
    const mmsi=String(meta.MMSI??message.PositionReport?.UserID??message.StandardClassBPositionReport?.UserID??"");
    if(!mmsi)return;
    const position=message.PositionReport||message.StandardClassBPositionReport||message.ExtendedClassBPositionReport||message.LongRangeAISBroadcastMessage;
    const lat=Number(meta.Latitude??position?.Latitude),lon=Number(meta.Longitude??position?.Longitude);
    const previous=this.vessels.get(mmsi);
    const name=String(meta.ShipName||message.ShipStaticData?.Name||message.StaticDataReport?.Name||previous?.name||("Buque "+mmsi)).trim();
    if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){
      this.vessels.set(mmsi,{mmsi,name,lat,lon,speed:Number.isFinite(Number(position?.Sog))?Number(position.Sog):previous?.speed,course:Number.isFinite(Number(position?.Cog))?Number(position.Cog):previous?.course,heading:Number.isFinite(Number(position?.TrueHeading))?Number(position.TrueHeading):previous?.heading});
      this.lastSeen.set(mmsi,Date.now());
      if(this.vessels.size>50000){
        const oldest=[...this.lastSeen.entries()].sort((a,b)=>a[1]-b[1]).slice(0,this.vessels.size-50000);
        for(const [oldId] of oldest){this.lastSeen.delete(oldId);this.vessels.delete(oldId);}
      }
    }else if(previous&&name!==previous.name)this.vessels.set(mmsi,{...previous,name});
    this.lastMessageAt=Date.now();
  }
  render(){
    if(!this.visible)return;
    const center=this.center();
    const rows=[...this.vessels.values()].sort((a,b)=>distanceKm(a.lat,a.lon,center.lat,center.lon)-distanceKm(b.lat,b.lon,center.lat,center.lon)).slice(0,1800);
    const incoming=new Set();
    for(const vessel of rows){
      incoming.add(vessel.mmsi);
      const position=Cesium.Cartesian3.fromDegrees(vessel.lon,vessel.lat,0);
      const details=[
        "<b>"+escapeHtml(vessel.name)+"</b>",
        "MMSI: "+escapeHtml(vessel.mmsi),
        "Velocidad: "+(Number.isFinite(vessel.speed)?vessel.speed.toFixed(1)+" nudos":"—"),
        "Rumbo: "+(Number.isFinite(vessel.course)?Math.round(vessel.course)+"°":"—"),
        "Proa: "+(Number.isFinite(vessel.heading)?Math.round(vessel.heading)+"°":"—"),
        "Último mensaje recibido: "+new Date(this.lastSeen.get(vessel.mmsi)||Date.now()).toLocaleTimeString(),
        "<small>Fuente AISStream · posición transmitida por AIS, no radar de navegación</small>"
      ].join("<br>");
      let entity=this.entities.get(vessel.mmsi);
      if(!entity){
        entity=this.viewer.entities.add({
          id:"ship-"+vessel.mmsi,name:vessel.name,position,
          point:{pixelSize:8,color:Cesium.Color.fromCssColorString("#ffd166"),outlineColor:Cesium.Color.WHITE,outlineWidth:1},
          label:{text:vessel.name,font:"10px sans-serif",fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:2,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-12),scaleByDistance:new Cesium.NearFarScalar(3e4,1,3e6,0)},
          description:details
        });
        this.entities.set(vessel.mmsi,entity);
      }else{entity.position=position;entity.name=vessel.name;entity.description=details;entity.show=true;}
    }
    for(const [mmsi,entity] of this.entities)if(!incoming.has(mmsi)){this.viewer.entities.remove(entity);this.entities.delete(mmsi);}
    this.onStatus({loading:false,count:this.vessels.size,visible:rows.length,coverage:"AIS mundial · mostrando los 1.800 buques más cercanos al centro del mapa",lastMessageAt:this.lastMessageAt});
  }
  pruneStale(){
    const cutoff=Date.now()-30*60*1000;
    for(const [mmsi,last] of this.lastSeen){
      if(last<cutoff){this.lastSeen.delete(mmsi);this.vessels.delete(mmsi);const entity=this.entities.get(mmsi);if(entity)this.viewer.entities.remove(entity);this.entities.delete(mmsi);}
    }
  }
  scheduleReconnect(){
    if(this.retryTimer)clearTimeout(this.retryTimer);
    const delay=Math.min(60000,2000*Math.pow(2,this.retry++));
    this.retryTimer=setTimeout(()=>this.connect(),delay);
  }
  setVisible(visible){
    this.visible=visible;
    if(!visible){this.disconnect();for(const e of this.entities.values())e.show=false;return;}
    this.connect();
    if(this.renderTimer)clearInterval(this.renderTimer);
    this.renderTimer=setInterval(()=>{this.pruneStale();this.render();},5000);
  }
  disconnect(clearTimer=true){
    if(this.retryTimer)clearTimeout(this.retryTimer);this.retryTimer=null;
    if(clearTimer&&this.renderTimer)clearInterval(this.renderTimer);
    if(clearTimer)this.renderTimer=null;
    if(this.socket){const s=this.socket;this.socket=null;try{s.close(1000,"layer hidden");}catch{}}
  }
  destroy(){this.visible=false;this.disconnect();for(const e of this.entities.values())this.viewer.entities.remove(e);this.entities.clear();this.vessels.clear();this.lastSeen.clear();}
}
function distanceKm(lat1,lon1,lat2,lon2){const r=Math.PI/180,a=(lat2-lat1)*r,b=(lon2-lon1)*r;const h=Math.sin(a/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(b/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
