# NYX · Live Interaction Stage

Interacción temporal para NYX Sonoro · Teatro Ocampo · 22 de octubre de 2026.

**Interfaz móvil v4; almacenamiento v2 (sin nueva migración).** Fotos en una carpeta plana privada y respuestas en un Google Sheet independiente con exactamente `Pregunta` y `Respuesta`.

## Experiencia

- `/`: banner estático **NYX SONORO / LIVE SET / PERFORMANCE**, sin enlaces a formularios.
- `/foto?enable=true`: fotografía → consentimiento → enviar → anular esa foto.
- `/preguntas?enable=true`: pregunta asignada → idea → consentimiento → enviar → anular esa respuesta.
- Sin `?enable=true` las rutas son de solo lectura: el servidor rechaza nuevos envíos.
- `/legal`: aviso legal completo accesible directamente. Los términos de los formularios se abren en una ventana sin salir de la ruta.
- Instagram @nyx.sonoro aparece siempre en el footer y en el mensaje de envío recibido. Es el único enlace de difusión.

Una foto y una respuesta **activas** por navegador. Al anular una contribución puedes enviar otra del mismo tipo; el otro aporte no se altera. Sin login, nombres, galería, analítica ni IA externa. Borrar cookies, cambiar de navegador o usar incógnito permite otra identidad; no es una verificación por persona.

## Actualización desde tu instalación existente

Lee [ACTIVACION_URL_V4.md](docs/ACTIVACION_URL_V4.md) y [UI_MOVIL_V3.md](docs/UI_MOVIL_V3.md) para detalles del diseño base. **No ejecutes `setupProject()` ni `migrateToFlatStorage()` si ya tienes STORAGE_VERSION=2.** Solo reemplaza `Code.gs` y publica una nueva versión de la misma implementación de Google cuando vayas a activar el cambio. No cambia el manifiesto, el secreto, las carpetas, el Sheet, los scopes, las fechas ni TERMS_VERSION.

El commit de esta entrega utiliza `[skip netlify]`; no solicita despliegue. El sitio publicado sigue separado del código del repositorio. No publiques el frontend v4 sin actualizar **ambos** backends (Netlify y Apps Script).

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
| LEGAL_APPROVED | Referencia administrativa opcional; **no es un interruptor** de interacción en v4 |
| COLLECTION_OPEN | **Obsoleta en v4: se ignora tanto en Netlify como en Apps Script.** No es necesario modificarla para abrir o cerrar las rutas. |

Se pueden sobreescribir EVENT_ID, OPENS_AT, CLOSES_AT, PURGE_AT en ambos servicios, siempre con valores iguales. Predeterminados: apertura 8/oct/2026; cierre 22/oct/2026 19:00; limpieza desde 23/oct/2026 10:00, Ciudad de México. Sin conexión técnica real (SITE_ORIGIN, APPS_SCRIPT_URL, BRIDGE_SECRET), el sitio no confirma envíos falsos. `LEGAL_APPROVED` y la validación del formato de `PRIVACY_EMAIL` **no bloquean** el formulario. La URL `?enable=true` controla exclusivamente la habilitación, con los límites técnicos, consentimiento y fechas vigentes. **Revisa y completa el aviso de privacidad antes de recibir aportaciones reales**, aunque el sistema no lo impida.

Netlify Free conserva sus cuotas y disponibilidad de proveedor. No se contrataron servicios ni se promete gratuidad ilimitada.

## Show y limpieza

Sincroniza la carpeta plana y márcala disponible sin conexión. TouchDesigner puede leerla directamente; verifica que las fotos hayan terminado de sincronizar. El Sheet se abre por separado. No hay aprobación ni organización obligatoria de carpetas. La falta de moderación previa permite que lleguen aportes inadecuados: conserva la capacidad de excluir contenido.

Los scripts de exportación y limpieza local de v2 siguen disponibles. El programa no genera el poema ni los visuales.

El disparador `purgeExpired()` intenta borrar definitivamente la carpeta dedicada y el Sheet externo desde PURGE_AT, y elimina registros de Script Properties. Debe verificarse su ejecución. No uses esos destinos para otros documentos. Las copias locales, exportaciones, cachés y respaldos bajo tu control también deben eliminarse; ni el script ni la web garantizan borrado inmediato de respaldos internos de proveedores.

## Apertura mediante URL (v4)

El propio enlace define si una ruta recibe nuevas participaciones: `https://nyxsonoro.netlify.app/foto?enable=true` y `https://nyxsonoro.netlify.app/preguntas?enable=true`. El parámetro debe tener exactamente el valor minúsculo `true` una sola vez. `?enable=TRUE`, `?enable=1` o parámetros ausentes no habilitan. No hace falta cambiar `COLLECTION_OPEN`.

El navegador incluye `?enable=true` en la petición hacia `/api/answer` o `/api/photo` y además transmite `enable_interaction: true` en JSON para texto o `X-Nyx-Enable-Interaction: true` para JPEG binario. Netlify valida ambos antes de enviar y transmite el booleano firmado `enableInteraction: true` a Apps Script, que lo comprueba antes de escribir. Otras rutas solo permiten consultar y anular aportaciones propias aunque no tengan la bandera, para no bloquear la retirada de consentimiento.

**Esto no es una contraseña ni un sistema de cierre global.** Cualquiera con el enlace habilitado puede participar. Como el parámetro se puede copiar o volver a añadir, **quitarlo del QR no cancela enlaces ya compartidos ni cierra el endpoint públicamente**: para un cierre global inmediato habría que añadir un control administrativo aparte. Se mantienen las fechas `CLOSES_AT`, `PURGE_AT`, límites, cookies, validación y el consentimiento, y la desactivación manual ya no se usa. Mantén la protección antiabuso propia del evento.

Los enlaces a términos funcionan dentro de un diálogo modal; el logo no navega al home. El enlace externo a Instagram es la excepción intencional a la navegación fija. Enviar nuevas fotos o respuestas requiere conexión, aunque el frontend siga siendo ligero.
