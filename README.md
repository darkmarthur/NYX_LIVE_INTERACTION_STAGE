# NYX · Live Interaction Stage

Dos intervenciones efímeras para NYX Sonoro, Teatro Ocampo, 22 de octubre de 2026.

- `/preguntas`: una pregunta asignada de un banco de 100; una respuesta por navegador.
- `/foto`: una fotografía por navegador, previsualización propia y consentimiento obligatorio.
- `/legal`: términos, privacidad, restricciones y retirada de participación.
- `/`: invitación a ambas piezas. No es un registro de acceso al teatro.

**No hay cuentas, galería pública, analítica, píxeles de publicidad ni integraciones de IA externas.** El MVP no genera el texto con IA ni el visual de TouchDesigner: prepara y exporta sus entradas. La identidad técnica es una cookie aleatoria firmada, no una persona verificada. Borrar cookies, usar incógnito u otro navegador permite otra participación; impedirlo rigurosamente requiere identificación o códigos únicos.

## Arquitectura

```text
Teléfono → web estática en Netlify
         → Netlify Function del mismo origen (validación + firma privada)
         → Apps Script (ejecutado por el propietario)
         → Drive PRIVADO: pendientes → revisión manual → aprobadas
         → Google Drive para escritorio → exportación local → TouchDesigner
```

La función intermediaria evita depender de CORS/iframes de Apps Script y mantiene el secreto fuera del navegador. No utiliza Netlify Forms, Supabase, Heroku ni una cuenta AWS. Usa recursos del plan Netlify existente: no exige Pro, pero **gratis no significa cuota ilimitada ni disponibilidad garantizada**. Antes del evento revisa el consumo compartido de tu cuenta y prueba una ráfaga real de envíos.

Runtime: Node 22, HTML/CSS/JavaScript nativos. **Sin dependencias de ejecución de NPM.**

## Probar en tu computadora

```sh
npm run dev
# Abrir http://localhost:8888
npm test
npm run build
```

`npm run dev` es una **demostración en memoria**, rotulada en pantalla. No escribe en Google ni simula que lo hizo. No uses datos personales reales en ella. Reiniciar el servidor elimina los envíos de prueba. Las ventanas de participación se abren artificialmente en esta demostración.

Para probar el backend real localmente, copia `.env.example` a `.env`, complétalo y ejecuta:

```sh
node --env-file=.env scripts/dev.mjs --live
```

## Activar Drive (una sola vez, con tu cuenta de Google)

1. Crea un proyecto **independiente y dedicado** en Google Apps Script. Copia `apps-script/Code.gs` y `apps-script/appsscript.json` (activa la visualización del manifiesto en configuración). El manifiesto habilita el servicio avanzado Drive v3; verifica que aparece en Servicios. Con un proyecto Cloud estándar también debes habilitar Drive API.
2. En Propiedades del script agrega `BRIDGE_SECRET`: un secreto aleatorio de al menos 32 caracteres. Genera uno localmente con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. No lo publiques ni lo escribas en el repositorio.
3. Ejecuta `setupProject()` desde el editor y autoriza el acceso solicitado como propietario. Crea una carpeta privada nueva, subcarpetas y un disparador de limpieza. Consulta `showSetup()` para ver únicamente los IDs de configuración, no el secreto. **No reutilices una carpeta personal ni compartida.**
4. Revisa las propiedades `EVENT_ID`, `OPENS_AT`, `CLOSES_AT`, `PURGE_AT`, `MAX_PER_KIND`, `TERMS_VERSION`, `COLLECTION_OPEN`. Los valores de fechas/versión deben coincidir con Netlify. `COLLECTION_OPEN` se crea en `false`: cámbiala a `true` únicamente después del ensayo y de completar el aviso.
5. Implementa como **Aplicación web → Ejecutar como yo → Acceso: cualquier persona**. Copia la URL `/exec` en `APPS_SCRIPT_URL`. Los visitantes no autorizan Google: el endpoint rechaza peticiones sin firma del servidor. Políticas de cuentas Workspace pueden impedir el acceso anónimo.
6. Cada cambio al código de Apps Script requiere actualizar la implementación a una versión nueva. No uses la URL `/dev` en producción.

## Activar Netlify Free

Importa este repositorio en un **sitio nuevo** de Netlify. `netlify.toml` configura el despliegue; no reemplaces tu sitio de visuales existente.

Configura en el entorno de **Functions**, nunca en variables públicas de frontend:

| Variable | Valor |
| --- | --- |
| `APPS_SCRIPT_URL` | URL `/exec` del paso anterior |
| `BRIDGE_SECRET` | El mismo secreto de Apps Script |
| `SITE_ORIGIN` | Origen HTTPS exacto, sin ruta ni slash final |
| `PRIVACY_CONTROLLER` | Identidad real del responsable |
| `PRIVACY_ADDRESS` | Domicilio del responsable para el aviso |
| `PRIVACY_EMAIL` | Correo real y atendido para privacidad |
| `LEGAL_APPROVED` | `true` después de revisar el aviso y el protocolo |
| `COLLECTION_OPEN` | `true` para aceptar envíos; `false` para cerrar |

Las fechas tienen valores iniciales en `shared/settings.mjs`; puedes sobreescribir `EVENT_ID`, `OPENS_AT`, `CLOSES_AT`, `PURGE_AT` y `TERMS_VERSION` en ambos servicios. Usa ISO 8601 con zona horaria. Predeterminados: apertura 8/oct/2026; cierre 22/oct/2026 19:00; limpieza desde 23/oct/2026 10:00, con compromiso operativo de terminar antes de las 12:00, hora de Cuernavaca. Verifica que estas horas coincidan con tu función.

