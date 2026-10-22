# Verificación v6 al integrar en main

## Ejecutado en esta revisión

Node.js 22.16.0, comando:

```sh
node --test test/v6.test.mjs
```

Resultado: **43 pruebas aprobadas, 0 fallidas, 0 omitidas**.

El código real apps-script/Code.gs se ejecuta en node:vm con Properties, Drive y Sheets simulados. La capa server/multi.mjs se prueba con el núcleo real de autenticación server/app.mjs. Se verificaron los hashes de los cuatro módulos base reutilizados contra GitHub:

- server/app.mjs: 55496a1b51a142a63607f28cb6a0ea4f6af3942d
- shared/settings.mjs: 5b5e2d9d468e537e5de601db6b265e1222c1a8c0
- shared/questions.mjs: 32b2aa0fd0ad189b2feb926f718ab2c82680398a
- server/jpeg.mjs: 376fa498a27d90aa9e27a4a0136616950aad6c5c

Casos: varias fotos/respuestas por sesión, más de 100 aportes sin el cupo anterior, deduplicación de reintentos, contenido idéntico en un nuevo intento, anulación de la primera/fila intermedia, desplazamiento de filas, sheetId=0 omitido, metadatos inválidos o ausentes, aislamiento de sesiones, fotos renombradas, fallos antes/después de escritura o borrado, recuperación de confirmaciones perdidas, aportes antiguos, historial paginado, firmas, consentimiento, fechas y limpieza.

## Alcance y pendientes

No se ejecutó la suite histórica completa ni npm run build en esta revisión. El entorno no permitió clonar el repositorio por red; los módulos base necesarios para estas pruebas se recuperaron por el conector y se verificaron byte a byte. No se presenta una prueba parcial como una compilación completa.

Se incluyen test/browser-v6.py y test/server-v6.mjs del paquete preparado para repetir el ensayo funcional en Chromium. Esa prueba utiliza un adaptador de fetch, módulos y cookies con Google simulado y CSS mínimo; no equivale a Safari/iPhone, una regresión visual o un ensayo completo de producción.

La entrada Netlify mantiene el diagnóstico existente withErrorDiagnostics. Los archivos de Apps Script y frontend publicados en GitHub se comparan mediante sus hashes con el paquete v6 probado.

No se ejecutó ningún deploy de Netlify ni se modificó la implementación de Google. No se enviaron ni borraron aportaciones reales. El ensayo real debe hacerse tras actualizar primero Google a protocolo 6 y después publicar la web.
