const $ = id => document.getElementById(id);
const safe = v => String(v ?? 'No disponible').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ICON = { earthquake:'●', tc:'🌀', cyclone:'🌀', fl:'🌊', flood:'🌊', vo:'🌋', volcano:'🌋', 'weather-alert':'⚠', disaster:'⚠' };
let viewer, enabled=false, busy=false, lastLoad=0;
const entities = new Map(), seen = new Set();
let list, status, toggle, tools;
export function initEnvironmentLayer(globe, onStatus=()=>{}, onHint=()=>{}) {
  viewer=globe; list=$('environment-list'); status=$('environment-status'); tools=$('environment-tools'); toggle=$('[data-layer="environment"]');
  async function notify(event) {
    if (seen.has(event.id)) return;
    seen.add(event.id);\n    try { localStorage.setItem('godseye-env-seen', JSON.stringify([...seen].slice(-500))); } catch {}
    try {
      if (window.Capacitor?.isNativePlatform?.()) {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        let permission = await LocalNotifications.checkPermissions();
        if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions();
        if (permission.display === 'granted') await LocalNotifications.schedule({ notifications:[{ id: Math.abs(hash(event.id)), title: 'EL OJO DE DIOS · ' + event.title, body: event.place + (event.magnitude ? ' · Magnitud ' + event.magnitude : '') + ' · ' + new Date(event.time || Date.now()).toLocaleString('es-AR'), schedule:{ at:new Date(Date.now()+1000) } }] });
      } else if ('Notification' in window && Notification.permission === 'granted') new Notification('EL OJO DE DIOS · ' + event.title,{body:event.place});
    } catch(e) { console.warn('Notificación local no disponible',e); }
  }
  function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return h||1;}
  function addMarker(e) {
    const c=e.coordinates; if(!Array.isArray(c)||c.length<2||!Number.isFinite(Number(c[0]))||!Number.isFinite(Number(c[1])))return;
    const lon=Number(c[0]),lat=Number(c[1]); if(Math.abs(lat)>90||Math.abs(lon)>180)return;
    const color=e.kind==='earthquake'?Cesium.Color.ORANGE:(/tc|cyclone/.test(e.kind)?Cesium.Color.MAGENTA:(e.level==='Red'||e.level==='Extreme'?Cesium.Color.RED:Cesium.Color.CYAN));
    const entity=viewer.entities.add({id:'env-'+e.id,name:e.title,position:Cesium.Cartesian3.fromDegrees(lon,lat,Math.max(0,Number(c[2])||0)*1000),
      point:{pixelSize:e.kind==='earthquake'?Math.min(18,8+(Number(e.magnitude)||0)):11,color,outlineColor:Cesium.Color.WHITE,outlineWidth:1.5,disableDepthTestDistance:1e7},
      label:{text:e.kind==='earthquake'?'M'+(e.magnitude??'?'):e.title.slice(0,22),font:'11px sans-serif',fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:3,style:Cesium.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new Cesium.Cartesian2(0,-15),scaleByDistance:new Cesium.NearFarScalar(1e5,1,1e7,.35)},
      description:'<b>'+safe(e.title)+'</b><br>'+safe(e.place)+'<br>Fuente: '+safe(e.source)+'<br>Hora: '+safe(e.time?new Date(e.time).toLocaleString('es-AR'):'No disponible')+(e.magnitude?'<br>Magnitud: '+safe(e.magnitude):'')+(e.url?'<br><a href="'+safe(e.url)+'" target="_blank" rel="noopener">Fuente oficial</a>':'')});
    entities.set(e.id,entity);
  }
  function render(events) {
    list.innerHTML=events.slice(0,80).map(e=>'<button class="environment-row" data-event="'+safe(e.id)+'"><span class="environment-icon">'+(ICON[e.kind]||'⚠')+'</span><span><b>'+safe(e.title)+'</b><small>'+safe(e.place)+' · '+safe(e.source)+' · '+safe(e.time?new Date(e.time).toLocaleString('es-AR'):'Hora N/D')+'</small></span><em>'+(e.magnitude?'M'+safe(e.magnitude):safe(e.level||'INFO'))+'</em></button>').join('')||'<span class="muted">No hay eventos devueltos por las fuentes consultadas.</span>';
    list.querySelectorAll('[data-event]').forEach(b=>b.addEventListener('click',()=>{const ent=entities.get(b.dataset.event);if(ent){viewer.selectedEntity=ent;viewer.flyTo(ent,{duration:1.2});}}));
  }
  async function refresh(force=false) {
    if(!enabled||busy||(!force&&Date.now()-lastLoad<60000))return;
    busy=true;status.textContent='Consultando fuentes oficiales…';
    try {
      const r=await fetch('/api/environment',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);
      const data=await r.json();const events=data.events||[];
      for(const e of events){if(!entities.has(e.id))addMarker(e);}
      const earthquakes=events.filter(e=>e.kind==='earthquake');
      const alerts=events.filter(e=>e.kind!=='earthquake');
      render(events.sort((a,b)=>(b.time||0)-(a.time||0)));
      status.textContent=earthquakes.length+' sismos · '+alerts.length+' alertas/eventos';
      onStatus(status.textContent);
      for(const e of events){if((e.kind==='earthquake'&&Number(e.magnitude)>=4)||(e.kind!=='earthquake'&&(/red|extreme|severe/i.test(e.level||''))))await notify(e);}
      lastLoad=Date.now();if(data.errors?.length)console.warn('Fuentes ambientales:',data.errors);
      onHint('Datos ambientales recibidos de USGS, GDACS y NOAA/NWS. La cobertura de alertas meteorológicas de NWS corresponde a Estados Unidos y territorios.');
    } catch(e){status.textContent='Error al consultar fuentes';list.innerHTML='<span class="muted">'+safe(e.message)+'</span>';}
    finally{busy=false;}
  }
  function setEnabled(v){enabled=v;tools.hidden=!v;if(v){refresh(true);if('Notification'in window&&Notification.permission==='default')Notification.requestPermission().catch(()=>{});}else status.textContent='Desactivada';}
  $('refresh-environment').addEventListener('click',()=>refresh(true));
  toggle.addEventListener('click',()=>setEnabled(!toggle.classList.contains('active')));
  setInterval(()=>refresh(false),60000);
  return {setEnabled,refresh};
}
