# NYX v4 — enlaces habilitados por parámetro y copy fijo

## URLs

- Portada solo marca: `https://nyxsonoro.netlify.app/`
- QR para participación verbal: `https://nyxsonoro.netlify.app/preguntas?enable=true`
- Invitación para foto: `https://nyxsonoro.netlify.app/foto?enable=true`
- Sin `?enable=true`: se muestra la recepción cerrada; el servidor también rechaza nuevos envíos.
- Instagram oficial (en footer y pantalla de éxito): `https://www.instagram.com/nyx.sonoro?obrf=MW0xaXA2OHoweHkwMw==`

Se conserva el nombre artístico **NYX Sonoro**; la única expresión en inglés es **Live Set / Performance**. Los demás textos de interfaz están en español.

## Cómo se valida la habilitación

1. El navegador valida exactamente una ocurrencia de `enable=true` en su URL.
2. `/api/bootstrap?enable=true` devuelve fase abierta solo si además se cumplen fechas y configuración legal.
3. Para la respuesta: `POST /api/answer?enable=true` lleva el campo booleano `enable_interaction: true`.
4. Para la foto: `POST /api/photo?enable=true` envía el JPEG comprimido con header `X-Nyx-Enable-Interaction: true`.
5. La Netlify Function comprueba **URL + campo/header + cookie + origen + CSRF + consentimiento + límites**, y envía `enableInteraction: true` firmado en HMAC al receptor.
6. Apps Script exige ese booleano firmado antes de escribir en Drive o Sheets. La propiedad antigua `COLLECTION_OPEN` no participa ni en Netlify ni en Apps Script.

**No es un secreto, autenticación ni apagado central.** Una persona puede añadir manualmente el query o compartir el enlace; retirar el parámetro de una invitación no invalida URLs anteriormente compartidas. Para revocar todas las URLs antes de `CLOSES_AT` necesitaríamos otro control administrativo o rotación. Las consultas de estado y anulaciones permanecen disponibles para quienes ya enviaron algo, con o sin el query.

## Actualizar tu instalación existente

1. En tu proyecto de Apps Script existente, reemplaza **solo** `Code.gs` desde `apps-script/Code.gs`; guarda. No borres las propiedades ni crees otra carpeta ni hoja.
2. Implementar → Administrar implementaciones → lápiz → **Nueva versión** → Implementar. Mantén la misma URL `/exec`.
3. Publica el commit v4 de `main` en Netlify utilizando la build normal (`npm run build`, carpeta `dist` más Netlify Function).
4. Conserva `APPS_SCRIPT_URL`, `BRIDGE_SECRET`, `SITE_ORIGIN` y `TERMS_VERSION=2026-10-15-v2`. El antiguo `COLLECTION_OPEN`, `LEGAL_APPROVED` y el formato de `PRIVACY_EMAIL` no son interruptores de activación. **Corrige el aviso legal y un correo real de contacto antes de recopilar datos personales**, aunque eso no bloquee el formulario.
5. Ensaya usando fotos/textos ficticios: sin query, con query equivocado, con query correcto, subida, confirmación y anulación. Revisa Drive/Sheet y comprueba que no aparece nada cuando falta habilitación.

**No ejecutes `setupProject`, `migrateToFlatStorage` ni `purgeExpired`.** No hay migración del esquema.

## Navegación y copy

La portada es un banner sin links a otras rutas. El logotipo es un elemento no clicable. Los formularios no ofrecen cambio de ruta. El enlace «términos» abre un aviso en la misma pantalla (dialogo modal), sin navegación interna, y puede cerrarse. El Instagram es el enlace externo explícitamente solicitado y abre en una pestaña nueva.

Textos visibles: 
- Home: **NYX SONORO.** / **LIVE SET / PERFORMANCE**
- Preguntas: **NYX SONORO LIVE SET.** / **Comparte una idea.**
- Foto: **¿QUÉ IMAGEN COMPARTIRÍAS CON TODO EL MUNDO?** / **Un recuerdo de tu celular a la pantalla grande.**
- Confirmación: **YA ERES PARTE.** / **ANULAR ENVÍO ANTERIOR** / **SÍGUENOS EN INSTAGRAM · NYX SONORO**

Se mantiene el límite de un aporte por tipo y navegador, el uso privado de Drive/Sheets, la eliminación programada y la compresión para señal débil.

## Calidad / alcance de pruebas

Hay pruebas unitarias de la doble bandera, duplicación de query, autenticación de la sesión, envíos de ambos tipos, retirada sin query, copy y ausencia de enlaces internos. La integración real con Google y Netlify requiere una comprobación después de publicar, antes de usarlo con asistentes.
