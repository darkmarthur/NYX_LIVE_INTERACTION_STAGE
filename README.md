# NYX · Live Interaction Stage — v2

Interacción temporal para NYX Sonoro · Teatro Ocampo · 22 de octubre de 2026.

**Fotos en una sola carpeta plana de Drive. Preguntas y respuestas en un Google Sheet independiente con exactamente dos columnas. Sin clasificación ni aprobación previa.**

## Ya creaste la carpeta con la versión anterior

No crees otro proyecto de Apps Script, no ejecutes de nuevo `setupProject()` y no cambies tu secreto.

Sigue [ACTUALIZAR_A_V2.md](docs/ACTUALIZAR_A_V2.md): reemplazar los dos archivos de Apps Script, ejecutar `migrateToFlatStorage()`, autorizar Sheets y publicar una nueva versión de la implementación. La migración reutiliza tu carpeta y crea el Sheet fuera de ella.

Subir estos cambios a GitHub no actualiza por sí solo la copia del código que pegaste en Google Apps Script.

## Qué recibe el público

| Ruta | Experiencia |
| --- | --- |
| `/` | Invitación a ambas piezas. No registra asistencia ni condiciona el acceso al teatro. |
| `/foto` | Una foto por navegador, selección local, previsualización propia y compresión JPEG antes del envío. |
| `/preguntas` | Una pregunta estable por navegador, elegida entre 100. Una respuesta de 3–500 caracteres. |
| `/legal` | Consentimiento, privacidad, restricciones y retirada de ambas aportaciones. |

No hay cuentas, nombre, correo obligatorio, CAPTCHA añadido, galería pública ni endpoint para listar aportaciones ajenas. La identidad técnica es una cookie aleatoria firmada; borrar cookies, usar incógnito u otro dispositivo permite otra participación. No es una identificación infalible por persona.

La aceptación de términos sigue siendo obligatoria. Se mantienen los límites y validaciones técnicas; **no hay moderación automática de contenido ni estados de aprobación para el operador**. El material recibido queda disponible para la obra. El responsable puede excluir un aporte excepcionalmente, pero ese no es un paso necesario del flujo.

## Dónde llegan los datos

En la cuenta que autorice el script:

```text
Mi unidad
├── NYX_nyx-ocampo-2026/                  ← misma carpeta existente
│   ├── NYX_<comprobante>.jpg
│   ├── NYX_<comprobante>.jpg
│   └── ...                              ← solo fotos, sin subcarpetas
│
└── NYX_nyx-ocampo-2026_Respuestas         ← Google Sheet independiente
    └── pestaña Respuestas
        ├── A: Pregunta
        └── B: Respuesta
```

Cada envío de texto inserta una fila, no sobrescribe las anteriores. No se añaden columnas de nombre, fecha, ID, estado ni aprobación; tampoco pestañas ocultas. Se guarda un comprobante técnico como metadato de fila, fuera de las celdas, para localizarla al retirar una aportación. Los registros técnicos de consentimiento/deduplicación quedan en las propiedades privadas del script, no en columnas adicionales.

Las respuestas se escriben como texto literal (`stringValue`), nunca como fórmulas. Se conservan comillas, comas, Unicode y saltos de línea. La función de Netlify recorta espacios de los extremos y normaliza Unicode como en v1.

Mantén el Sheet privado. No lo publiques en la web ni compartas la carpeta por enlace público. Mientras se reciben aportes, utiliza la hoja para lectura: no cambies encabezados, nombre de pestaña, columnas ni muevas celdas sueltas. Los metadatos permiten localizar filas tras cambios de posición por inserción/eliminación; no sustituyen un control de concurrencia frente a ediciones manuales arbitrarias.

## Arquitectura

```text
INICIO · Participante
          ↓
Web estática en Netlify (/foto o /preguntas)
          ↓
Netlify Function /api · sesión, consentimiento, validación y firma privada
          ↓
Google Apps Script · ejecutado con la cuenta propietaria
          ├── FOTO → carpeta plana privada de Drive
          └── TEXTO → nueva fila en el Google Sheet privado independiente
          ↓
FIN · aportación confirmada y disponible para la obra
```

