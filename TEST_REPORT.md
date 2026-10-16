# Verificación del rediseño v2 · 15 de octubre de 2026

## Ejecutado en esta revisión

Node.js 22.16.0:

```sh
node --test test/*.test.mjs
```

**47 pruebas aprobadas, 0 fallidas.**

- 12 pruebas de la API Node y del banco de 100 preguntas. La prueba de consentimiento ahora toma la versión vigente de settings, en vez de fijar v1.
- 27 pruebas del código real de Apps Script cargado en `node:vm`, con servicios Google simulados.
- 8 pruebas del exportador v2 con archivos temporales reales locales.

Se verificó que los módulos Node reutilizados sin cambios (`server/app.mjs`, `server/jpeg.mjs`, `shared/questions.mjs`, `scripts/demo.mjs`) coincidieran byte por byte con los blobs de la revisión base de GitHub. También se verificó la copia de `public/app.js` antes de aplicar cambios de texto, y la prueba original de la API antes de actualizar su versión de consentimiento.

Se comprobó la sintaxis de los archivos JS/MJS modificados y de Apps Script, y se analizó el manifiesto JSON. **No se ejecutó un despliegue Netlify ni una prueba con Google real en esta revisión.** No se presenta la verificación parcial de sintaxis como un nuevo `npm run build` completo.

## Casos relevantes cubiertos

Creación de una carpeta plana y un Sheet separado de dos columnas; fotografía directamente en raíz; respuesta como fila sin JSON; texto literal sin fórmulas; validación de firmas/consentimiento/cupo/cierre; separación de navegadores; deduplicación; recuperación cuando Google guardó pero se perdió la confirmación; retirada de filas por metadatos y de archivos; migración vacía y con datos de ambos grupos anteriores; reejecución de migración sin duplicados; conservación de archivos inesperados; protección de recursos ajenos; borrado explícito de Sheet y carpeta, con reintento tras fallo parcial.

El exportador se probó con carpeta plana, CSV de dos columnas, Unicode, BOM, comas/comillas/saltos de línea, entradas inválidas, retiradas, destinos ajenos y enlaces simbólicos. Las pruebas no descargan datos privados ni utilizan las credenciales del propietario.

## Interfaz

Se mantuvieron el diseño, las rutas, el selector de archivos y los handlers existentes. Se actualizaron las confirmaciones y el aviso para describir recepción directa, Google Sheets independiente, ausencia de aprobación previa y la eliminación de filas/Sheet. **No se repitió una prueba visual con navegador real en esta revisión.** Las capturas y pruebas de la versión anterior no verifican por sí mismas v2.

## Pendiente para producción

Reemplazar ambos archivos en el proyecto real de Apps Script, autorizar Sheets, ejecutar `migrateToFlatStorage()` sobre la instalación existente y publicar la nueva versión de la implementación. Alinear variables/versión del aviso en Netlify, completar/revisar privacidad, desplegar el código web nuevo y activar la recepción.

Después hay que comprobar desde la URL pública: una foto ficticia en la raíz, una respuesta ficticia en una fila, reintento sin duplicar, retirada y aislamiento entre navegadores. Probar varios teléfonos y la ráfaga esperada; los servicios simulados no reproducen latencia, cuotas, sincronización de Drive, errores reales de autorización ni ejecución de disparadores. La hoja y carpeta del usuario no fueron modificadas por las pruebas locales.
