import { loadPublicCameras } from "../fetchers/cameras.js";

export class CameraLayer {
  constructor(viewer,onStatus=()=>{}) {
    this.viewer=viewer;this.onStatus=onStatus;this.entities=new Map();
    this.cameraData=new Map();this.sources=[];this.controller=null;this.visible=false;
    this.peer=null;
    window.addEventListener("camera-close",()=>this.stopVideo());
    this.viewer.selectedEntityChanged.addEventListener(entity=>{
      if(!entity){this.stopVideo();const modal=document.getElementById("camera-viewer");if(modal)modal.hidden=true;return;}
      if(!this.visible)return;
      const id=String(entity.id||"").replace(/^camera-/,"");
      const camera=this.cameraData.get(id);
      if(camera)this.openCamera(camera);
      else{this.stopVideo();const modal=document.getElementById("camera-viewer");if(modal)modal.hidden=true;}
    });
  }
  async refresh() {
    this.controller?.abort();this.controller=new AbortController();
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
        incoming.add(camera.id);this.cameraData.set(camera.id,camera);
        const entity=this.entities.get(camera.id),isCluster=camera.kind==="cluster";
        const description=[
          "<b>"+escapeHtml(camera.name)+"</b>",escapeHtml(camera.country||""),
          "Proveedor: "+escapeHtml(camera.provider),
          isCluster?"Cámaras agrupadas: "+camera.count:"Tocá el marcador para consultar imagen o vídeo",
          '<br><a href="'+safeUrl(camera.source)+'" target="_blank" rel="noopener">Abrir fuente / visor oficial</a>'
        ].join("<br>");
        const position=Cesium.Cartesian3.fromDegrees(camera.lon,camera.lat,20);
        if(entity){entity.position=position;entity.description=description;entity.show=this.visible;}
        else{
          const created=this.viewer.entities.add({
            id:"camera-"+camera.id,name:camera.name,position,
            point:{pixelSize:isCluster?11:7,color:isCluster?Cesium.Color.ORANGE:Cesium.Color.fromCssColorString("#ff4545"),outlineColor:Cesium.Color.WHITE,outlineWidth:1},
            label:{text:isCluster?String(camera.count)+" CAM":"CAM",font:"9px sans-serif",fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:2,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-13),scaleByDistance:new Cesium.NearFarScalar(2e4,1,2e6,0)},
            description
          });
          created.show=this.visible;this.entities.set(camera.id,created);
        }
      }
      for(const [id,entity] of this.entities)if(!incoming.has(id)){this.viewer.entities.remove(entity);this.entities.delete(id);this.cameraData.delete(id);}
      this.onStatus({loading:false,count:this.entities.size,sources:this.sources,updatedAt:result.updatedAt});
    }catch(error){if(error.name!=="AbortError")this.onStatus({loading:false,count:this.entities.size,sources:this.sources,error:error.message});}
  }
  async openCamera(camera){
    if(camera.kind==="cluster"){this.onStatus({loading:false,count:this.entities.size,message:"Acercá el globo para ver cámaras individuales"});return;}
    const modal=document.getElementById("camera-viewer");
    if(!modal)return;
    this.stopVideo();
    modal.hidden=false;
    document.getElementById("camera-title").textContent=camera.name;
    document.getElementById("camera-meta").textContent=[camera.country,camera.provider].filter(Boolean).join(" · ");
    const image=document.getElementById("camera-image"),video=document.getElementById("camera-video"),message=document.getElementById("camera-message"),link=document.getElementById("camera-source"),credit=document.getElementById("camera-attribution");
    image.hidden=true;video.hidden=true;video.removeAttribute("src");message.textContent="Consultando disponibilidad de la cámara…";
    link.href=safeUrl(camera.source);link.hidden=!camera.source;
    if(credit){credit.hidden=true;credit.textContent="";credit.removeAttribute("href");}
    image.onerror=()=>{image.onerror=null;image.src="https://api.openeye.cam/v1/offline.webp";};
    if(camera.provider!=="OpenEye · catálogo público"){
      if(camera.image){image.src=safeUrl(camera.image);image.hidden=false;message.textContent="Imagen pública del proveedor · instantánea, no vídeo continuo";}
      else message.textContent="El proveedor no ofrece una imagen insertable. Abrí su fuente oficial.";
      return;
    }
    try{
      const response=await fetch("https://api.openeye.cam/v1/catalog/"+encodeURIComponent(camera.id),{headers:{Accept:"application/json"},cache:"no-store"});
      if(!response.ok)throw new Error("Detalle HTTP "+response.status);
      const payload=await response.json(),detail=payload.item||payload.camera||payload;
      const view=detail.view||{};
      const attribution=detail.redistribution?.attribution;
      const mayEmbed=detail.redistribution?.preview_embed===true;
      const attributionValid=!attribution?.required||(!!attribution?.name&&!!attribution?.url);
      if(attribution?.required&&attributionValid&&credit){credit.href=safeUrl(attribution.url);credit.textContent=attribution.name;credit.hidden=false;}
      const liveVideo=detail.feed_kind==="live_video"||detail.kind==="live_video";
      const officialUrl=detail.page_url||detail.source_url||(view.render==="link"?view.url:null)||camera.source;
      if(officialUrl)link.href=safeUrl(officialUrl);
      if(detail.live===false)message.textContent="Sin imagen reciente confirmada. Abrí el visor oficial para comprobar el estado.";
      else if(view.render==="image"&&view.url&&mayEmbed&&attributionValid){
        image.src=safeUrl(view.url);image.hidden=false;
        const age=Number.isFinite(+detail.last_frame_age_s)?Math.round(+detail.last_frame_age_s):null;
        message.textContent=age===null?"Instantánea pública autorizada":(age<120?"Imagen recibida hace "+age+" s":"Última imagen hace "+Math.round(age/60)+" min");
      }else if(liveVideo){
        message.textContent="Esta cámara dispone de vídeo en directo. Abrí el visor oficial para verlo. No iniciamos WHEP desde aquí porque el servicio puede cobrar por segundo.";
      }else if(view.render==="link"&&view.url){
        message.textContent="El proveedor permite ver esta cámara en su página oficial, pero no insertar su contenido aquí.";
      }else if(view.render==="none"||!mayEmbed||!attributionValid){
        message.textContent="La licencia de esta cámara no permite insertar la imagen. Abrí únicamente la fuente oficial.";
      }else message.textContent="El proveedor no ofrece una vista insertable. Usá el visor oficial.";
    }catch(error){
      message.textContent="No se pudo consultar el detalle: "+error.message+". Podés probar el visor oficial.";
    }
  }
  stopVideo(){
    const video=document.getElementById("camera-video");
    if(video){video.pause();video.srcObject=null;}
  }
  setVisible(visible){this.visible=visible;for(const entity of this.entities.values())entity.show=visible;if(!visible){this.stopVideo();const modal=document.getElementById("camera-viewer");if(modal)modal.hidden=true;}}
  destroy(){this.controller?.abort();this.stopVideo();for(const entity of this.entities.values())this.viewer.entities.remove(entity);this.entities.clear();this.cameraData.clear();}
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function safeUrl(value){try{const u=new URL(value);return u.protocol==="https:"?u.href:"#";}catch{return "#";}}
