# NYX · Live Interaction Stage

Interacción temporal para NYX Sonoro · Teatro Ocampo · 22 de octubre de 2026.

**Interfaz y protocolo v6; almacenamiento v2, sin nueva migración.** Fotos en la misma carpeta plana privada y respuestas en un Google Sheet independiente con exactamente las columnas `Pregunta` y `Respuesta`.

## Experiencia actual

- `/`: banner NYX SONORO / LIVE SET / PERFORMANCE, sin enlaces a formularios.
- `/foto?enable=true`: fotografía → consentimiento → enviar → confirmación → enviar otra o anular una concreta.
- `/preguntas?enable=true`: pregunta asignada por el servidor → idea → consentimiento → enviar → escribir otra.
- `MIS ENVÍOS`: historial privado de la sesión y de la ruta, paginado; permite anular cualquier aportación propia sin afectar las demás.
- Sin `?enable=true` no se aceptan nuevos envíos. Las retiradas propias continúan disponibles hasta la limpieza.
- Los términos se abren sin salir del formulario. El logo no navega al inicio; Instagram permanece en el footer y en la confirmación.

Se permiten varias fotos y respuestas por navegador **sin borrar las anteriores**. Cada nuevo intento tiene un identificador propio. Los reintentos del mismo envío son idempotentes y conservan pregunta y comprobante; una nueva intención puede enviar incluso el mismo contenido.

Sin login, nombres, galería de terceros, analítica ni IA externa. Borrar cookies, incógnito u otro navegador crean una sesión diferente y no permiten gestionar los aportes de la anterior. No se verifica una identidad personal.

## Actualización de una instalación existente

Leer [FINAL_FIX_V6.md](docs/FINAL_FIX_V6.md). **Primero actualizar Google, después publicar Netlify.** GitHub y Apps Script no se sincronizan automáticamente.

1. Reemplazar todo `Code.gs` en el proyecto Google existente con `apps-script/Code.gs` de este repositorio. No cambiar manifiesto ni propiedades.
2. Publicar una nueva versión de la misma implementación de Apps Script, conservando `/exec`.
3. Abrir `/exec` y comprobar `version: 2026-10-21-multi-v6`, `protocol: 6`.
4. Construir y publicar el nuevo código de Netlify desde `main`, con la configuración existente.

**No ejecutar `setupProject`, `migrateToFlatStorage` ni `purgeExpired`** sobre la instalación ya configurada. No crear otra carpeta o Sheet. No cambiar claves, IDs, fechas ni TERMS_VERSION. Este commit lleva `[skip netlify]`; no solicita publicación automática.

## Desarrollo y pruebas

Node.js 22 o posterior, sin dependencias NPM de ejecución:

```sh
npm run dev
# /foto?enable=true o /preguntas?enable=true en http://localhost:8888
node --test test/v6.test.mjs
npm run build
```

La demo local conserva referencias simuladas en memoria, no escribe en Google y usa fechas/aviso de prueba. Para ensayo con Google real: configurar un `.env` privado, construir y ejecutar `node --env-file=.env scripts/dev.mjs --live`, con SITE_ORIGIN local correspondiente.

Las pruebas históricas describen protocolos y diseños anteriores. El alcance de esta integración está en [TEST_REPORT_V6.md](docs/TEST_REPORT_V6.md). Los servicios simulados no sustituyen el ensayo en la URL real y teléfonos físicos.

## Arquitectura y seguridad

Frontend estático → Netlify Function `/api/*` → peticiones firmadas HMAC → Apps Script del propietario → Drive/Sheets privados. No usa Forms, S3, Supabase o Heroku.

`server/multi.mjs` conserva el núcleo de validación `server/app.mjs`; `netlify/functions/api.mjs` conserva `withErrorDiagnostics`. Google implementa `statusV6`, `submitV6` y `withdrawV6`. El bootstrap comprueba la versión real del receptor antes de habilitar formularios, incluso para usuarios nuevos.

El teléfono manda JPEG binario comprimido: objetivo 256 KiB, límite de salida 384 KiB, hasta 2048 px con reducción adicional si hace falta. La compresión se carga solo al seleccionar foto. Los fondos existentes son opcionales y diferidos. No se reenvía una foto automáticamente tras perder la confirmación: se consulta el mismo intento primero. Se requiere conexión al menos intermitente.

La cookie firmada es HttpOnly, SameSite=Strict y Secure en HTTPS. Solo el servidor deriva la identidad; no confía en nombres o IDs de archivo del cliente. Por intento se conserva en sessionStorage un identificador aleatorio, nunca fotos ni textos. Google guarda una propiedad privada por aporte, no una única lista creciente por participante.

La retirada de fotos utiliza fileId y soporta renombrarlas. Para textos, resuelve el comprobante ligado a la fila actual. Si falta ese vínculo en un aporte completo, no anuncia éxito ni elimina una fila arbitraria. El Sheet visible sigue teniendo dos columnas.

## Configuración

Build `npm run build`; publish `dist`; functions `netlify/functions`.

| Variable | Uso |
|---|---|
| APPS_SCRIPT_URL | URL /exec de la misma implementación Google |
| BRIDGE_SECRET | Secreto privado idéntico en Netlify y Google |
| SITE_ORIGIN | https://nyxsonoro.netlify.app sin slash final |
| TERMS_VERSION | 2026-10-15-v2, sin cambio de versión por este fix |
| PRIVACY_CONTROLLER, PRIVACY_ADDRESS, PRIVACY_EMAIL | Datos públicos y reales del responsable en el aviso |
| COLLECTION_OPEN, LEGAL_APPROVED | No son interruptores de recepción; se ignoran para la activación |

La URL `?enable=true` más el campo/encabezado explícito de la petición habilitan cada nuevo envío dentro de las fechas configuradas. Netlify valida cookie, origen, CSRF, consentimiento y tamaños antes de firmar `enableInteraction: true` para Google. El parámetro es público: no es contraseña ni cierre global; compartirlo permite participar.

No hay un límite programado de cantidad por participante en v6 y el cupo antiguo MAX_PER_KIND no afecta sus operaciones. **Google y Netlify conservan cuotas, capacidad y límites de disponibilidad.** No se promete infraestructura ilimitada. Completar el aviso y el contacto de privacidad sigue siendo responsabilidad de producción.

## Evento y limpieza

Las fechas existentes se mantienen: cierre predeterminado el 22 de octubre de 2026 a las 19:00 y limpieza desde el 23 de octubre de 2026 a las 10:00, hora de Ciudad de México. OPENS_AT, CLOSES_AT y PURGE_AT deben coincidir en ambos servicios.

`purgeExpired()` contempla la carpeta, el Sheet independiente y los registros v6. Debe verificarse su ejecución. No usar esos destinos para otros documentos. Una retirada en línea no elimina por sí sola lo que TouchDesigner ya cargó, las exportaciones o los historiales internos de proveedores. El equipo debe excluir y eliminar las copias locales bajo su control.

Los scripts de exportación y limpieza local anteriores siguen en el repositorio. La aplicación recolecta y prepara material; no genera por sí misma el poema ni los visuales.
