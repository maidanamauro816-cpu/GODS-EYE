import { fetchFlights } from "../fetchers/flights.js";

export class FlightLayer {
  constructor(viewer,onStatus=()=>{}) {
    this.viewer=viewer;this.onStatus=onStatus;this.entities=new Map();
    this.visible=false;this.controller=null;this.timer=null;this.refreshTimer=null;
  }
  async refresh() {
    if(!this.visible)return;
    this.controller?.abort();this.controller=new AbortController();
    try{
      const center=this.viewer.camera.positionCartographic;
      const cart=Cesium.Cartographic.fromCartesian(this.viewer.camera.position);
      const target=this.viewer.camera.pickEllipsoid(
        new Cesium.Cartesian2(this.viewer.canvas.clientWidth/2,this.viewer.canvas.clientHeight/2),
        this.viewer.scene.globe.ellipsoid
      );
      const point=target?Cesium.Cartographic.fromCartesian(target):cart;
      const lat=Cesium.Math.toDegrees(point.latitude),lon=Cesium.Math.toDegrees(point.longitude);
      const result=await fetchFlights({lat,lon,radiusNm:250,signal:this.controller.signal});
      const incoming=new Set();
      for(const plane of result.aircraft){
        incoming.add(plane.id);
        const pos=Cesium.Cartesian3.fromDegrees(plane.lon,plane.lat,Math.max(plane.altitudeFt||0,0)*0.3048);
        let entity=this.entities.get(plane.id);
        const details=[
          "<b>"+escapeHtml(plane.callsign||"Vuelo sin indicativo")+"</b>",
          "ICAO: "+escapeHtml(plane.hex||"—"),
          "Matrícula: "+escapeHtml(plane.registration||"—"),
          "Tipo: "+escapeHtml(plane.type||"—"),
          "Altitud: "+(plane.altitudeFt==null?"—":Math.round(plane.altitudeFt).toLocaleString("es-AR")+" ft"),
          "Velocidad: "+(plane.groundSpeedKt==null?"—":Math.round(plane.groundSpeedKt)+" kt"),
          "Rumbo: "+(plane.track==null?"—":Math.round(plane.track)+"°"),
          "Última posición recibida: "+(plane.seenSeconds==null?"—":plane.seenSeconds.toFixed(1)+" s"),
          "<small>Fuente ADS-B: ADSB.lol · cobertura de receptores, no radar primario</small>"
        ].join("<br>");
        if(!entity){
          entity=this.viewer.entities.add({
            id:"flight-"+plane.id,name:plane.callsign||plane.hex||"Aircraft",position:pos,
            point:{pixelSize:7,color:Cesium.Color.fromCssColorString("#56d8ff"),outlineColor:Cesium.Color.WHITE,outlineWidth:1},
            label:{text:plane.callsign||plane.hex,font:"10px sans-serif",fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:2,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-12),scaleByDistance:new Cesium.NearFarScalar(5e4,1,2e6,0)},
            description:details
          });
          this.entities.set(plane.id,entity);
        }else{entity.position=pos;entity.description=details;entity.show=true;}
      }
      for(const [id,entity] of this.entities)if(!incoming.has(id)){this.viewer.entities.remove(entity);this.entities.delete(id);}
      this.onStatus({loading:false,count:this.entities.size,total:result.total,receivedAt:result.receivedAt,coverage:"radio 250 NM del centro del mapa"});
    }catch(error){if(error.name!=="AbortError")this.onStatus({loading:false,count:this.entities.size,error:error.message});}
  }
  setVisible(visible){
    this.visible=visible;
    for(const entity of this.entities.values())entity.show=visible;
    if(this.timer){clearInterval(this.timer);this.timer=null;}
    if(visible){this.refresh();this.timer=setInterval(()=>this.refresh(),30000);}
    else{this.controller?.abort();}
  }
  destroy(){if(this.timer)clearInterval(this.timer);if(this.refreshTimer)clearTimeout(this.refreshTimer);this.controller?.abort();for(const e of this.entities.values())this.viewer.entities.remove(e);this.entities.clear();}
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
