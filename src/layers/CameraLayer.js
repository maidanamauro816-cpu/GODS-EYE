import { loadPublicCameras } from "../fetchers/cameras.js";

export class CameraLayer {
  constructor(viewer,onStatus=()=>{}) {
    this.viewer=viewer;this.onStatus=onStatus;this.entities=new Map();
    this.cameraData=new Map();this.sources=[];this.controller=null;this.visible=false;
    this.peer=null;
    window.addEventListener("camera-close",()=>this.stopVideo());
    this.viewer.selectedEntityChanged.addEventListener(entity=>{
      if(!entity||!this.visible)return;
      const id=String(entity.id||"").replace(/^camera-/,"");
      const camera=this.cameraData.get(id);
      if(camera)this.openCamera(camera);
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
    const image=document.getElementById("camera-image"),video=document.getElementById("camera-video"),message=document.getElementById("camera-message"),link=document.getElementById("camera-source");
    image.hidden=true;video.hidden=true;video.removeAttribute("src");message.textContent="Consultando disponibilidad de la cámara…";
    link.href=safeUrl(camera.source);link.hidden=!camera.source;
    try{
      const response=await fetch("https://api.openeye.cam/v1/catalog/"+encodeURIComponent(camera.id),{headers:{Accept:"application/json"},cache:"no-store"});
      if(!response.ok)throw new Error("Detalle HTTP "+response.status);
      const payload=await response.json(),detail=payload.item||payload.camera||payload;
      const view=detail.view||{};
      const attribution=detail.redistribution?.attribution;
      if(attribution?.name)document.getElementById("camera-meta").textContent+=" · Imagen: "+attribution.name;
      if(detail.live===false)message.textContent="Sin imagen reciente confirmada. Abrí el visor oficial para comprobar el estado.";
      if(view.render==="image"&&view.url){
        image.src=view.url;image.hidden=false;
        const age=Number.isFinite(+detail.last_frame_age_s)?Math.round(+detail.last_frame_age_s):null;
        message.textContent=age===null?"Imagen pública disponible":(age<120?"Imagen recibida hace "+age+" s":"Última imagen hace "+Math.round(age/60)+" min");
      }else if(detail.preview_url){
        image.src=detail.preview_url;image.hidden=false;
        message.textContent=detail.live===true?"Última imagen pública disponible":"Vista previa; directo no confirmado";
      }else if(view.render==="link"&&view.url){
        link.href=safeUrl(view.url);message.textContent="Esta cámara se visualiza en el sitio oficial; no permite insertar el vídeo en la aplicación.";
      }else message.textContent="El proveedor no ofrece una vista insertable. Usá el visor oficial.";
      const liveVideo=detail.feed_kind==="live_video"||detail.kind==="live_video";
      if(liveVideo){
        message.textContent="Intentando establecer vídeo en directo…";
        try{
          await this.playWhep(camera.id,video);
          video.hidden=false;image.hidden=true;message.textContent="VÍDEO EN DIRECTO · conexión WebRTC";
        }catch(error){message.textContent="No se pudo insertar el vídeo ("+error.message+"). Abrí el visor oficial.";link.href=safeUrl(detail.source_url||detail.page_url||camera.source);}
      }
      if(attribution?.url)link.href=safeUrl(attribution.url);
    }catch(error){
      message.textContent="No se pudo consultar el detalle: "+error.message+". Podés probar el visor oficial.";
    }
  }
  async playWhep(id,video){
    this.stopVideo();
    const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    this.peer=pc;
    pc.addTransceiver("video",{direction:"recvonly"});
    pc.addTransceiver("audio",{direction:"recvonly"});
    pc.ontrack=event=>{video.srcObject=event.streams[0];video.play().catch(()=>{});};
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    if(pc.iceGatheringState!=="complete")await new Promise(resolve=>{
      const timeout=setTimeout(resolve,5000);
      pc.addEventListener("icegatheringstatechange",()=>{if(pc.iceGatheringState==="complete"){clearTimeout(timeout);resolve();}});
    });
    const response=await fetch("https://api.openeye.cam/v1/streams/"+encodeURIComponent(id)+"/whep/offer",{
      method:"POST",headers:{"Content-Type":"application/sdp","Accept":"application/sdp"},body:pc.localDescription.sdp
    });
    if(!response.ok)throw new Error("WHEP HTTP "+response.status);
    await pc.setRemoteDescription({type:"answer",sdp:await response.text()});
  }
  stopVideo(){
    if(this.peer){this.peer.close();this.peer=null;}
    const video=document.getElementById("camera-video");
    if(video){video.pause();video.srcObject=null;}
  }
  setVisible(visible){this.visible=visible;for(const entity of this.entities.values())entity.show=visible;if(!visible)this.stopVideo();}
  destroy(){this.controller?.abort();this.stopVideo();for(const entity of this.entities.values())this.viewer.entities.remove(entity);this.entities.clear();this.cameraData.clear();}
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function safeUrl(value){try{const u=new URL(value);return u.protocol==="https:"?u.href:"#";}catch{return "#";}}
