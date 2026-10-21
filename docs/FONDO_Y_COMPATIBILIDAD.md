# Fondo diferido y calendarios móviles — 21/oct/2026

## Cambio visual

Nueve trazos de ondas suaves, principalmente cian con un acento magenta, y veinte partículas tenues. Canvas 2D no interactivo, sin librerías, imágenes, fuentes externas, vídeo ni WebGL. Entrada por opacidad de 0 a 1 en 1.8 segundos, detrás de la interfaz, sin interceptar clics ni ocupar espacio de layout.

El módulo public/ambient.js no forma parte del JavaScript inicial. El build conserva la promesa de boot() como nyxBootReady y añade un cargador pequeño: espera la configuración/sesión y el formulario (o la portada estática), window.load, 1.2 segundos de calma y un turno de requestIdleCallback. Si no existe esa API, usa un temporizador adicional de 300 ms. No espera al efecto para habilitar el formulario.

No solicita el módulo con movimiento reducido, sin conexión, ahorro de datos o conexión 2G cuando el navegador expone esas preferencias. Safari no necesariamente expone información de red/ahorro: no se presume soporte universal de esa detección. Una pestaña oculta, una subida/procesamiento pendiente, el aviso legal o un campo de edición enfocado posponen/pausan el efecto. La vuelta de foco o el cambio de estado reanudan sin polling. Si se pierde o falla el módulo, se conserva la página funcional.

El dibujo usa como máximo unos 480,000 píxeles de canvas, 18 fotogramas por segundo como techo y reduce el trabajo a una imagen fija si detecta costes de dibujo altos repetidos. No es una promesa de CPU cero: el canvas dibuja tareas pequeñas en el hilo principal. Las necesidades de accesibilidad y los formularios tienen prioridad.

## Calendario

El enlace Google Calendar sigue el editor público documentado por Google; el visitante debe confirmar y, cuando corresponda, iniciar sesión. Es la vía recomendada aquí para Android: Google documenta la importación de archivos en ordenador, no como flujo directo de la app Android.

El enlace Apple / Outlook conserva el archivo estándar ICS, sin forzar download y con type=text/calendar, target=_blank y rel=noopener noreferrer. Netlify sirve ese archivo con Content-Type text/calendar; charset=utf-8 y Content-Disposition inline. Así el sistema puede manejarlo; no implica que todas las aplicaciones integradas o navegadores embebidos en redes sociales lo abran igual. El menú sugiere usar Safari o Chrome si no se abre. No se usa una suscripción webcal ni permisos OAuth.

No se cambian hora, zona ni fecha: 22/oct/2026 a las 19:00, America/Mexico_City (23/oct 01:00 UTC). La hora de fin sigue sin inventarse.

Fuentes:
- https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events
- https://support.google.com/calendar/answer/37118?hl=es&co=GENIE.Platform%3DAndroid
- https://support.apple.com/en-lamr/guide/iphone/iph3d1110d4/ios
- https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback
- https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API

## Verificación en esta revisión

12 pruebas Node aprobadas (test/ambient.test.mjs): espera del boot/load, fallback sin idle API, bajo consumo, movimiento reducido, foco, pestaña oculta, indicador de trabajo, presupuesto de tamaño, cabeceras de calendario y formato/horario del ICS.

Chromium local: 15 combinaciones de tres rutas y cinco viewports (320x568, 360x640, 390x844, 430x932, 1440x1000), sin desbordamiento inicial horizontal o vertical. Se comprobó además el fade gradual, pausa/reanudación de dibujo, formulario de texto/confirmación/anulación, menú de calendario, módulo fallido, canvas ausente, ahorro de datos y movimiento reducido. La foto se comprobó en selección inicial y simulación del estado de procesamiento, no en subida real.

El entorno bloqueó navegación HTTP: se utilizó un arnés DOM offline con HTML/CSS/JS reales, sustituyendo fetch e importación dinámica de forma explícita. No prueba las cookies, CSP/rutas HTTP desplegadas, Google real, importación nativa del calendario ni Safari/WebKit. No se ejecutó la suite histórica completa ni se probó un iPhone/Android físico. No se garantiza compatibilidad perfecta de todos los modelos/versiones.

Las fuentes reutilizadas de app.js, styles.css, pages.mjs e index.html se compararon con sus SHA de GitHub. Medición de cuerpos gzip locales, sin cabeceras/TLS/API/subida: inicio aproximado 11.9 KB; foto 12.5 KB; preguntas 12.5 KB. El renderer opcional es 6,201 bytes sin comprimir / 2,270 bytes gzip, y el cargador añade 1,049 bytes gzip al código inicial. La medición no es una captura de tráfico desde Netlify.

## Publicación

Publicar la nueva rama main mediante el flujo normal de build (npm run build, dist y Netlify Function). Este cambio no toca Apps Script, permisos, variables, fechas de borrado, recepción ni esquema de datos. No ejecutar setupProject ni migraciones. El commit omite autodespliegue con [skip netlify]; hace falta publicar deliberadamente en Netlify.