La API existente y el selector de las 100 preguntas se conservan. Las URLs e IDs privados de almacenamiento nunca se devuelven al público. No usa Netlify Forms, Supabase, Heroku ni una cuenta AWS. Usa las cuotas de las cuentas de Netlify/Google existentes; no requiere Pro, pero no garantiza disponibilidad ni capacidad ilimitadas.

## Primera instalación (solo si todavía no existe una carpeta NYX)

1. Crear un proyecto independiente en Google Apps Script y pegar `apps-script/Code.gs` y `apps-script/appsscript.json` completos.
2. Comprobar que en Servicios aparecen **Drive v3** y **Sheets v4**. Con un proyecto Cloud predeterminado se habilitan al añadir el servicio avanzado; con uno estándar también debes habilitar las APIs en Cloud Console.
3. En Propiedades del script, añadir `BRIDGE_SECRET`, aleatorio, de al menos 32 caracteres. Por ejemplo, generar localmente con `openssl rand -hex 32`. Nunca ponerlo en el repositorio ni en variables públicas del frontend.
4. Ejecutar `setupProject()` y autorizar como propietario. Crea solo la carpeta de fotos y el Sheet separado, guarda sus IDs e instala el disparador de limpieza. Si la instalación se interrumpe después de crear la carpeta, continuar con `migrateToFlatStorage()`; no crear otra colección.
5. Publicar como Aplicación web → Ejecutar como yo → Acceso: cualquier persona. Usar la URL terminada en `/exec`, no `/dev`. Los participantes no autorizan su Google; Netlify firma los envíos al receptor.

## Configuración de Netlify

Estas variables son privadas del servidor/Functions. No usar prefijos públicos ni incrustarlas en JavaScript del navegador.

| Variable | Valor |
| --- | --- |
| `APPS_SCRIPT_URL` | URL `/exec` de la implementación actualizada |
| `BRIDGE_SECRET` | Exactamente el mismo secreto de Apps Script |
| `SITE_ORIGIN` | `https://nyxsonoro.netlify.app` (sin slash final) |
| `TERMS_VERSION` | `2026-10-15-v2` |
| `PRIVACY_CONTROLLER` | Responsable real |
| `PRIVACY_ADDRESS` | Domicilio del responsable para el aviso |
| `PRIVACY_EMAIL` | Contacto real atendido |
| `LEGAL_APPROVED` | `true` únicamente tras revisar el aviso actualizado |
| `COLLECTION_OPEN` | `true` para aceptar envíos; `false` para pausar |

También debe estar `COLLECTION_OPEN=true` en Propiedades del script. `STORAGE_VERSION=2`, `SPREADSHEET_ID`, `RESPONSE_SHEET_ID` y `ROOT_FOLDER_ID` son internos de Apps Script: la instalación/migración los configura; no hay que copiarlos a Netlify.

**Después de cambiar variables o código, despliega nuevamente Netlify y comprueba la versión publicada.** Que la web esté visible no prueba la conexión con Google. La API rechaza envíos cuando falta configuración; Apps Script también rechaza una versión de términos incompatible o una migración sin terminar.

Predeterminados, hora de Ciudad de México: recepción desde 8/oct/2026; cierre 22/oct/2026 a las 19:00; limpieza desde 23/oct/2026 a las 10:00, con compromiso operativo de terminar antes de las 12:00. Si personalizas `EVENT_ID`, `OPENS_AT`, `CLOSES_AT` o `PURGE_AT`, deben coincidir en ambos servicios. No reutilices una colección cuyo plazo terminó.

## Durante el show

No tienes que mover nada entre carpetas. La foto llega directamente a la raíz y la respuesta directamente a una fila.

Para las fotos, sincroniza esa carpeta con Google Drive para escritorio y marca los archivos disponibles sin conexión. TouchDesigner puede observar esa carpeta local, sin recorrer subcarpetas. No se incluye un proyecto `.toe`: configura el directorio que ya usa tu sistema visual. La sincronización necesita conectividad y no es instantánea ni garantizada. Antes de reproducirir, confirma que los archivos estén descargados; conserva una copia local de trabajo para una ejecución independiente de internet.

Para las respuestas, abre el Sheet desde el enlace `RESPONSES_URL` que imprime `showSetup()`. No necesitas reunir JSON ni operar un botón de aprobación. El MVP no compone por sí mismo el poema con IA ni crea el mosaico: entrega las entradas.

### Exportación local opcional

