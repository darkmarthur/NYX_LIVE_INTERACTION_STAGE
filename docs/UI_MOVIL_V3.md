# Interfaz móvil v3 · Activar después de revisar

## Qué cambia

Fondo negro, cian y pequeños acentos magenta, inspirado en los tokens visuales del portfolio MDQ. No se reutilizan sus librerías, videos, WebGL, fuentes o recursos externos. En /foto y /preguntas hay un único flujo: input → aceptar términos → enviar. Después: confirmación y ANULAR ENVÍO ANTERIOR.

La portada solo ofrece los dos enlaces. Utiliza /preguntas directamente en el QR del teatro y /foto en la invitación.

El Sheet sigue teniendo dos columnas; la carpeta sigue siendo plana. **No se crea otro tab, otra carpeta ni otra hoja. No hay una nueva migración.**

## Activación, cuando estés listo

1. En tu mismo proyecto de Google Apps Script, reemplaza únicamente `Code.gs` por `apps-script/Code.gs` de esta revisión. Conserva `appsscript.json`: sus permisos no cambiaron.
2. Guarda. No ejecutes `setupProject` ni `migrateToFlatStorage`; no borres propiedades. No cambies ROOT_FOLDER_ID, SPREADSHEET_ID, BRIDGE_SECRET ni TERMS_VERSION.
3. Implementar → Administrar implementaciones → editar con el lápiz → Nueva versión → Implementar. Conserva la misma URL /exec. Esto activa `withdrawOne`, la anulación de una sola clase de aporte.
4. En Netlify, publica el código actualizado solo cuando hayas terminado de revisar. El build ahora genera `dist`; `netlify.toml` ya incluye `publish = "dist"`. No arrastres únicamente la carpeta dist al panel: el proyecto también necesita su Netlify Function. Usa el despliegue del repositorio con build/Functions.
5. Conserva las variables existentes. TERMS_VERSION sigue siendo `2026-10-15-v2`. Revisa el aviso actualizado y los datos reales del responsable; mantén cerrada la recepción hasta el ensayo. Al abrirla, COLLECTION_OPEN debe estar en true en Google y Netlify.
6. Prueba datos ficticios: una foto directamente en raíz, una fila en el Sheet, recarga, anula SOLO foto, comprueba que la respuesta continúa, anula respuesta, comprueba que no permite otro envío desde ese navegador.

GitHub y Apps Script no se sincronizan automáticamente. Esta entrega no actualiza la implementación Google ni inicia un despliegue Netlify. El commit utiliza `[skip netlify]` para omitir el despliegue automático; un despliegue manual o un commit posterior sin esa marca puede publicar el cambio.

## Sesión, nombres y retirada

No confiar en un UUID o nombre elegido por el cliente para borrar archivos. Se conserva la cookie aleatoria firmada actual; el backend deriva el actor y busca solo su registro privado. Drive recibe un nombre `NYX-<UUID>.jpg` generado por el servidor. La eliminación usa `fileId`, que no cambia cuando tú renombras el archivo. Un reemplazo manual que crea un archivo NUEVO con el mismo nombre sí tiene otro fileId: no se debe usar el mismo nombre para suplantar el original.

Las respuestas se localizan por metadatos ligados a su fila. No agregamos columnas ni otra pestaña al Sheet. Ordenar/mover con acciones que descarten metadatos o copiar filas a otro archivo no conserva necesariamente esa relación; esas copias deben retirarse manualmente.

Anular retira únicamente el aporte de la ruta actual y mantiene bloqueado el reenvío. Retira Drive/fila activa, no una copia independiente que TouchDesigner ya hubiera cargado ni el historial interno de Google. Verifica la sincronización y las copias locales.

La nueva interfaz conserva consentimientos y límites. No se inicia sesión en Google, pero sin autenticación no es posible garantizar una sola participación por persona real.

## Señal lenta

Objetivo de foto 256 KiB; máximo de salida del frontend 384 KiB; hasta 2048 px, bajando resolución si hace falta. Original de hasta 20 MiB, nunca subido. Mayor tamaño de proyección no elimina el compromiso entre calidad y datos: comprueba una muestra en el proyector.

Se envía el JPEG binario; los nombres/EXIF originales no se envían. Worker si es compatible, fallback Canvas si no. HEIC depende del decodificador del dispositivo. La primera visita a una ruta usa 3 archivos estáticos y 1 petición API; no descarga las 100 preguntas, un motor gráfico ni fuentes.

No hay reenvío automático después de un timeout. COMPROBAR ENVÍO consulta el estado antes de ofrecer reintentar. Una anulación fallida tampoco se presenta como exitosa.

No hay modo offline con cola automática: sin conexión al menos intermitente no se puede entregar contenido a Google. Los borradores/fotos no se guardan en localStorage ni IndexedDB. Mantén la página abierta mientras se envía.

El diseño cabe en los tamaños verticales probados con teclado cerrado y texto normal. Se permite scroll cuando el teclado reduce el espacio, al ampliar texto o al leer /legal; no se bloquea el zoom ni se ocultan controles para forzar el encaje.
