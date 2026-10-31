export class ShipLayer {
  constructor(viewer,onStatus=()=>{}) {
    this.viewer=viewer;this.onStatus=onStatus;this.entities=new Map();
    this.socket=null;this.visible=false;this.retry=0;this.retryTimer=null;this.refreshTimer=null;this.lastBox="";this.lastSeen=new Map();
  }
  bounds() {
    const rect=this.viewer.camera.computeViewRectangle(this.viewer.scene.globe.ellipsoid);
    let box=rect?[
      Cesium.Math.toDegrees(rect.west),Cesium.Math.toDegrees(rect.south),
      Cesium.Math.toDegrees(rect.east),Cesium.Math.toDegrees(rect.north)
    ]:[-75,-56,-53,-20];
    if(box[2]<box[0])box[2]=180;
    const area=(box[2]-box[0])*(box[3]-box[1]);
    if(area>600){
      const center=this.viewer.camera.pickEllipsoid(
        new Cesium.Cartesian2(this.viewer.canvas.clientWidth/2,this.viewer.canvas.clientHeight/2),
        this.viewer.scene.globe.ellipsoid
      );
      const c=center?Cesium.Cartographic.fromCartesian(center):Cesium.Cartographic.fromDegrees(-58,-34);
      const lon=Cesium.Math.toDegrees(c.longitude),lat=Cesium.Math.toDegrees(c.latitude);
      box=[Math.max(-180,lon-12),Math.max(-85,lat-12),Math.min(180,lon+12),Math.min(85,lat+12)];
    }
    return box.map(n=>Number(n.toFixed(4)));
  }
  connect() {
    if(!this.visible)return;
    const endpoint=import.meta.env.VITE_AIS_PROXY_URL;
    if(!endpoint){this.onStatus({loading:false,error:"Falta configurar el proxy seguro AIS de GOD'S EYE"});return;}
    this.disconnect(false);
    const bbox=this.bounds(),key=bbox.join(",");
    this.lastBox=key;
    this.onStatus({loading:true,count:this.entities.size,coverage:"AIS en vivo · región visible"});
    try{
      const socket=new WebSocket(endpoint);
      this.socket=socket;
      socket.addEventListener("open",()=>{
        this.retry=0;
        socket.send(JSON.stringify({bbox}));
        this.onStatus({loading:false,count:this.entities.size,coverage:"Conectado · AIS en vivo"});
      });
      socket.addEventListener("message",event=>this.handleMessage(event.data));
      socket.addEventListener("error",()=>this.onStatus({loading:false,count:this.entities.size,error:"No se pudo conectar al proxy AIS"}));
      socket.addEventListener("close",()=>{
        if(this.socket!==socket)return;
        this.socket=null;
        if(this.visible)this.scheduleReconnect();
      });
    }catch(error){this.onStatus({loading:false,count:this.entities.size,error:error.message});}
  }
  handleMessage(raw) {
    let event;try{event=JSON.parse(typeof raw==="string"?raw:new TextDecoder().decode(raw));}catch{return;}
    if(event.MessageType==="SubscriptionConfirmation"){this.onStatus({loading:false,count:this.entities.size,coverage:"AIS Stream conectado · posiciones recibidas en vivo"});return;}
    if(event.type==="error"){this.onStatus({loading:false,count:this.entities.size,error:event.message||"Error AIS"});return;}
    const meta=event.MetaData||{},message=event.Message||{};
    const pos=message.PositionReport||message.StandardClassBPositionReport||message.ExtendedClassBPositionReport||message.LongRangeAISBroadcastMessage;
    const lat=Number(meta.Latitude??pos?.Latitude),lon=Number(meta.Longitude??pos?.Longitude);
    const mmsi=String(meta.MMSI??pos?.UserID??"");
    if(!mmsi||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return;
    const name=meta.ShipName||"Buque "+mmsi;
    const entityId="ship-"+mmsi;
    const speed=pos?.Sog,course=pos?.Cog,heading=pos?.TrueHeading;
    const description=[
      "<b>"+escapeHtml(name)+"</b>","MMSI: "+escapeHtml(mmsi),
      "Velocidad: "+(Number.isFinite(speed)?speed+" nudos":"—"),
      "Rumbo: "+(Number.isFinite(course)?course+"°":"—"),
      "Último mensaje AIS recibido: "+new Date().toLocaleTimeString()
    ].join("<br>");
    const position=Cesium.Cartesian3.fromDegrees(lon,lat,0);
    let entity=this.entities.get(mmsi);
    if(!entity){
      entity=this.viewer.entities.add({
        id:entityId,name,position,
        point:{pixelSize:8,color:Cesium.Color.fromCssColorString("#ffd166"),outlineColor:Cesium.Color.WHITE,outlineWidth:1},
        label:{text:name,font:"10px sans-serif",fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:2,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-12),scaleByDistance:new Cesium.NearFarScalar(3e4,1,3e6,0)},
        description
      });
      this.entities.set(mmsi,entity);
    }else{entity.position=position;entity.name=name;entity.description=description;}
    this.lastSeen.set(mmsi,Date.now());
    this.onStatus({loading:false,count:this.entities.size,coverage:"AIS en vivo · región visible",lastMessage:Date.now()});
  }
  scheduleReconnect(){
    if(this.retryTimer)clearTimeout(this.retryTimer);
    const delay=Math.min(60000,2000*Math.pow(2,this.retry++));
    this.retryTimer=setTimeout(()=>this.connect(),delay);
  }
  setVisible(visible){
    this.visible=visible;
    if(!visible){this.disconnect();for(const e of this.entities.values())e.show=false;return;}
    for(const e of this.entities.values())e.show=true;
    this.connect();
    this.refreshTimer=setInterval(()=>{if(this.visible&&this.bounds().join(",")!==this.lastBox)this.connect();this.pruneStale();},5000);
  }
  pruneStale(){
    const cutoff=Date.now()-30*60*1000;
    for(const [mmsi,last] of this.lastSeen){
      if(last<cutoff){const entity=this.entities.get(mmsi);if(entity)this.viewer.entities.remove(entity);this.entities.delete(mmsi);this.lastSeen.delete(mmsi);}
    }
  }
  disconnect(clearTimer=true){
    if(this.retryTimer)clearTimeout(this.retryTimer);
    this.retryTimer=null;
    if(clearTimer&&this.refreshTimer)clearInterval(this.refreshTimer);
    if(clearTimer)this.refreshTimer=null;
    if(this.socket){const s=this.socket;this.socket=null;try{s.close(1000,"map layer changed");}catch{}}
  }
  destroy(){this.visible=false;this.disconnect();for(const e of this.entities.values())this.viewer.entities.remove(e);this.entities.clear();this.lastSeen.clear();}
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