No es un requisito para recibir aportes. Para generar una copia estable y un manifiesto:

```sh
npm run export -- --source "/ruta/Drive/NYX_nyx-ocampo-2026" --out "./show-data"
```

Lee fotos `NYX-<comprobante>.jpg` directamente desde la raíz. No busca `aprobadas`, `fotos/` ni JSON de respuestas en el origen. Produce `photos/`, `manifest.json` y el marcador interno para borrado seguro.

Para añadir `responses.json`, descarga la pestaña Respuestas desde Google Sheets → Archivo → Descargar → Valores separados por comas (.csv), y ejecuta:

```sh
npm run export -- --source "/ruta/Drive/NYX_nyx-ocampo-2026" --sheet-csv "./respuestas.csv" --out "./show-data"
```

El CSV debe tener exactamente `Pregunta,Respuesta`. El lector conserva textos entrecomillados y saltos de línea; no ejecuta fórmulas. Cada elemento de `responses.json` contiene solo `question` y `answer`. No se sube el CSV a ningún servicio. Si omites el CSV en una reexportación, se retira el `responses.json` anterior de esa copia para no usar respuestas desactualizadas accidentalmente.

Reexportar refleja archivos retirados del origen; verifica también que el CSV sea reciente. No publiques el Sheet para evitar descargarlo. La recomposición con IA, bajo el aviso actual, debe realizarse localmente sin entrenamiento ni envío a proveedores externos de IA.

## Retirada y borrado

`/legal` permite retirar los aportes desde el mismo navegador: elimina el JPEG y la fila correspondiente, no la hoja completa ni respuestas ajenas. Conserva solo un comprobante/tombstone técnico para bloquear un nuevo envío hasta la limpieza. Reintentos tras fallos de red recuperan por comprobante un archivo/fila ya creado, sin tratar un error como recepción confirmada. Tras un envío fallido, conserva la página y reintenta con el mismo contenido.

La fila se ubica mediante metadatos, no usando únicamente un número fijo que pudiera cambiar. Borrar la fila no elimina por sí solo el historial de versiones de Google; la eliminación final borra explícitamente el archivo de Sheets completo, además de la carpeta de fotos, aunque estén separados.

`purgeExpired()` se ejecuta por disparador cada hora desde `PURGE_AT`; verifica los marcadores de ambos recursos antes de borrar. No marca éxito si falla una parte y permite reintentar. No hay endpoint administrativo de borrado en la web. El equipo debe comprobar la ejecución; las cuotas y disparadores no garantizan puntualidad.

La migración mantiene las fechas existentes y el borrado programado. No almacenes otros documentos dentro de la carpeta dedicada ni uses ese Sheet para otros fines.

```sh
npm run purge:local -- --dir "./show-data" --confirm BORRAR-NYX
```

El borrado local reconoce exportaciones v1/v2 mediante su marcador y rechaza carpetas ajenas. No elimina por sí solo la caché de Drive Desktop, CSV descargados, copias manuales, respaldos ni material derivado: deben retirarse también. Al finalizar, revoca la implementación web y el secreto. El aviso no promete borrar instantáneamente registros o respaldos internos de proveedores.

## Desarrollo y pruebas

Node 22, frontend HTML/CSS/JS y Functions. Sin nuevas dependencias de NPM.

```sh
npm run dev       # demo en memoria; no envía a Google
npm test
npm run build
```

Para backend real local, completar `.env` con las variables anteriores y ejecutar:

```sh
node --env-file=.env scripts/dev.mjs --live
```

Consultar [TEST_REPORT.md](TEST_REPORT.md). Las pruebas locales usan Google simulado; antes del evento hay que probar el circuito publicado con una foto y una respuesta ficticias, reintento, retirada, disponibilidad sin conexión y una ráfaga de varios teléfonos. Validación técnica no equivale a antivirus, moderación automática ni garantía de capacidad del proveedor.

## Referencias de implementación

- Apps Script avanzado y permisos: https://developers.google.com/apps-script/guides/services/advanced
- Creación de hojas con número de columnas: https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app
- Escrituras atómicas de Sheets: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate
- Metadatos asociados a filas: https://developers.google.com/workspace/sheets/api/guides/metadata
- Actualizar implementación manteniendo su URL: https://developers.google.com/apps-script/concepts/deployments
