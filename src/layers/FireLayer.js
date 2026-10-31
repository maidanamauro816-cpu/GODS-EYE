import { fetchFires } from "../fetchers/fires.js";
export class FireLayer{
  constructor(viewer,onStatus=()=>{}){this.viewer=viewer;this.onStatus=onStatus;this.entities=new Map();this.visible=false;this.controller=null;this.timer=null;}
  bounds(){
    const r=this.viewer.camera.computeViewRectangle(this.viewer.scene.globe.ellipsoid);
    let b=r?[Cesium.Math.toDegrees(r.west),Cesium.Math.toDegrees(r.south),Cesium.Math.toDegrees(r.east),Cesium.Math.toDegrees(r.north)]:[-180,-85,180,85];
    if(b[2]<b[0])b[2]=180;
    if((b[2]-b[0])*(b[3]-b[1])>1500){
      const p=this.viewer.camera.pickEllipsoid(new Cesium.Cartesian2(this.viewer.canvas.clientWidth/2,this.viewer.canvas.clientHeight/2),this.viewer.scene.globe.ellipsoid);
      const c=p?Cesium.Cartographic.fromCartesian(p):Cesium.Cartographic.fromDegrees(-58,-34);
      const lon=Cesium.Math.toDegrees(c.longitude),lat=Cesium.Math.toDegrees(c.latitude);
      b=[Math.max(-180,lon-20),Math.max(-85,lat-15),Math.min(180,lon+20),Math.min(85,lat+15)];
    }
    return b;
  }
  async refresh(){
    if(!this.visible)return;
    this.controller?.abort();this.controller=new AbortController();this.onStatus({loading:true,count:this.entities.size});
    try{
      const fires=await fetchFires({bbox:this.bounds(),signal:this.controller.signal}),incoming=new Set();
      for(const f of fires){
        incoming.add(f.id);
        const confidence=f.confidence.toLowerCase();
        const color=confidence==="h"?Cesium.Color.RED:confidence==="n"?Cesium.Color.ORANGE:Cesium.Color.YELLOW;
        const description="<b>Detección térmica VIIRS</b><br>Confianza: "+escapeHtml(f.confidence)+"<br>Potencia radiativa: "+(f.frp===null?"—":f.frp+" MW")+"<br>Satélite: "+escapeHtml(f.satellite)+"<br>Adquisición: "+escapeHtml(f.date)+" · "+escapeHtml(f.time)+" UTC<br><small>NASA FIRMS · detección satelital, no confirmación de incendio en tierra</small>";
        let entity=this.entities.get(f.id);
        const pos=Cesium.Cartesian3.fromDegrees(f.lon,f.lat,0);
        if(!entity){entity=this.viewer.entities.add({id:"fire-"+f.id,name:"Detección térmica",position:pos,point:{pixelSize:7,color,outlineColor:Cesium.Color.WHITE,outlineWidth:1},description});this.entities.set(f.id,entity);}
        else{entity.position=pos;entity.description=description;}
      }
      for(const [id,e] of this.entities)if(!incoming.has(id)){this.viewer.entities.remove(e);this.entities.delete(id);}
      this.onStatus({loading:false,count:this.entities.size,updatedAt:new Date().toISOString()});
    }catch(error){if(error.name!=="AbortError")this.onStatus({loading:false,count:this.entities.size,error:error.message});}
  }
  setVisible(v){this.visible=v;for(const e of this.entities.values())e.show=v;if(this.timer)clearInterval(this.timer);if(v){this.refresh();this.timer=setInterval(()=>this.refresh(),15*60*1000);}else this.controller?.abort();}
  destroy(){if(this.timer)clearInterval(this.timer);this.controller?.abort();for(const e of this.entities.values())this.viewer.entities.remove(e);this.entities.clear();}
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
