# Verificación del MVP · 8 de octubre de 2026

## Ejecutado

- Node.js 22.16.0: `npm test` → **19 pruebas aprobadas, 0 fallidas**.
- `npm run build` → validación correcta de JavaScript, manifiesto de Apps Script, archivos del frontend y banco de exactamente 100 preguntas distintas.
- Se verificaron los SHA de los blobs de los módulos y pruebas locales frente a los almacenados en GitHub; no se probaron versiones alternativas del backend.

Las pruebas cubren asignación estable de preguntas, consentimiento obligatorio, validación de texto/JPEG, deduplicación, separación entre navegadores, cookie firmada, CSRF, ventana de recepción, retirada, errores sin confirmaciones falsas, firma HMAC Node → Apps Script, cupo, bloqueo y limpieza con protección de carpeta y reintento ante fallos.

## Interfaz comprobada

Chromium con viewport de escritorio 1440×1000 y móvil 390×844, en un arnés DOM sin conexión con `fetch` simulado:

- Portada, preguntas, carga de foto y aviso legal se renderizan.
- Los botones de respuesta y foto permanecen deshabilitados hasta aceptar los términos.
- Envío de respuesta y pantalla de comprobante.
- Una imagen sintética de 3200×2400 se convierte en JPEG de 2048 px de lado mayor antes del envío.
- Previsualización propia y un único request de foto al confirmar.
- Las rutas de participación y legal no desbordan horizontalmente el viewport móvil.
- Sin excepciones JavaScript durante esas pruebas.

El arnés aísla el renderizado y los eventos del formulario; **no constituye una prueba end-to-end de navegación HTTP, cookies en un sitio publicado, Netlify ni Google**. Los servicios de Google de las pruebas automatizadas también son simulados.

## Pendiente antes del evento

La integración real necesita implementar Apps Script y autorizarlo con la cuenta propietaria; configurar el secreto y demás variables en Netlify; completar y revisar el aviso de privacidad; activar la recepción en ambos servicios y ensayar el circuito completo con datos ficticios. No se ha creado ni activado un sitio de producción o una colección en Google desde esta entrega.

Prueba en teléfonos iOS/Android reales (incluido HEIC), una ráfaga de envíos, moderación, sincronización, exportación para TouchDesigner, retirada con copia local y borrado definitivo. Las pruebas de lógica y la previsualización no garantizan disponibilidad del proveedor ni ejecución puntual de disparadores.
