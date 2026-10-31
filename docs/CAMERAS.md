# GOD'S EYE — cámaras públicas

La capa inicial consulta catálogos públicos oficiales de Fintraffic (Finlandia), TfL (Londres), Ontario 511 y Alberta 511 (Canadá), LTA (Singapur) y GeoNet (Nueva Zelanda).

## Reglas de publicación
- Solo se incorporan registros con identificador y coordenadas válidas.
- Se usan endpoints públicos documentados; no se evaden autenticación, bloqueos, cuotas ni controles de acceso.
- Las fuentes se consultan de forma independiente: un proveedor caído no bloquea los demás.
- Las respuestas se identifican como imagen fija cuando no existe una URL de vídeo verificable.
- La ficha muestra proveedor y enlace a la fuente oficial.
- No se incorporan cámaras privadas ni se guardan credenciales en el cliente.

## Limitaciones de esta primera integración
Los proveedores pueden bloquear peticiones desde navegadores mediante CORS, cambiar su formato o exigir claves. En esos casos el estado se informa como no disponible y se requiere un proxy autorizado del lado servidor. La presencia de un marcador no garantiza que el operador mantenga una imagen actualizada.

## Ampliaciones
DGT, Madrid, Irlanda, Islandia, Países Bajos, Caltrans, Nueva York, Oregón, DriveBC, Toronto, Suecia, Corea del Sur y Windy requieren adaptadores adicionales y, cuando corresponda, claves oficiales o revisión de condiciones de uso. Windy exige atribución visible, enlaces a su ficha/reproductor y una API key protegida; sus condiciones prohíben el escaneo intensivo y la redistribución de su contenido.
