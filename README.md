# NYX · Live Interaction Stage

Interacción temporal para NYX Sonoro · Teatro Ocampo · 22 de octubre de 2026.

**Interfaz móvil v3; almacenamiento v2 (sin nueva migración).** Fotos en una carpeta plana privada y respuestas en un Google Sheet independiente con exactamente `Pregunta` y `Respuesta`.

## Experiencia

- `/foto`: elegir imagen → consentimiento → enviar → confirmación → anular esa foto.
- `/preguntas`: una de 100 preguntas asignada en servidor → respuesta → consentimiento → enviar → confirmación → anular esa respuesta.
- `/`: acceso a ambas piezas; usa los enlaces directos anteriores en invitaciones/QR para evitar esta elección.
- `/legal`: aviso completo, contacto y enlaces para gestionar aportaciones.

Una foto y una respuesta por navegador. Anular **no habilita otro envío** y no afecta al otro tipo de aporte. Sin login, nombres, galería, analítica ni IA externa. Borrar cookies, cambiar de navegador o usar incógnito permite otra identidad; no es una verificación por persona.

## Actualización desde tu instalación existente

Lee [UI_MOVIL_V3.md](docs/UI_MOVIL_V3.md). **No ejecutes `setupProject()` ni `migrateToFlatStorage()` si ya tienes STORAGE_VERSION=2.** Solo reemplaza `Code.gs` y publica una nueva versión de la misma implementación de Google cuando vayas a activar el cambio. No cambia el manifiesto, el secreto, las carpetas, el Sheet, los scopes, las fechas ni TERMS_VERSION.

El commit de esta entrega utiliza `[skip netlify]`; no solicita despliegue. El sitio publicado sigue separado del código del repositorio. No publiques el frontend v3 con un backend Node anterior.

## Desarrollo local

Node.js 22 o posterior, sin dependencias NPM de ejecución:

```sh
npm run dev
# http://localhost:8888
npm test
npm run build
```

`npm run dev` construye `dist/` y sirve una **DEMO LOCAL** que solo guarda referencias simuladas en memoria. No sube archivos ni respuestas a Google. Reiniciarla elimina ese estado. Sus ventanas se abren artificialmente y su aviso es de ejemplo; no uses datos personales reales.

Para un ensayo local con Google real: completa un `.env` privado a partir de `.env.example`, ejecuta `npm run build` y luego `node --env-file=.env scripts/dev.mjs --live`. SITE_ORIGIN debe coincidir con `http://localhost:8888` para ese ensayo. No cambies la configuración de producción por error.

## Arquitectura

La página estática sirve HTML significativo antes de ejecutar el módulo JS. Netlify Function `/api/*` valida sesión, origen, CSRF, consentimiento y límites; firma los requests hacia Apps Script. Apps Script, ejecutado por el propietario, escribe en Drive/Sheets privados. No se usa Netlify Forms, S3, Supabase ni Heroku.

`/api/bootstrap` reúne configuración + sesión en una petición. Para una identidad nueva no consulta Google todavía; para un navegador que vuelve, consulta el estado real de sus aportes. El banco de preguntas no se descarga al teléfono.

La foto se reduce en el teléfono: máximo 2048 px, objetivo 256 KiB, límite de salida 384 KiB; puede reducir resolución/calidad para cumplirlo. Se sube como JPEG binario, no como JSON/base64 desde el teléfono. El transporte firmado hacia Google conserva la compatibilidad del receptor. HEIC solo si el navegador puede decodificarlo.

La compresión se carga al elegir una foto y usa un worker con OffscreenCanvas cuando es compatible; existe fallback Canvas asíncrono, con tareas de dibujo en el hilo principal. No se afirma bloqueo cero en todos los móviles. No hay WebGL, videos, fuentes remotas, animaciones continuas, polling ni service worker. Un corte de señal no dispara automáticamente otra subida: permite comprobar si el primer envío llegó.

`npm run build` genera HTML por ruta y activos en `dist/assets/<hash>/`. Esos activos tienen caché larga; las respuestas API son privadas/no-store. `dist/build-report.json` informa tamaños sin cabeceras/TLS/API. Lee el alcance real de las pruebas en [TEST_REPORT_V3.md](docs/TEST_REPORT_V3.md).

## Identidad y anulación