**Sin configuración, el sitio se muestra pero rechaza envíos reales.** No confunde configuración incompleta o fallo de red con un envío exitoso. Un despliegue público de demostración no es necesario.

El texto legal es una plantilla operativa que debes revisar, no una certificación de cumplimiento. No se inventó tu domicilio ni tu correo. Para cambiar los compromisos, edita `public/app.js` y sube `TERMS_VERSION` en ambos servicios antes de recibir nuevo consentimiento.

## Moderar y llevar al show

Drive contiene:

```text
NYX_<evento>/
  pendientes/
    fotos/    # JPEG normalizados; nombres aleatorios
    textos/   # JSON individuales, no una hoja pública
  aprobadas/
    fotos/
    textos/
```

Revisa cada archivo desde tu cuenta. **Mueve**, no copies, solo los archivos aceptados desde `pendientes` a la subcarpeta equivalente de `aprobadas`. Los no revisados nunca entran automáticamente al show. No cambies nombres ni compartas las carpetas por enlace. Los textos son JSON para evitar fórmulas de hoja de cálculo y conservar frases exactas.

Sincroniza/marca disponible sin conexión la carpeta con Google Drive para escritorio. Después:

```sh
npm run export -- --source "/ruta/Drive/NYX_evento/aprobadas" --out "./show-data"
```

Genera `photos/`, `responses.json` y `manifest.json`. TouchDesigner debe leer **solo esta copia local**. Repite la exportación para reflejar eliminaciones antes de congelar el show. Revisa solicitudes de retirada antes de cada exportación y elimina también material derivado (poema, grabaciones de prueba). No exporta datos por internet ni llama a IA. Una recomposición con IA debe ejecutarse localmente, sin entrenamiento y sin telemetría de contenido; cambiar a un proveedor externo requiere revisar aviso, configuración y consentimiento.

## Retirada y borrado real

`/legal` permite retirar ambos aportes desde el navegador que los envió. El backend elimina permanentemente los archivos originales y conserva solo una marca mínima para impedir otro envío hasta la limpieza. Si se perdieron las cookies, el contacto de privacidad y el comprobante permiten gestionar la solicitud. Una retirada no puede deshacer una proyección que ya ocurrió; el equipo debe retirar también las copias locales/derivadas.

`setupProject()` instala `purgeExpired()` cada hora. Desde `PURGE_AT` intenta borrar definitivamente la **carpeta dedicada y sus contenidos**, no solo mandarlos a papelera, y elimina registros de participación de Script Properties. Ante un fallo, no lo marca como completado y permite reintentar. Revisa el disparador y su resultado; **los disparadores/cuotas de Google no son una garantía de ejecución**. Ejecuta manualmente `purgeExpired()` tras la fecha si hace falta. No contiene un endpoint público de borrado administrativo.

Para borrar la exportación local que creó este programa:

```sh
npm run purge:local -- --dir "./show-data" --confirm BORRAR-NYX
```

Solo acepta directorios con el marcador propio `.nyx-export.json`. Esto no borra por sí solo cachés de Drive Desktop, Time Machine, copias manuales ni grabaciones. Excluye el material de respaldos, verifica la eliminación en Google y limpia todas las computadoras/cachés tras la obra. Revoca la implementación pública de Apps Script y elimina el secreto al terminar. No prometas eliminación instantánea de los respaldos/logs internos de proveedores: el aviso explica esa limitación.

## Seguridad y límites del MVP

- Una cookie HttpOnly firmada; validación de origen y token CSRF; deduplicación autoritativa bajo `LockService`.
- Una respuesta (3–500 caracteres) y una foto por navegador; 100 aportes de cada tipo como máximo por defecto. La cifra es un límite del servidor, no identidad humana ni protección DDoS.
- Cliente: archivo original de hasta 20 MiB, reduce a JPEG de máximo 2048 px y 1 MiB antes de enviar. HEIC solo si el navegador puede decodificarlo; ofrece conversión a JPEG cuando no puede. No finge soporte universal.
- Servidor: verifica tamaño, base64, estructura/dimensiones JPEG y consentimiento. No es un antivirus ni moderación automática de imágenes. Revisar contenido sigue siendo obligatorio.
- No se envía nombre original del archivo ni EXIF original desde la interfaz. No se registra el contenido, secreto o IP en logs de aplicación. Google/Netlify pueden conservar registros técnicos conforme a sus políticas.
- HMAC de servidor a servidor, vigencia breve de la firma, secreto fuera del cliente; sin listado público de archivos o URLs de Drive.
- El máximo global y honeypot reducen abuso básico, pero no sustituyen un control antibots dedicado. No se bloquea por IP compartida del teatro.
- La aplicación no añade material enviado a grabaciones o difusión posterior: organiza el registro del concierto para respetar ese compromiso.

## Ensayo mínimo antes de compartir el QR

Prueba dos teléfonos reales (iOS/Android), foto grande, consentimiento sin marcar, recargar pregunta, repetir envío, cortar conexión y reintentar, separación entre dos navegadores, retirada, cierre de ventana, moderación, exportación y limpieza con datos ficticios. Ensaya una ráfaga con el backend real: Apps Script tiene límites de concurrencia y responde ocupado cuando no consigue el bloqueo. No realices el ensayo con fotos reales del público.

## Documentación primaria

- [Netlify Functions: API](https://docs.netlify.com/build/functions/api/)
- [Apps Script: aplicaciones web](https://developers.google.com/apps-script/guides/web)
- [Apps Script: Content Service y redirecciones](https://developers.google.com/apps-script/guides/content)
- [Apps Script: cuotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Servicios avanzados: delete se llama remove](https://developers.google.com/apps-script/guides/services/advanced)
- [LFPDPPP vigente, Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf)
