import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from "satellite.js";

export class SatelliteLayer {
  constructor(viewer,onStatus=()=>{}) {
    this.viewer=viewer;this.onStatus=onStatus;this.satrecs=[];
    this.collection=new Cesium.PointPrimitiveCollection();this.viewer.scene.primitives.add(this.collection);
    this.visible=false;this.lastUpdate=0;this.timer=null;
  }
  async load() {
    this.onStatus({loading:true,count:this.satrecs.length});
    try {
      const response=await fetch("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",{cache:"no-store"});
      if(!response.ok)throw new Error("CelesTrak HTTP "+response.status);
      const lines=(await response.text()).trim().split(/\r?\n/);
      const parsed=[];
      for(let i=0;i<lines.length-2;i++){
        if(lines[i+1]?.startsWith("1 ")&&lines[i+2]?.startsWith("2 ")){
          try{parsed.push({name:lines[i].trim(),satrec:twoline2satrec(lines[i+1],lines[i+2])});i+=2;}catch{}
        }
      }
      if(!parsed.length)throw new Error("CelesTrak no devolvió elementos orbitales satélites activos");
      this.satrecs=parsed;
      this.updatePositions();
      this.onStatus({loading:false,count:this.satrecs.length,updatedAt:new Date().toISOString()});
    }catch(error){this.onStatus({loading:false,count:this.satrecs.length,error:error.message});}
  }
  updatePositions() {
    if(!this.visible)return;
    const now=new Date(),gmst=gstime(now);
    this.collection.removeAll();
    for(const item of this.satrecs){
      try{
        const pv=propagate(item.satrec,now);
        if(!pv.position||typeof pv.position==="boolean")continue;
        const geo=eciToGeodetic(pv.position,gmst);
        const lon=degreesLong(geo.longitude),lat=degreesLat(geo.latitude),alt=geo.height*1000;
        if(!Number.isFinite(lon)||!Number.isFinite(lat)||!Number.isFinite(alt)||alt<100000)continue;
        this.collection.add({position:Cesium.Cartesian3.fromDegrees(lon,lat,alt),pixelSize:2.4,color:Cesium.Color.fromCssColorString("#65d7ff").withAlpha(.85),id:item.name});
      }catch{}
    }
    this.lastUpdate=Date.now();
  }
  async setVisible(visible){
    this.visible=visible;this.collection.show=visible;
    if(visible&&this.satrecs.length===0)await this.load();
    if(visible){this.updatePositions();if(this.timer)clearInterval(this.timer);this.timer=setInterval(()=>this.updatePositions(),10000);}
    else if(this.timer){clearInterval(this.timer);this.timer=null;}
  }
  destroy(){if(this.timer)clearInterval(this.timer);this.viewer.scene.primitives.remove(this.collection);}
}