La cookie `nyx_participant` es aleatoria, firmada, HttpOnly, SameSite=Strict y Secure en HTTPS. El servidor deriva el actor; ignora IDs, nombres de archivo o supuestas identidades enviados por el cliente.

El backend conserva un pequeño registro privado en Script Properties: actor → comprobante y fileId de Drive / comprobante de la fila. El nombre de cada JPEG lo asigna Google como `NYX-<UUID>.jpg`. El identificador real de Drive permite anular aunque se renombre el archivo. Para respuestas se usan metadatos ligados a la fila, no una columna ni una pestaña extra.

La nueva operación interna `withdrawOne` solo afecta `photo` o `text`. Un Google backend v2 sin actualizar rechaza esa operación: **nunca se intenta la retirada antigua de ambos tipos como fallback**. La operación antigua se conserva únicamente para clientes antiguos que pidan expresamente retirada global.

El borrado de la fila activa no implica eliminación instantánea de su historial en Google. Las retiradas no eliminan por sí solas copias locales del show o capturas; el equipo debe excluirlas y verificar sincronización.

## Nueva instalación de Google

Crea un proyecto independiente en Apps Script, pega `apps-script/Code.gs` y `apps-script/appsscript.json`, agrega una clave aleatoria privada `BRIDGE_SECRET` de al menos 32 caracteres a Propiedades del script, ejecuta `setupProject()` y autoriza. Se crean la carpeta plana privada y el Sheet fuera de ella. `showSetup()` muestra enlaces sin mostrar la clave.

Publica como aplicación web, ejecutar como yo, acceso cualquier persona, y conserva la URL `/exec`. Los visitantes no autorizan Google; el receptor exige firma del backend. Políticas Workspace pueden restringir aplicaciones anónimas.

Para instalaciones v1 usa primero [ACTUALIZAR_A_V2.md](docs/ACTUALIZAR_A_V2.md); para v2 ya migrada no la repitas.

## Configuración de Netlify

Build: `npm run build`. Publish: **`dist`**. Functions: `netlify/functions`.

Variables privadas con alcance Functions (o all):

| Variable | Valor |
|---|---|
| APPS_SCRIPT_URL | URL `/exec` del proyecto Google |
| BRIDGE_SECRET | El mismo secreto de Google, nunca en el repositorio |
| SITE_ORIGIN | `https://nyxsonoro.netlify.app`, sin slash final |
| TERMS_VERSION | `2026-10-15-v2` (no cambia con la UI) |
| PRIVACY_CONTROLLER | Responsable real; se publica en el aviso |
| PRIVACY_ADDRESS | Domicilio real del aviso; se publica |
| PRIVACY_EMAIL | Correo atendido de privacidad; se publica |
| LEGAL_APPROVED | `true` solo después de revisar aviso y protocolo |
| COLLECTION_OPEN | `true` para recibir; también debe ser true en Google |

Se pueden sobreescribir EVENT_ID, OPENS_AT, CLOSES_AT, PURGE_AT en ambos servicios, siempre con valores iguales. Predeterminados: apertura 8/oct/2026; cierre 22/oct/2026 19:00; limpieza desde 23/oct/2026 10:00, Ciudad de México. Sin configuración real, el sitio muestra preparación y no confirma envíos falsos.

Netlify Free conserva sus cuotas y disponibilidad de proveedor. No se contrataron servicios ni se promete gratuidad ilimitada.

## Show y limpieza

Sincroniza la carpeta plana y márcala disponible sin conexión. TouchDesigner puede leerla directamente; verifica que las fotos hayan terminado de sincronizar. El Sheet se abre por separado. No hay aprobación ni organización obligatoria de carpetas. La falta de moderación previa permite que lleguen aportes inadecuados: conserva la capacidad de excluir contenido.

Los scripts de exportación y limpieza local de v2 siguen disponibles. El programa no genera el poema ni los visuales.

El disparador `purgeExpired()` intenta borrar definitivamente la carpeta dedicada y el Sheet externo desde PURGE_AT, y elimina registros de Script Properties. Debe verificarse su ejecución. No uses esos destinos para otros documentos. Las copias locales, exportaciones, cachés y respaldos bajo tu control también deben eliminarse; ni el script ni la web garantizan borrado inmediato de respaldos internos de proveedores.
