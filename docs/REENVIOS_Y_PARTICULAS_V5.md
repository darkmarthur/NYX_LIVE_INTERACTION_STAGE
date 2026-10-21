# NYX v5 — corregir aportaciones, envío visible y partículas

## Cambios

Se permite una fotografía y una respuesta **activas** por navegador. Anular una aportación elimina su archivo/fila y permite enviar otra del mismo tipo mientras la recepción siga abierta. No cambia la pregunta asignada ni afecta a la otra aportación. Las cancelaciones ya guardadas por versiones anteriores también son reutilizables, sin borrar cookies ni migrar datos.

La nueva interfaz ofrece ENVIAR OTRA FOTO o ESCRIBIR OTRA IDEA después de anular. El nuevo formulario exige seleccionar contenido y aceptar otra vez el consentimiento. La anulación debe confirmarse antes de permitir la sustitución. Se eliminaron los textos de bloqueo permanente del flujo y del aviso.

El overlay cubre toda la página durante envío, consulta de estado y anulación. Muestra una animación de 24 partículas, ENVIANDO / COMPROBANDO / ANULANDO y No cierres esta página. Bloquea taps, clics, foco y navegación por los enlaces internos de la página; se libera tanto al terminar como al fallar. Después de 12 segundos muestra un mensaje de espera sin inventar un porcentaje. No intenta secuestrar el botón Atrás mediante entradas de historial. beforeunload solo se instala mientras hay una solicitud activa: los navegadores móviles pueden cerrar o suspender la aplicación sin llamar a ese evento.

El fondo anterior de ondas se sustituye por partículas transportadas en un campo de flujo con remolinos y estelas. Usa Canvas 2D, 160–320 partículas, máximo 18 fps y ~480000 píxeles internos. Mantiene la carga después de la interfaz, window.load y un turno de calma; entra con fade de 1.8 segundos. Se pausa al escribir, enviar, abrir el aviso o esconder la pestaña. Se omite con movimiento reducido y ahorro de datos/2G cuando el navegador informa esas preferencias. No añade imágenes, fuentes, vídeo, WebGL ni dependencias. El spinner no espera al módulo de fondo.

## Protección de reintentos

No basta con quitar la condición WITHDRAWN: un POST viejo podría volver a guardar una foto anulada. Por ello cada sustitución lleva el comprobante cancelado en replacesReceipt (o X-Nyx-Replaces para foto binaria). Netlify valida el formato y lo firma con la petición. Google solo permite sustituir ese comprobante; genera un recibo nuevo y reserva el envío bajo bloqueo. Los reintentos del mismo envío no crean duplicados.

Las anulaciones nuevas incluyen el recibo actual. Un request de anulación tardío o desde una pestaña antigua no elimina el reemplazo. Los conflictos devuelven STALE y piden recargar. Nunca se confía en nombres de archivo, IDs de Drive o identidades elegidos por el visitante. El cupo cuenta únicamente aportes activos o pendientes; cancelar libera el lugar.

## Activar en tu instalación

1. En el **mismo proyecto de Apps Script**, reemplaza todo Code.gs por apps-script/Code.gs de esta versión y guarda. No añadas el archivo como un segundo código duplicado.
2. Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar. Conserva la misma URL /exec. Al abrirla debe devolver version: 2026-10-21-resend-v5. Esa respuesta identifica la versión, no prueba una subida.
3. Publica la versión nueva de main en Netlify con npm run build, carpeta dist y la Netlify Function. Ambos backends deben actualizarse: solo cambiar el frontend no basta.
4. Usa /foto?enable=true y /preguntas?enable=true. Prueba envío → anular → nueva aportación, comprobando que queda solo un archivo/fila y que la otra ruta no cambia.

**No ejecutes setupProject, migrateToFlatStorage ni purgeExpired.** No hace falta ejecutar funciones manuales. diagnosticarNYX queda disponible únicamente como comprobación opcional de solo lectura. Conserva appsscript.json, BRIDGE_SECRET, IDs, términos, fechas, permisos, hoja y carpeta. No hay migración ni nuevos servicios.

El commit usa [skip netlify] para evitar publicar una interfaz nueva antes de actualizar Google. No se modifica automáticamente tu implementación Google ni los datos reales. La actualización del receptor se hace antes de desplegar la web. Si hay varias implementaciones, actualiza la que figure en APPS_SCRIPT_URL.

## Verificación ejecutada

Se ejecutó npm run build con Node 22.16.0 y 52 pruebas específicas: 44 del Code.gs real en VM con Google simulado y 8 de la API y firma. Cubren consentimiento, URL habilitada, contenido, cookies/CSRF/origen, límites, borrado, reenvío, tres ciclos de corrección, deduplicación, pérdida de confirmación, antigua anulación que no borra un reemplazo y liberación de cupo. Los scripts y sus resultados están incluidos en el paquete de verificación entregado con esta actualización.

Chromium: 15 combinaciones de 3 rutas y 5 viewports (320×568, 360×640, 390×844, 430×932 y 1440×1000), sin overflow inicial. Probados los ciclos de foto y texto, el overlay, su bloqueo de enlaces/foco, los errores de red, respuesta incierta sin nuevo POST automático, compresión real de foto en fallback Canvas, reducción de movimiento y fallo de canvas. Las solicitudes e importaciones se simularon expresamente en un arnés DOM local; no es un ensayo HTTP de Netlify, CSP de servidor, cookies del navegador, Google real ni dispositivos físicos iOS/Android.

No se presenta esto como ejecución de la suite histórica completa. Las suites antiguas conservan algunas expectativas del comportamiento anterior (por ejemplo, prohibir reemplazos o cualquier URL externa); no constituyen validación de v5.

Tamaño inicial medido localmente por cuerpos gzip: portada 13442 bytes, foto 14082 y preguntas 14028; no incluye cabeceras, TLS, API ni carga de la foto. El fondo opcional se descarga después. Esta entrega mejora la espera y evita clics repetidos, no garantiza que Apps Script o la red guarden más rápido.
