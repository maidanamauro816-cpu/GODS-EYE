# GOD'S EYE · capas de tráfico en vivo

## Vuelos — ADS-B.LOL

La capa combina dos fuentes: OpenSky Network mundial mediante /flights?mode=global (snapshot público cacheado 15 minutos; si se configuran OPENSKY_CLIENT_ID y OPENSKY_CLIENT_SECRET, OAuth2 y caché de 90 segundos) y ADSB.lol regional mediante /flights?lat=... (radio máximo 250 millas náuticas, actualización cada 30 segundos y al mover el globo). Se muestran hasta 2.500 aeronaves cercanas al centro del mapa para mantener fluido el Android. La cobertura depende de receptores ADS-B/MLAT activos: no equivale a radar primario ni garantiza todos los aviones del planeta. Para explorar otra zona, mové/acercá el globo.

Fuente y licencia: https://www.adsb.lol/docs/open-data/api · ODbL 1.0. Respetar atribución y condiciones del proveedor.

## Buques — AIS Stream

AIS Stream ofrece posiciones AIS por WebSocket. La clave NO se incluye en la APK ni se envía al navegador. El Worker de Cloudflare de este repositorio funciona como proxy seguro y aplica límites al rectángulo consultado.

1. Crear una cuenta y una API key en https://aisstream.io/.
2. Desplegar workers/ais-proxy como Cloudflare Worker independiente de cualquier otro proyecto. El mismo Worker sirve el proxy ADS-B por HTTPS en /flights y el stream AIS por WSS en /ais.
3. Configurar el secreto AISSTREAM_API_KEY en el Worker.
4. Configurar ALLOWED_ORIGINS con los orígenes de la app, por ejemplo https://localhost,capacitor://localhost,http://localhost:5173.
5. En GitHub → Settings → Secrets and variables → Actions, crear VITE_TRAFFIC_PROXY_URL con la dirección HTTPS del Worker terminada en /flights y VITE_AIS_PROXY_URL con la dirección WSS terminada en /ais.
6. En Actions, ejecutar Deploy GOD'S EYE AIS proxy y luego Build Android APK. El despliegue necesita los secrets CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID y AISSTREAM_API_KEY; opcionalmente AIS_ALLOWED_ORIGINS, FIRMS_MAP_KEY, OPENSKY_CLIENT_ID y OPENSKY_CLIENT_SECRET. Las credenciales OpenSky aceleran la actualización mundial de vuelos; sin ellas se usa la cuota anónima con caché de 15 minutos.
7. Ejecutar nuevamente el workflow Android.

La app solicita una suscripción AIS mundial al Worker. El cliente mantiene los últimos mensajes recibidos, elimina posiciones sin actualización durante 30 minutos y dibuja los 1.800 buques más cercanos al centro del globo para cuidar el rendimiento Android. AIS es información transmitida por los buques y estaciones costeras/satelitales; no todos los barcos transmiten ni hay garantía de cobertura oceánica continua. AIS Stream limita a tres conexiones por cuenta y por IP; no abrir conexiones duplicadas innecesarias. La disponibilidad y los límites del servicio AIS Stream aplican.

## Cámaras y vídeo

OpenEye /v1/catalog/map aporta marcadores públicos y agrupados. Al seleccionar un marcador, la app consulta /v1/catalog/{id} para leer el tipo de medio, fecha de última imagen, atribución y destino correcto. Las cámaras live_video intentan abrir WebRTC/WHEP; si el proveedor no autoriza la inserción, requiere pago o no está disponible, se ofrece el visor oficial. Las imágenes fijas se muestran como imágenes, nunca se etiquetan como vídeo en directo.

Fuente técnica: https://openeye.cam/docs. WHEP puede tener facturación por segundo; la app no debe saltarse controles de acceso ni pagos.

## Veracidad de las capas

- Cada marcador procede de una respuesta del proveedor; no se inventan aeronaves ni buques.
- Se conservan fuente, identificador y hora de recepción cuando están disponibles.
- seen_pos ADS-B y los tiempos AIS ayudan a reconocer datos atrasados.
- Las posiciones pueden quedar obsoletas entre actualizaciones o por falta de receptores.
- Si un servicio falla, su capa informa el error sin apagar el resto del globo.

## Meteorología y sismos

- Meteorología: Open-Meteo entrega condiciones actuales para el punto central del globo. Se actualiza cada 10 minutos y al cambiar de región; no representa un mapa mundial de radar meteorológico.
- Terremotos: feed GeoJSON mundial de USGS de las últimas 24 horas, refrescado cada 5 minutos. Cada punto enlaza a su ficha oficial. La magnitud, profundidad y hora se muestran solo cuando están presentes en el registro.

## Incendios y focos térmicos

NASA FIRMS VIIRS NOAA-20 NRT se consulta por el rectángulo visible a través del mismo Worker, cada 15 minutos. Para activarlo, solicitar el MAP_KEY gratuito en https://firms.modaps.eosdis.nasa.gov/api/map_key y guardarlo como secret FIRMS_MAP_KEY en GitHub Actions. También crear VITE_FIRE_PROXY_URL con la dirección HTTPS del Worker terminada en /fires. Ejecutar Deploy GOD'S EYE AIS proxy y luego Build Android APK. Las detecciones son anomalías térmicas satelitales con hora de adquisición y confianza; no equivalen por sí solas a una confirmación de incendio.
