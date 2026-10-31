import { fetchFlights, fetchWorldFlights } from "../fetchers/flights.js";

export class FlightLayer {
  constructor(viewer,onStatus=()=>{}) {
    this.viewer=viewer;this.onStatus=onStatus;this.entities=new Map();
    this.worldAircraft=new Map();this.regionalAircraft=new Map();
    this.visible=false;this.regionController=null;this.worldController=null;
    this.timer=null;this.lastWorldAttempt=0;this.worldMeta=null;this.worldError=null;
  }
  mapCenter(){
    const target=this.viewer.camera.pickEllipsoid(
      new Cesium.Cartesian2(this.viewer.canvas.clientWidth/2,this.viewer.canvas.clientHeight/2),
      this.viewer.scene.globe.ellipsoid
    );
    const point=target?Cesium.Cartographic.fromCartesian(target):this.viewer.camera.positionCartographic;
    return {lat:Cesium.Math.toDegrees(point.latitude),lon:Cesium.Math.toDegrees(point.longitude)};
  }
  async refresh(){
    if(!this.visible)return;
    this.regionController?.abort();this.regionController=new AbortController();
    const regionSignal=this.regionController.signal;
    const center=this.mapCenter();
    const jobs=[fetchFlights({...center,radiusNm:250,signal:regionSignal}).then(result=>{
      this.regionalAircraft=new Map(result.aircraft.map(p=>[p.id,p]));
    })];
    if(!this.lastWorldAttempt||Date.now()-this.lastWorldAttempt>=90000){
      this.worldController?.abort();this.worldController=new AbortController();
      this.lastWorldAttempt=Date.now();
      jobs.push(fetchWorldFlights({signal:this.worldController.signal}).then(result=>{
        this.worldAircraft=new Map(result.aircraft.map(p=>[p.id,p]));
        this.worldMeta=result;this.worldError=null;
      }).catch(error=>{
        if(error.name!=="AbortError")this.worldError=error.message;
      }));
    }
    this.onStatus({loading:true,count:this.entities.size});
    const results=await Promise.allSettled(jobs);
    if(!this.visible)return;
    const regionFailed=results[0]?.status==="rejected"&&results[0].reason?.name!=="AbortError";
    const combined=new Map(this.worldAircraft);
    for(const [id,plane] of this.regionalAircraft)combined.set(id,plane);
    const aircraft=[...combined.values()];
    // Keep mobile rendering responsive while retaining broad worldwide coverage.
    // Local ADS-B observations always win over the slower global snapshot.
    aircraft.sort((a,b)=>distanceKm(a.lat,a.lon,center.lat,center.lon)-distanceKm(b.lat,b.lon,center.lat,center.lon));
    const visibleAircraft=aircraft.slice(0,2500);
    const incoming=new Set();
    for(const plane of visibleAircraft){
      incoming.add(plane.id);
      const altitudeM=Math.max(plane.altitudeFt||0,0)*0.3048;
      const pos=Cesium.Cartesian3.fromDegrees(plane.lon,plane.lat,altitudeM);
      let entity=this.entities.get(plane.id);
      const source=plane.source||"ADS-B";
      const details=[
        "<b>"+escapeHtml(plane.callsign||"Vuelo sin indicativo")+"</b>",
        "ICAO: "+escapeHtml(plane.hex||"—"),
        "Matrícula: "+escapeHtml(plane.registration||"—"),
        "Tipo: "+escapeHtml(plane.type||"—"),
        "Altitud barométrica: "+(plane.altitudeFt==null?"—":Math.round(plane.altitudeFt).toLocaleString("es-AR")+" ft"),
        "Velocidad: "+(plane.groundSpeedKt==null?"—":Math.round(plane.groundSpeedKt)+" kt"),
        "Rumbo: "+(plane.track==null?"—":Math.round(plane.track)+"°"),
        "Última posición: "+(plane.seenSeconds==null?"—":plane.seenSeconds.toFixed(1)+" s"),
        "Fuente: "+escapeHtml(source),
        source==="OpenSky Network"&&this.worldMeta?"Antigüedad del snapshot mundial: "+Math.round(this.worldMeta.ageMs/1000)+" s":"",
        "<small>Datos ADS-B de receptores cooperativos; no son radar primario ni cobertura aeronáutica garantizada.</small>"
      ].filter(Boolean).join("<br>");
      if(!entity){
        entity=this.viewer.entities.add({
          id:"flight-"+plane.id,name:plane.callsign||plane.hex||"Aircraft",position:pos,
          point:{pixelSize:7,color:source==="OpenSky Network"?Cesium.Color.fromCssColorString("#48b9ff"):Cesium.Color.fromCssColorString("#75f0ff"),outlineColor:Cesium.Color.WHITE,outlineWidth:1},
          label:{text:plane.callsign||plane.hex,font:"10px sans-serif",fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:2,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-12),scaleByDistance:new Cesium.NearFarScalar(5e4,1,2e6,0)},
          description:details
        });
        this.entities.set(plane.id,entity);
      }else{entity.position=pos;entity.description=details;entity.show=true;}
    }
    for(const [id,entity] of this.entities)if(!incoming.has(id)){this.viewer.entities.remove(entity);this.entities.delete(id);}
    const globalLabel=this.worldMeta?.authenticated?"OpenSky global OAuth · caché 90 s":"OpenSky global · caché público 15 min";
    const coverage=this.worldAircraft.size?globalLabel+" + ADS-B regional 250 NM":"ADS-B regional 250 NM";
    const errors=[regionFailed?results[0].reason?.message:null,this.worldError].filter(Boolean);
    this.onStatus({loading:false,count:this.entities.size,total:this.worldAircraft.size+this.regionalAircraft.size,receivedAt:this.worldMeta?.receivedAt,coverage,error:errors.length===2?errors.join(" · "):null,worldStale:this.worldMeta?.stale});
  }
  setVisible(visible){
    this.visible=visible;
    for(const entity of this.entities.values())entity.show=visible;
    if(this.timer){clearInterval(this.timer);this.timer=null;}
    if(visible){this.refresh();this.timer=setInterval(()=>this.refresh(),30000);}
    else{this.regionController?.abort();this.worldController?.abort();}
  }
  destroy(){if(this.timer)clearInterval(this.timer);this.regionController?.abort();this.worldController?.abort();for(const e of this.entities.values())this.viewer.entities.remove(e);this.entities.clear();this.worldAircraft.clear();this.regionalAircraft.clear();}
}
function distanceKm(lat1,lon1,lat2,lon2){const r=Math.PI/180,a=(lat2-lat1)*r,b=(lon2-lon1)*r;const h=Math.sin(a/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(b/2)**2;return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
