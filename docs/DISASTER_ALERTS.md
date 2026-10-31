# Alertas globales de desastres

El módulo `src/services/DisasterWatcher.js` consulta fuentes oficiales:
- USGS: sismos de la última hora y eventos significativos recientes. Notifica M4.5 o superior en cualquier región, y M3.0 o superior dentro de 1.000 km de Candelaria, Misiones.
- NASA EONET: eventos abiertos de tormentas severas, incendios, volcanes e inundaciones.
- NOAA NHC: sistemas tropicales activos publicados por el centro de huracanes.
- NASA FIRMS: detecciones térmicas VIIRS NOAA-20 dentro del área regional, mediante el proxy `VITE_FIRE_PROXY_URL`. Una detección térmica no confirma por sí sola un incendio.

Los avisos se deduplican con identificadores persistidos en el dispositivo. En Android se usan canales locales `sismos-live` y `desastres-live`; al tocar una notificación con coordenadas válidas, el globo vuela hacia el evento.

## Frecuencia y límites

- En primer plano: consulta cada 60 segundos y al volver a abrir la app.
- En segundo plano: se registra Background Runner con una tarea periódica de 15 minutos para USGS, NASA EONET y NOAA. NASA FIRMS permanece en la consulta de primer plano porque requiere la URL del proxy configurada en el build.
- Android no garantiza un servicio de red permanente. El trabajo periódico administrado por el sistema tiene intervalos mínimos y puede retrasarse por Doze, ahorro de batería o restricciones del fabricante.
- La burbuja superpuesta sobre otras aplicaciones no está incluida: necesita un servicio Android y permiso especial de superposición. No se solicita ese permiso silenciosamente.

La placa tectónica no se inventa: la API USGS de este feed no entrega una identificación fiable de placa por evento. Para un aviso se muestran magnitud, lugar, profundidad, hora y coordenadas cuando están disponibles.
