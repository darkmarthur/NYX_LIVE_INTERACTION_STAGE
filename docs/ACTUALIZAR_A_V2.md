# Pasar tu instalación existente a fotos planas + Google Sheet

**No hay que empezar de cero. Se conserva tu proyecto de Apps Script, tu secreto y la misma carpeta principal de Drive.**

Este procedimiento actualiza la copia que ya pegaste en Google; GitHub y Apps Script no se sincronizan automáticamente.

## 1. Abrir el proyecto de Google que ya creaste

En https://script.google.com/ abre el proyecto de recepción de NYX. No pulses Nuevo proyecto.

Si ya recibías aportaciones, pausa primero `COLLECTION_OPEN=false` en Propiedades del script. No modifiques manualmente los archivos durante la migración.

## 2. Reemplazar DOS archivos completos

Desde la rama `main` de GitHub:

- `apps-script/Code.gs` → reemplaza todo el contenido de `Código.gs`/`Code.gs` en el editor de Google.
- `apps-script/appsscript.json` → reemplaza todo el manifiesto; esta versión agrega Sheets y su permiso.

Archivos:

https://github.com/darkmarthur/NYX_LIVE_INTERACTION_STAGE/blob/main/apps-script/Code.gs

https://github.com/darkmarthur/NYX_LIVE_INTERACTION_STAGE/blob/main/apps-script/appsscript.json

Guarda. En Servicios deben aparecer **Drive** y **Sheets**. No los agregues por duplicado. No borres tus Propiedades del script y no cambies `BRIDGE_SECRET`.

## 3. Ejecutar la migración

En el selector junto a Ejecutar elige:

```text
migrateToFlatStorage
```

Pulsa Ejecutar y acepta los nuevos permisos de Google Sheets con la misma cuenta propietaria. **No selecciones `setupProject`.**

La migración:

- Reutiliza la carpeta principal y conserva su ID/enlace.
- Crea un Google Sheet privado, separado de esa carpeta, llamado `NYX_nyx-ocampo-2026_Respuestas`.
- Deja exactamente dos columnas: `Pregunta` y `Respuesta`.
- Mueve los JPEG de las antiguas subcarpetas a la raíz sin cambiar sus IDs.
- Convierte los JSON antiguos en filas. Solo elimina cada JSON después de verificar la fila copiada.
- Elimina las subcarpetas antiguas únicamente cuando están vacías. No borra archivos desconocidos para forzar la migración.
- Conserva los comprobantes y el consentimiento original de aportes existentes. No duplica filas al reintentar.
- Mantiene las fechas de cierre/limpieza y deja `COLLECTION_OPEN=false`.

Si aparece un error de permisos, autoriza y vuelve a ejecutar la misma función. Si el error identifica contenido inesperado, revisa ese archivo: no borres la carpeta completa ni los registros del script para intentarlo otra vez. Mientras `MIGRATION_RUNNING=true`, el receptor v2 permanece bloqueado.

## 4. Ver los dos destinos

Al terminar, en Registro de ejecución aparecerán:

```text
PHOTOS_URL       → tu carpeta plana
RESPONSES_URL    → tu nuevo Google Sheet
```

También puedes ejecutar `showSetup()` para volver a verlos. No imprime tu clave secreta.

En Drive verás la carpeta de fotografías y el Sheet al mismo nivel de Mi unidad. El Sheet NO está dentro de la carpeta. No crees otro Sheet manualmente ni copies IDs a Netlify.

## 5. Publicar la nueva versión de Google

Si ya publicaste el receptor: **Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión → Implementar**. Actualiza la implementación existente; así conservas su URL `/exec`.

Si aún no lo publicaste: **Implementar → Nueva implementación → Aplicación web → Ejecutar como yo → Acceso: cualquier persona**. Copia la URL `/exec` para `APPS_SCRIPT_URL` en Netlify. Esto no comparte públicamente tus archivos: el receptor exige la firma privada de Netlify.

No uses `/dev`. Abrir `/exec` directamente puede mostrar `{"ok":false,"code":"METHOD"}`: el navegador está haciendo GET, pero los formularios usan POST. Ese mensaje no comprueba por sí solo la recepción.

## 6. Alinear Netlify

El código web nuevo debe desplegarse desde la rama `main` actualizada. No basta con que siga publicado el despliegue anterior.

En las variables privadas de Netlify, utiliza:

```text
TERMS_VERSION = 2026-10-15-v2
SITE_ORIGIN = https://nyxsonoro.netlify.app
```

Mantén tu `BRIDGE_SECRET` original y la URL `/exec` actualizada. Si conservaste la misma implementación de Google, la URL no cambia.

La migración ya puso `TERMS_VERSION=2026-10-15-v2` en Google. Comprueba que coincida con Netlify; una variable antigua explícita en Netlify tiene prioridad sobre el valor predeterminado del código.

Completa o conserva los datos reales de `PRIVACY_CONTROLLER`, `PRIVACY_ADDRESS` y `PRIVACY_EMAIL`. Revisa el aviso `/legal` actualizado y activa `LEGAL_APPROVED=true` únicamente cuando corresponda.

Para habilitar la recepción, pon **`COLLECTION_OPEN=true` en ambos lugares**: Propiedades del script de Google y variables de Netlify. Despliega de nuevo Netlify después de cambiar sus variables.

## 7. Prueba final sin datos personales reales

Envía una respuesta ficticia en `/preguntas` y una foto de prueba en `/foto`.

Resultado esperado: una fila nueva en el Sheet y un JPEG directamente en la carpeta principal. Ninguna carpeta `pendientes`, `aprobadas`, `fotos` o `textos` es necesaria.

Recargar no debe crear otra fila ni otra foto. Prueba también la retirada desde `/legal` en el mismo navegador: deben desaparecer esa fila y esa foto, sin afectar otros aportes.

## En el show

Abre el Sheet para ver las respuestas. Apunta tu carpeta local de TouchDesigner a la raíz sincronizada de fotos. No hay archivos que aprobar ni mover.

**Atención al borrado programado:** se conservó `PURGE_AT` de tu configuración anterior (predeterminado: 23 de octubre de 2026 a las 10:00, hora de Ciudad de México). La limpieza elimina la carpeta del evento y también el Sheet independiente. No guardes material ajeno al evento en ninguno de los dos.
