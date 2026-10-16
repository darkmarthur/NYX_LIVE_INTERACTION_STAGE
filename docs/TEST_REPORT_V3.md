# Verificación UI móvil v3 · 16 de octubre de 2026

## Resultado ejecutado

`npm run build` completado con Node 22.16.0. Validación sintáctica JS/MJS, Code.gs y manifiesto JSON, banco de exactamente 100 preguntas distintas, HTML por ruta y activos versionados generados correctamente.

`node --test test/v3.test.mjs`: **30 pruebas aprobadas, 0 fallidas**. Son pruebas nuevas de esta revisión; no se presenta el informe histórico de 47 pruebas de v2 como una ejecución nueva del conjunto anterior. Se conservaron sus archivos en GitHub.

Cobertura nueva: bootstrap config/sesión en una llamada, cookie firmada, carga JPEG binaria, consentimiento/versiones, límites, CSRF/origen, aislamiento entre actores, protección de identificadores del servidor, deduplicación, retirada selectiva, compatibilidad JSON y retirada global anterior, backend Google antiguo sin fallback peligroso, HMAC, pendiente visible solo por opt-in, foto renombrada por fileId, otra fila preservada, reintento de anulación, errores de borrado sin éxito falso, bloqueo durante migración y presupuesto del build.

Las pruebas Apps Script ejecutan el Code.gs real en node:vm con Drive/Sheets simulados. No autorizan ni modifican la cuenta Google del propietario. Los módulos sin cambios shared/settings.mjs, shared/questions.mjs, server/jpeg.mjs y appsscript.json fueron comparados con los SHA de los blobs base.

## Chromium: interfaz y compresión reales, red simulada

El navegador de esta sesión bloqueó la navegación HTTP local. Se usó un arnés DOM offline con el HTML/CSS del build, código de interfaz real y sustitución explícita de fetch e importación de módulos. **No es una prueba end-to-end de HTTP, cookies, caché, routing Netlify ni Google real.**

18 combinaciones verificadas: /, /foto y /preguntas en 320×568, 360×640, 375×667, 390×844, 430×932 y 1440×1000. Sin desbordamiento horizontal ni vertical en el estado inicial de formulario, sin excepciones JS. Las 100 preguntas se comprobaron además a 320×568: ninguna produjo scroll con el teclado cerrado y tamaño normal de texto.

Consentimiento bloquea ENVIAR; respuesta enviada y recibida; pérdida simulada de confirmación tras guardar → COMPROBAR ENVÍO sin repetir el POST; anulación selectiva con confirmación; otro tipo de aporte intacto; estado anulado bloqueado; aviso completo cargado aparte y con scroll permitido.

Compresión: JPEG de ruido sintético 2400×1800 de varios MB → 1024×768, **202878 bytes** (~198.1 KiB), tanto en worker real OffscreenCanvas como en fallback Canvas real. Un único POST simulado de Content-Type image/jpeg por confirmación. El ruido es un caso difícil; este tamaño/resolución no es una garantía para fotos reales. Se verificó máximo de salida ≤384 KiB. HEIC, Safari/iOS físico, Android físico y EXIF de cámaras reales siguen pendientes de ensayo.

## Presupuesto estático medido en archivos

Suma HTML + CSS + JS inicial; gzip medido localmente por archivo:

| Ruta | Sin comprimir | Cuerpo gzip |
|---|---:|---:|
| / | 22286 bytes | 7845 bytes |
| /foto | 23138 bytes | 8238 bytes |
| /preguntas | 23023 bytes | 8234 bytes |

No incluye cabeceras HTTP, DNS/TLS, respuesta API, subidas, recursos de compresión cargados al elegir foto ni módulo del aviso legal. No es una medición de transferencia desde Netlify. Tres archivos estáticos y una petición API inicial por ruta; los módulos de foto/worker/aviso se solicitan solo al necesitarlos.

No hay fuentes remotas, imágenes de portada, videos, bibliotecas NPM de ejecución, WebGL, intervalos de polling ni efectos animados continuos. Se usa módulo diferido. La compresión trabaja fuera del hilo principal cuando el navegador lo permite; el fallback puede ocupar brevemente el hilo durante el dibujo, por lo que no se afirma JavaScript con bloqueo absolutamente cero.

## Pendiente antes de la función

Actualizar Code.gs y la implementación Google, desplegar Node/frontend juntos, revisar el aviso y probar una foto y una respuesta ficticias desde la URL real. Verificar entrada, reintento tras corte, retirada y reflejo en la carpeta local del show. Ensayar conexión lenta real, Safari/Android y la ráfaga esperada. Los tests no reproducen cuotas/latencia/cold starts/sincronización ni garantizan ejecución puntual de limpieza.
