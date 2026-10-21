# Evento visible y calendario · 21 de octubre de 2026

Todas las rutas muestran un bloque compacto con NYX SONORO, Teatro Ocampo · Cuernavaca, 22 de octubre de 2026 · 19:00 h y AÑADIR AL CALENDARIO. Está fuera de `#piece`: no desaparece al enviar o anular una aportación. No cambia la navegación entre formularios ni el mecanismo `?enable=true`.

El indicador relativo usa la fecha de America/Mexico_City: MAÑANA solo el 21/oct; HOY el 22/oct; después no muestra un indicador relativo. La fecha absoluta permanece. Se actualiza al cargar, volver a la pestaña y en los dos cambios de medianoche del evento, sin sondeo de red. Como cualquier reloj local, depende de que el dispositivo tenga una fecha razonable.

## Guardar en calendario

AÑADIR AL CALENDARIO despliega dos enlaces sin librerías:
- Google Calendar: editor con los datos precargados. El visitante confirma y guarda en su cuenta; no solicitamos permisos ni creamos eventos automáticamente.
- Apple / Outlook (.ics): archivo estándar de 567 bytes, generado al construir la web; el visitante lo abre/importa y confirma según su aplicación.

El inicio confirmado es 22/oct/2026 19:00 Ciudad de México, equivalente a 23/oct 01:00 UTC. No se inventó una hora de fin: el ICS incluye DTSTART y omite DTEND/DURATION; el enlace Google prepara un evento de inicio sin bloque de duración. La descripción avisa que no se ha especificado la hora de término. La persona puede ajustar la duración o los avisos al guardarlo.

Fuentes técnicas: https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events y https://www.rfc-editor.org/rfc/rfc5545.html

## Publicación

Solo se cambian frontend y build. No se modifica `apps-script/Code.gs`, su manifiesto, los registros ni las funciones de recepción. No necesitas volver a copiar código a Google, ejecutar una migración, modificar variables o crear otra implementación.

Publicar el commit nuevo de main con la configuración existente (`npm run build`, `dist`, Netlify Function). El archivo ICS también se genera dentro de dist. Un despliegue bloqueado en Netlify debe desbloquearse/publicarse para que aparezca la nueva versión.

## Verificación realizada

- 9 pruebas de Node aprobadas en `test/event-calendar.test.mjs`: fecha/zona horaria, transiciones MAÑANA/HOY, archivo ICS, plegado UTF-8, enlace Google, contenido estático y ausencia de peticiones de red en el módulo.
- Comprobación sintáctica del módulo y el build.
- 18 combinaciones de portada/foto/preguntas y tamaños 320×568, 360×640, 375×667, 390×844, 430×932 y 1440×1000, en Chromium local. Sin overflow horizontal/vertical en formularios iniciales con teclado cerrado y texto normal; probados apertura del menú y cierre con Escape. Se utilizó una pregunta larga representativa, no las 100 variantes.
- Las copias de CSS y páginas usadas para el arnés visual se verificaron contra sus SHA de GitHub. La vista usa el HTML real de estas páginas y los estilos reales más el nuevo bloque; no se ejecutó la API ni se probaron envíos a Google.
- No se ejecutó en esta revisión la suite completa histórica ni una importación en calendarios reales de iOS/Android. No se representa esta prueba aislada como un ensayo integral de la publicación. La prueba histórica v3 que prohíbe cualquier URL https en HTML ya contradice el enlace Instagram introducido anteriormente; este módulo nuevo no corrige esa prueba ajena a su alcance.

El módulo se incorpora al JS y CSS existentes durante build: ninguna petición inicial adicional, sin SDK, iframe, fuente, imagen o vídeo nuevo. No se contacta con Google Calendar al cargar la página; solo cuando el visitante pulsa su opción.
