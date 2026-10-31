# GOD'S EYE — fuentes y precisión de datos

## Cámaras

- OpenEye public camera catalog: `https://api.openeye.cam/v1/catalog/map`. Consulta por rectángulo visible del globo; se filtran registros gratuitos (`is_free: true`). El catálogo distingue imagen fija y vídeo, y puede devolver agrupaciones según zoom. La disponibilidad de cada cámara depende del operador y debe confirmarse al abrirla.
- Fintraffic / Digitraffic: catálogo de cámaras meteorológicas y de carretera de Finlandia.
- Transport for London (TfL): cámaras de tráfico de Londres.
- Ontario 511 y Alberta 511: cámaras oficiales de carreteras de Canadá.
- data.gov.sg / LTA: imágenes oficiales de tráfico de Singapur.
- GeoNet: cámaras volcánicas de Nueva Zelanda.

Los proveedores oficiales se consultan de forma independiente. Un error CORS, una API caída o un cambio de formato se informa como fuente no disponible; nunca se fabrica un marcador. Los datos de cámaras se actualizan al cambiar el área visible y, mientras la capa está activa, cada minuto. Los límites reales de cada proveedor prevalecen sobre esta frecuencia.

OpenEye es un catálogo externo, no el operador de las cámaras. Un pin no garantiza que el stream siga activo. Se priorizan feeds gratuitos y se abre el recurso público del proveedor; no se eluden controles de acceso.

## Satélites

- CelesTrak GP/TLE para ISS y el grupo Starlink.
- `satellite.js` propaga los elementos orbitales y calcula una posición estimada en el instante actual. No es telemetría GPS directa. La precisión depende de la edad/calidad del TLE y de la propagación; se muestra como posición orbital calculada.
- TLE de Starlink se renueva cuando se activa la capa; las posiciones se recalculan cada 10 segundos. ISS usa su propio TLE y actualización visual periódica.

## Límites conocidos

- No existe una fuente única que garantice cámaras de vídeo en directo en cada país.
- Muchas cámaras públicas son snapshots que se actualizan cada segundos/minutos, no vídeo continuo.
- Windy Webcams API puede ampliar cobertura mundial, pero requiere una API key del titular, URLs de imagen temporales, atribución obligatoria y cumplimiento de límites y condiciones. No se usa sin una clave y autorización configuradas para GOD'S EYE.
- Google Photorealistic 3D Tiles requiere API key propia, API habilitada y facturación configurada; el mapa base actual tiene fallback OpenStreetMap.
