# Corrección de envío y selector móvil — 21/oct/2026

## Evidencia y límites
Se consultó el despliegue de producción: b119d45, listo, publicado a las 22:30 UTC. Tres POST a /api/photo?enable=true a las 22:32:25, 22:32:41 y 22:36:12 UTC devolvieron HTTP 409 en unos 2.8–3.7 segundos. No eran envíos confirmados. Los registros anteriores no incluyen el código del cuerpo; por ello NO se determina si el motivo exacto fue STALE, FULL o WITHDRAWN. No se pudo consultar el endpoint público de Google desde el entorno. No se usaron aportaciones reales en las pruebas.

## Corrección
El recuadro de selección es un botón HTML completo, con el input nativo como hermano, no un input transparente superpuesto a una etiqueta. El botón abre sincrónicamente el selector durante el gesto del usuario. El signo +, título, texto, bordes y áreas vacías comparten el mismo controlador. Se desactiva durante procesamiento/envío.

Al rechazar o no confirmar el envío se retira el spinner y se muestra un aviso centrado persistente. Muestra el mensaje del servidor y una referencia técnica, permite volver sin descartar la selección y, ante estado incierto o STALE, comprobar el estado sin repetir el POST. No se anuncia éxito sin un comprobante válido.

Al comprobar un envío anterior anulado se conserva la nueva foto/texto y se actualiza el comprobante de sustitución desde la sesión del servidor. Solo otro clic explícito vuelve a enviar. La protección contra anulaciones/reintentos antiguos sigue intacta. La respuesta puede indicar un límite o un receptor anterior; no se eluden esas validaciones.

La función de Netlify registra solamente categoría de error y HTTP status; no registra fotos, textos, cookies, claves ni identificadores del participante.

## Activación
Publicar la nueva versión de main en Netlify (build y Function). No modificar Apps Script, variables, fechas, carpeta ni Sheet para esta corrección. Los enlaces con ?enable=true no cambian. Después de publicar, recargar la página abierta para no seguir ejecutando el JavaScript anterior. Si reaparece un rechazo, el nuevo aviso muestra su referencia en lugar de desaparecer sin explicación.

## Pruebas ejecutadas
Build Node 22 correcto. 57 pruebas específicas aprobadas: 52 de API/receptor v5 tomadas del paquete de verificación anterior y 5 nuevas de errores, privacidad de logs y selector. No se ejecutó la suite histórica completa con expectativas antiguas.

20 comprobaciones en Chromium: 7 zonas táctiles en cada uno de 3 tamaños (320×568, 390×844, 430×932); 7 tipos de rechazo/fallo para cada formulario; conciliación de STALE preservando la selección; ciclos enviar/anular/reenviar de foto y texto y bloqueo del overlay. Compresión JPEG real mediante Canvas; fetch e importaciones simuladas en un arnés DOM offline. No es una prueba de Google/Netlify real, de cookies HTTP ni de Safari/iPhone/Android físico. El problema del área táctil original no se reprodujo en Chromium; el nuevo controlador elimina la superposición frágil y se verificó por coordenadas.

Cuerpos iniciales gzip medidos localmente: foto 15560 bytes y preguntas 15491 bytes. Sin nuevas dependencias ni peticiones iniciales. Los scripts y resultados de la prueba de navegador se entregan en el paquete de evidencia.
