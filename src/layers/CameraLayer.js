import { loadPublicCameras } from "../fetchers/cameras.js";

export class CameraLayer {
  constructor(viewer,onStatus=()=>{}) {
    this.viewer=viewer; this.onStatus=onStatus; this.entities=new Map();
    this.sources=[]; this.controller=null; this.visible=true;
  }
  async refresh() {
    this.controller?.abort(); this.controller=new AbortController();
    this.onStatus({loading:true,count:this.entities.size,sources:this.sources});
    try {
      const rectangle=this.viewer.camera.computeViewRectangle(this.viewer.scene.globe.ellipsoid);
      const bbox=rectangle?[
        Cesium.Math.toDegrees(rectangle.west),Cesium.Math.toDegrees(rectangle.south),
        Cesium.Math.toDegrees(rectangle.east),Cesium.Math.toDegrees(rectangle.north)
      ]:[-180,-85,180,85];
      const height=this.viewer.camera.positionCartographic.height;
      const zoom=Math.max(2,Math.min(12,Math.round(20-Math.log2(Math.max(1,height)/100))));
      const result=await loadPublicCameras({signal:this.controller.signal,bbox,zoom});
      this.sources=result.sources;
      const incoming=new Set();
      for(const camera of result.cameras){
        incoming.add(camera.id);
        const entity=this.entities.get(camera.id);
        const isCluster=camera.kind==="cluster";
        const description=[
          "<b>"+escapeHtml(camera.name)+"</b>",
          escapeHtml(camera.country||""),
          "Proveedor: "+escapeHtml(camera.provider),
          isCluster?"Cámaras agrupadas: "+camera.count:"Tipo: "+escapeHtml(camera.kind),
          camera.image?'<br><img src="'+safeUrl(camera.image)+'" style="max-width:100%;max-height:220px" referrerpolicy="no-referrer">':"",
          '<br><a href="'+safeUrl(camera.source)+'" target="_blank" rel="noopener">Abrir fuente / visor oficial</a>',
          camera.provider==="OpenEye · catálogo público"?"<br>Catálogo público; disponibilidad individual depende del operador.":""
        ].join("<br>");
        const position=Cesium.Cartesian3.fromDegrees(camera.lon,camera.lat,20);
        if(entity){entity.position=position;entity.description=description;entity.show=this.visible;}
        else{
          const created=this.viewer.entities.add({
            name:camera.name,position,
            point:{pixelSize:isCluster?11:7,color:isCluster?Cesium.Color.ORANGE:Cesium.Color.fromCssColorString("#ff4545"),outlineColor:Cesium.Color.WHITE,outlineWidth:1},
            label:{text:isCluster?String(camera.count)+" CAM":"CAM",font:"9px sans-serif",fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:2,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-13),scaleByDistance:new Cesium.NearFarScalar(2e4,1,2e6,0)},
            description
          });
          created.show=this.visible; this.entities.set(camera.id,created);
        }
      }
      // Elimina únicamente cámaras del rectángulo anterior que ya no están visibles.
      for(const [id,entity] of this.entities) if(!incoming.has(id)){this.viewer.entities.remove(entity);this.entities.delete(id);}
      this.onStatus({loading:false,count:this.entities.size,sources:this.sources,updatedAt:result.updatedAt});
    } catch(error){if(error.name!=="AbortError")this.onStatus({loading:false,count:this.entities.size,sources:this.sources,error:error.message});}
  }
  setVisible(visible){this.visible=visible;for(const entity of this.entities.values())entity.show=visible;}
  destroy(){this.controller?.abort();for(const entity of this.entities.values())this.viewer.entities.remove(entity);this.entities.clear();}
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function safeUrl(value){try{const u=new URL(value);return u.protocol==="https:"?u.href:"#";}catch{return "#";}}
