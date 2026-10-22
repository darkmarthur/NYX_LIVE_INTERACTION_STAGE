# NYX v6 — varios envíos y anulación individual

## Cambios integrados

Una sesión puede enviar varias fotos y respuestas sin anular las anteriores. Cada aporte tiene un comprobante propio; MIS ENVÍOS muestra únicamente el historial de ese navegador y de esa ruta, en páginas de 20. ENVIAR OTRA FOTO y ESCRIBIR OTRA IDEA crean un nuevo intento; reintentar el mismo intento por mala señal no crea otro archivo o fila.

El Sheet conserva exactamente las columnas Pregunta y Respuesta. Las fotos siguen en la misma carpeta plana privada. No se crean pestañas ni carpetas nuevas. El nuevo receptor reconoce las aportaciones anteriores sin ejecutar una migración.

La anulación de texto localiza la fila actual por los metadatos del comprobante, no por su texto ni por un índice guardado. Acepta el caso de metadatos que omiten sheetId=0, sin inferir IDs no nulos. Si no puede localizar una fila de un envío completo con seguridad, devuelve ROW_NOT_FOUND sin anunciar un borrado falso ni eliminar otras filas. Las anulaciones son individuales e idempotentes.

No hay un límite programado de cantidad por participante para las operaciones v6; MAX_PER_KIND del protocolo anterior no limita v6. Sí continúan los límites de tamaño, las fechas y las cuotas/capacidad de los proveedores. La infraestructura no es ilimitada.

## Publicación: primero Google, después Netlify

El commit incorpora el código al repositorio; no actualiza automáticamente el proyecto de Apps Script. Lleva [skip netlify] y no solicita un despliegue de producción.

1. En el mismo proyecto de Google Apps Script, reemplazar TODO Code.gs por apps-script/Code.gs de esta revisión y guardar. Mantener appsscript.json y todas las propiedades.
2. Implementar → Administrar implementaciones → editar la implementación existente → Nueva versión → Implementar. Mantener la misma URL /exec.
3. Al abrir /exec debe aparecer {"ok":true,"service":"NYX","version":"2026-10-21-multi-v6","protocol":6}. Esto identifica la versión; no prueba una subida real.
4. Publicar el nuevo main de Netlify mediante su build normal: npm run build, carpeta dist y Netlify Function. No cambiar APPS_SCRIPT_URL si se conservó la implementación existente.
5. Ensayar desde el mismo navegador: dos respuestas sin anular, anular la primera y conservar la segunda; dos fotos sin anular, anular una y conservar la otra; recargar, comprobar estados y enviar un aporte nuevo.

NO ejecutar setupProject, migrateToFlatStorage ni purgeExpired. No borrar propiedades ni datos existentes. No se requieren nuevas variables.

## URLs y seguridad conservadas

/foto?enable=true y /preguntas?enable=true habilitan la recepción dentro de las fechas configuradas. Sin ese parámetro se rechazan los nuevos envíos. Las consultas y anulaciones propias siguen disponibles hasta la limpieza, aunque el enlace no incluya el parámetro. No se introducen interruptores manuales: COLLECTION_OPEN y LEGAL_APPROVED siguen sin controlar la apertura.

Se conservan cookies firmadas, HttpOnly/SameSite, origen, CSRF, consentimiento, tamaños máximos y HMAC entre Netlify y Google. El query no es una contraseña: cualquiera puede compartir un enlace habilitado. El historial no devuelve respuestas, fotos, IDs de Drive ni información de otras sesiones.

La API verifica el protocolo de Google antes de habilitar los formularios incluso para navegadores nuevos. Un receptor antiguo produce UPDATE_REQUIRED en vez de permitir un envío incompatible. El código anterior del receptor se conserva para la transición de la web v5.

## Implementación

server/multi.mjs reutiliza el núcleo de autenticación y validación de server/app.mjs. Las operaciones firmadas nuevas son statusV6, submitV6 y withdrawV6. La entrada Netlify conserva withErrorDiagnostics y usa createMultiApp. scripts/dev.mjs ofrece la demo múltiple local.

El cliente conserva en sessionStorage solo una clave aleatoria por intento, nunca la foto o el texto. Google deriva el comprobante con HMAC ligado a actor, tipo e intento. Cada aporte se guarda en una propiedad privada NYX_ITEM_…, evitando una lista creciente dentro de una sola propiedad. La limpieza programada incluye esos registros.

La fecha de cierre y limpieza sigue siendo la de las propiedades existentes. La retirada de una fila activa o un archivo no borra automáticamente las copias locales del show ni los historiales internos del proveedor: el equipo debe atenderlos.

## Verificación

Consultar TEST_REPORT_V6.md para el alcance ejecutado. Comando de pruebas nuevas: node --test test/v6.test.mjs. Antes de producción, ejecutar npm run build y completar el ensayo real anterior. Las pruebas simuladas no prueban credenciales, permisos, latencia ni cuotas de Google reales.
