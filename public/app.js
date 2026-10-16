import { preparePhoto } from './photo.js';

const main = document.querySelector('#main');
const banner = document.querySelector('#banner');
const route = location.pathname.replace(/\/$/, '') || '/';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(value));
let config;

async function api(path, body, csrf, onRetry) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(path, {
        method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json', 'X-Nyx-Csrf': csrf } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(27000)
      });
      const result = await response.json();
      if (result.ok === true) return result.data;
      const error = new Error(result.error?.message || 'No se pudo confirmar el envío.');
      error.retryable = response.status === 429 || response.status === 503;
      if (!error.retryable) throw error;
      last = error;
    } catch (error) {
      if (error.retryable === false || (error.retryable === undefined && error.name === 'Error')) throw error;
      last = error;
    }
    if (attempt < 2) {
      onRetry?.('Hay varios envíos en curso. Reintentando sin duplicar tu aportación…');
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt + Math.random() * 1200));
    }
  }
  throw new Error(last?.retryable ? last.message : 'No hay confirmación de recepción. Comprueba tu conexión y vuelve a intentar; no enviaremos dos aportaciones.');
}
function setMessage(element, text, error = false) {
  element.textContent = text;
  element.classList.toggle('error', error);
}
function unavailable() {
  if (config.phase === 'closed') return 'Esta ventana de participación ya terminó. Gracias por formar parte del encuentro.';
  if (config.phase === 'soon') return `La participación abrirá el ${date(config.opensAt)}.`;
  return 'Estamos preparando este encuentro. Por ahora no estamos recibiendo aportaciones.';
}
function renderHome() {
  document.title = 'NYX · La poética de la cotidianidad';
  main.innerHTML = `<section class="hero"><p class="eyebrow"><span class="dot"></span>Una obra que también te pertenece</p><h1>Lo cotidiano,<br>por una noche,<br><em>extraordinario.</em></h1><p class="intro">Hay recuerdos que caben en una fotografía. Otros, en una frase. Esta noche pueden encontrarse y convertirse en algo que todavía no existe.</p><p class="event-line">${escape(config.venue)}<br>${escape(config.eventLabel)}</p></section><section class="cards" aria-label="Elige cómo participar"><a class="card" href="/foto"><span class="index">01 / MEMORIA VISUAL</span><span class="arrow" aria-hidden="true">↗</span><h2>Una imagen.<br>Todo un mundo.</h2><p>Una foto que normalmente cabe en 6 pulgadas puede ocupar casi 10 metros de escenario. ¿Cuál elegirías?</p><span class="cta">Compartir una fotografía →</span></a><a class="card" href="/preguntas"><span class="index">02 / MEMORIA VERBAL</span><span class="arrow" aria-hidden="true">↗</span><h2>Tu recuerdo,<br>en otra voz.</h2><p>Una pregunta al azar. Una respuesta tuya. Un texto colectivo que podrá cobrar vida desde el escenario.</p><span class="cta">Descubrir mi pregunta →</span></a></section><p class="fineprint home-note">Participar es opcional y no condiciona la entrada al teatro. Sin cuentas, sin nombres y sin galería pública.</p>`;
}
function consent(kind) {
  const target = kind === 'photo' ? '/foto' : '/preguntas';
  return `<label class="consent"><input id="consent" type="checkbox" required><span>He leído y acepto los <a href="/legal?from=${encodeURIComponent(target)}" target="_blank" rel="noopener">términos y el aviso de privacidad</a>. Tengo 18 años o más y autorización para compartir ${kind === 'photo' ? 'esta imagen' : 'este texto'} para la obra.</span></label>`;
}
function simpleNotice() {
  return `<p class="restriction">Solo para esta obra; sin entrenamiento de IA ni difusión posterior por los organizadores. Eliminación de las copias de trabajo antes del ${escape(date(config.deleteBy))}. ${config.contact ? `Privacidad: <a href="mailto:${escape(config.contact)}">${escape(config.contact)}</a>.` : ''}</p>`;
}
function renderSuccess(panel, kind, receipt, withdrawn = false) {
  panel.classList.add('success');
  panel.innerHTML = `<div class="success-mark" aria-hidden="true">${withdrawn ? '−' : '✓'}</div><p class="eyebrow">${config.mode === 'demo' ? 'PRUEBA LOCAL' : withdrawn ? 'PARTICIPACIÓN RETIRADA' : 'APORTACIÓN RECIBIDA'}</p><h2>${withdrawn ? 'Tu decisión también cuenta.' : kind === 'photo' ? 'Tu recuerdo ya tiene un lugar.' : 'Tu voz ya forma parte.'}</h2><p>${withdrawn ? 'Tu aportación se retiró de la colección en línea. El equipo debe excluir también sus copias de trabajo. Este navegador no puede volver a enviar el mismo tipo de aporte.' : config.mode === 'demo' ? 'Esta es una simulación. No se guardó ningún archivo en Google y no se utilizará en el show.' : 'Gracias por compartir un fragmento de tu mundo. Tu aportación quedó recibida para la obra, sin una etapa de aprobación. No se garantiza la exhibición de todos los aportes.'}</p>${receipt ? `<code class="receipt">Tu comprobante<br>${escape(receipt)}</code>` : ''}<a class="button secondary block" href="${kind === 'photo' ? '/preguntas' : '/foto'}">${kind === 'photo' ? 'Descubrir mi pregunta' : 'Compartir una fotografía'} →</a><p class="fineprint home-note">Puedes gestionar la retirada desde <a href="/legal">Términos y privacidad</a>. Guarda tu comprobante.</p>`;
}
async function renderPiece(kind) {
  const photo = kind === 'photo';
  document.title = photo ? 'Una imagen · NYX' : 'Una palabra · NYX';
  main.innerHTML = `<section class="layout"><div><p class="eyebrow">${photo ? '01 / Memoria visual' : '02 / Memoria verbal'}</p><h1>${photo ? 'La poética de<br><em>la cotidianidad.</em>' : 'Lo que recuerdas<br><em>también puede sonar.</em>'}</h1><p class="intro">${photo ? 'Una foto que normalmente cabe en 6 pulgadas puede ocupar casi 10 metros de escenario. ¿Cuál elegirías?' : 'Una pregunta al azar. Tu respuesta podrá entrelazarse con las de otras personas en un texto que Natalia leerá desde el escenario.'}</p><p class="intro">${photo ? 'No tiene que ser una foto perfecta. Solo un instante que quieras compartir con quienes estarán esa noche en el teatro.' : 'No busques una respuesta extraordinaria. A veces, el detalle más sencillo es el que nos encuentra.'}</p><div class="piece-number">${photo ? 'UNA FOTOGRAFÍA / UNA NOCHE' : 'CIEN PREGUNTAS / UNA PARA TI'}</div><p class="fineprint">Un envío de cada tipo por navegador. Sin registro de acceso al teatro. ${photo ? 'Solo tú verás tu previsualización; no puedes consultar archivos de otras personas.' : 'Tu pregunta se conserva al recargar. No escribas nombres, teléfonos, domicilios ni información confidencial.'}</p></div><div class="panel" id="panel"><p class="loading" role="status">Preparando tu espacio…</p></div></section>`;
  const panel = document.querySelector('#panel');
  if (!config.ready || Date.now() >= Date.parse(config.purgeAt)) {
    panel.innerHTML = `<p class="notice">${escape(unavailable())}</p><a class="button secondary block" href="/">Volver al inicio</a>`;
    return;
  }
  let session;
  try { session = await api('/api/session'); }
  catch (error) { panel.innerHTML = `<p class="status error" role="alert">${escape(error.message)}</p><a class="button secondary home-note" href="${photo ? '/foto' : '/preguntas'}">Volver a intentar</a>`; return; }
  const previous = session[photo ? 'photo' : 'text'];
  if (previous) { renderSuccess(panel, kind, previous.receipt, previous.withdrawn); return; }
  if (config.phase !== 'open') {
    panel.innerHTML = `<p class="notice">${escape(unavailable())}</p><a class="button secondary block" href="${photo ? '/foto' : '/preguntas'}">Actualizar</a>`;
    return;
  }
  panel.innerHTML = `<form id="contribution"><div class="trap" aria-hidden="true"><label>Sitio web<input type="text" name="website" id="website" tabindex="-1" autocomplete="off"></label></div>${photo ? `<p class="eyebrow">Elige un instante</p><div id="preview-box" hidden><img id="preview" class="preview" alt="Previsualización de tu propia fotografía"><div class="preview-meta"><span id="photo-info"></span><button class="button secondary small" id="change-photo" type="button">Cambiar foto</button></div></div><label class="upload" id="upload-box"><span class="symbol" aria-hidden="true">+</span><strong>Seleccionar mi fotografía</strong><small>JPEG, PNG o WebP · Hasta 20 MB<br>HEIC cuando tu navegador lo permita</small><input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" aria-label="Seleccionar mi fotografía"></label><p class="restriction">No subas desnudos, violencia explícita, documentos, publicidad ni imágenes identificables de menores. Si aparecen otras personas adultas, necesitas su autorización.</p>` : `<p class="eyebrow">Tu pregunta · ${String(session.question.id).padStart(3, '0')} / 100</p><h2 class="question" id="question-text">${escape(session.question.text)}</h2><label class="field-label" for="answer">Tu respuesta</label><textarea id="answer" maxlength="500" minlength="3" required placeholder="A veces todo empieza con un recuerdo…" aria-describedby="counter"></textarea><p id="counter" class="counter">0 / 500</p>`}${consent(kind)}<button id="submit" class="button block" type="submit" disabled>${photo ? 'Compartir este recuerdo' : 'Sumar mi voz'} <span aria-hidden="true">↗</span></button><p id="status" class="status" role="status" aria-live="polite"></p>${simpleNotice()}</form>`;
  const form = document.querySelector('#contribution');
  const button = document.querySelector('#submit');
  const accepted = document.querySelector('#consent');
  const status = document.querySelector('#status');
  let prepared;
  let processing = false;
  let busy = false;
  const ready = () => { button.disabled = busy || processing || !accepted.checked || (photo ? !prepared : document.querySelector('#answer').value.trim().length < 3); };
  accepted.addEventListener('change', ready);
  if (!photo) document.querySelector('#answer').addEventListener('input', event => { document.querySelector('#counter').textContent = `${event.target.value.length} / 500`; ready(); });
  else {
    const picker = document.querySelector('#photo-file');
    document.querySelector('#change-photo').addEventListener('click', () => picker.click());
    picker.addEventListener('change', async () => {
      if (!picker.files?.[0] || busy) return;
      if (prepared) URL.revokeObjectURL(prepared.previewUrl);
      prepared = null;
      processing = true;
      ready();
      document.querySelector('#preview-box').hidden = true;
      setMessage(status, 'Preparando la imagen en tu dispositivo…');
      try {
        prepared = await preparePhoto(picker.files[0], config);
        document.querySelector('#preview').src = prepared.previewUrl;
        document.querySelector('#photo-info').textContent = `${prepared.width} × ${prepared.height} px · ${Math.round(prepared.bytes / 1024)} KB`;
        document.querySelector('#preview-box').hidden = false;
        document.querySelector('#upload-box').hidden = true;
        setMessage(status, 'Lista para enviar. El original no se sube.');
      } catch (error) {
        document.querySelector('#upload-box').hidden = false;
        setMessage(status, error.message, true);
      } finally { processing = false; picker.value = ''; ready(); }
    });
    window.addEventListener('pagehide', () => { if (prepared) URL.revokeObjectURL(prepared.previewUrl); }, { once: true });
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || processing || button.disabled || !form.reportValidity()) return;
    busy = true;
    ready();
    form.setAttribute('aria-busy', 'true');
    setMessage(status, 'Enviando tu aportación. Mantén esta página abierta…');
    const body = { consent: accepted.checked, termsVersion: config.termsVersion, website: document.querySelector('#website').value };
    if (photo) body.image = prepared.base64;
    else body.answer = document.querySelector('#answer').value;
    try {
      const result = await api(photo ? '/api/photo' : '/api/answer', body, session.csrf, text => setMessage(status, text));
      if (prepared) { URL.revokeObjectURL(prepared.previewUrl); prepared = null; }
      renderSuccess(panel, kind, result.receipt);
    } catch (error) { setMessage(status, error.message, true); }
    finally { busy = false; if (form.isConnected) { form.removeAttribute('aria-busy'); ready(); } }
  });
}
async function renderLegal() {
  document.title = 'Términos y privacidad · NYX';
  const from = new URLSearchParams(location.search).get('from');
  const back = ['/foto', '/preguntas'].includes(from) ? from : '/';
  main.innerHTML = `<article class="legal"><a class="return-link" href="${back}">← Volver a la obra</a><p class="eyebrow">Tu aportación, bajo tu decisión</p><h1>Términos y<br><em>privacidad.</em></h1><p>Versión ${escape(config.termsVersion)} · NYX Sonoro · Teatro Ocampo.</p>${!config.ready ? '<p class="notice">Aviso en preparación. No se aceptan aportaciones reales hasta completar los datos del responsable y revisar estos compromisos.</p>' : ''}<h2>1. Una finalidad concreta</h2><p>Tu fotografía o respuesta se recibe exclusivamente para preparar y presentar las intervenciones participativas de <strong>${escape(config.eventName)}</strong> en ${escape(config.venue)}, ${escape(config.eventLabel)}. La foto podrá recortarse, combinarse y transformarse visualmente; el texto podrá editarse y entrelazarse con otras respuestas para su lectura en escena. No se garantiza que todos los aportes aparezcan.</p><p>Participar es voluntario y gratuito. No es un registro de asistencia ni condiciona tu entrada al teatro. Conservas la titularidad de tu contenido y otorgas únicamente una autorización no exclusiva, gratuita y temporal para esos usos dentro de la obra.</p><h2>2. Lo que no haremos</h2><p><strong>Los organizadores no utilizarán estos aportes para entrenar modelos de inteligencia artificial, vender datos, elaborar perfiles, publicidad o distribución fuera de esta presentación.</strong> No existe una galería pública ni una función para que participantes consulten los archivos de otras personas.</p><p>La eventual recomposición del texto con IA se realizará en un equipo local, sin enviar los aportes a servicios externos de IA ni usarlos para entrenamiento. Este sitio no incluye integración con proveedores de IA. Un uso diferente requeriría revisar el aviso y obtener el consentimiento correspondiente.</p><p>La autorización no incluye publicar tus aportes en redes, promociones o grabaciones del concierto. La exhibición en el teatro sí es pública: una imagen puede permitir reconocer a las personas que aparecen en ella y no podemos garantizar que otros asistentes no realicen capturas.</p><h2>3. Qué recibimos y dónde se guarda</h2><p>Recibimos la fotografía procesada o la respuesta, el identificador de la pregunta, fecha de envío, comprobante, versión del aviso aceptado y una referencia técnica aleatoria para limitar duplicados. No solicitamos tu nombre, cuenta de Google, teléfono o correo para participar.</p><p>La interfaz procesa la foto en tu dispositivo y envía una versión JPEG, no el archivo original ni su nombre. El navegador conserva una cookie técnica, HttpOnly y firmada, hasta la fecha de limpieza. No se utiliza para publicidad ni seguimiento entre sitios. Sin identificarte no podemos garantizar una participación por persona: otra computadora, incógnito o borrar cookies puede producir otro identificador.</p><p><strong>Netlify y Google Apps Script, Drive y Sheets prestan el alojamiento y almacenamiento necesarios.</strong> Las fotografías llegan directamente a una sola carpeta privada de Drive, sin subcarpetas de aprobación. Cada pregunta y respuesta se incorpora como una fila en una hoja de cálculo privada e independiente, fuera de esa carpeta, con solo dos columnas: Pregunta y Respuesta. No añadimos nombres ni correos. Los comprobantes y registros técnicos se conservan aparte; un identificador técnico asociado a la fila permite retirarla sin agregar columnas. Solo acceden el responsable y el equipo autorizado. Esto no equivale a publicar o vender tus aportes a terceros, pero esos proveedores pueden tratar registros técnicos conforme a sus propias políticas. No afirmamos que el servicio funcione sin proveedores ni sin registros de infraestructura.</p><h2>4. Condiciones para compartir</h2><ul><li>Debes tener 18 años o más y ser titular del contenido o contar con permiso suficiente para compartirlo y exhibirlo.</li><li>No compartas fotografías identificables de menores ni de otras personas adultas sin su autorización.</li><li>No envíes documentos de identidad, domicilios, teléfonos, datos sensibles o información confidencial propia o ajena.</li><li>No se admiten desnudos, contenido sexual, violencia explícita, amenazas, acoso, odio, material ilícito, publicidad ni archivos maliciosos.</li><li>No existe una etapa de aprobación previa: el material recibido queda disponible directamente para la obra. El equipo puede excluir aportes por seguridad, derechos de terceros, pertinencia artística o límites técnicos. No intentes evadir los límites ni saturar el servicio.</li></ul><h2>5. Cierre y eliminación</h2><p>La recepción cierra el <strong>${escape(date(config.closesAt))}</strong>. El responsable se compromete a eliminar las copias de trabajo bajo su control, fotografías, respuestas, registros de participación y material derivado antes del <strong>${escape(date(config.deleteBy))}</strong>, hora de Cuernavaca.</p><p>La eliminación de la carpeta de fotografías y de la hoja de cálculo independiente está programada a partir del ${escape(date(config.purgeAt))}. El equipo debe verificar su ejecución y borrar las exportaciones locales, cachés de sincronización, pruebas y copias de respaldo. No basta con mover archivos a la papelera. Los respaldos o registros internos de los proveedores pueden conservarse por sus propios plazos; no es posible garantizar un borrado instantáneo y absoluto de sistemas ajenos. Tampoco puede deshacerse una exhibición que ya ocurrió.</p><h2>6. Retirada y derechos sobre tus datos</h2><p>Puedes retirar tu aportación desde este navegador mediante el botón de abajo. Se eliminará tu fotografía de Drive y tu fila de la hoja de cálculo, y quedará una marca técnica mínima hasta la limpieza para impedir otro envío. La retirada de una fila no elimina por sí sola el historial de versiones del proveedor; la hoja completa se elimina al finalizar el plazo. El equipo debe excluir igualmente sus copias locales y derivadas. Antes de la presentación revisaremos las solicitudes; una solicitud posterior no puede revertir lo que ya se mostró.</p><p>Para acceso, rectificación, cancelación, oposición, revocación del consentimiento o límites de uso, escribe al contacto del responsable con tu comprobante y la descripción de tu solicitud. Evita adjuntar datos sensibles innecesarios. Si ya no tienes el navegador o el comprobante, explica el caso para acordar una forma proporcional de identificar el aporte. Se atenderá conforme a los plazos y requisitos legales aplicables.</p><h2>7. Responsable y contacto</h2><div class="contact"><p><strong>${escape(config.controller || 'Identidad pendiente de completar')}</strong><br>${escape(config.address || 'Domicilio pendiente de completar')}</p><p>${config.contact ? `<a href="mailto:${escape(config.contact)}">${escape(config.contact)}</a>` : 'Correo de privacidad pendiente de completar.'}</p></div><h2>8. Cambios al aviso</h2><p>La versión vigente se publicará en esta misma ruta. Cualquier cambio sustancial en finalidades o condiciones requerirá el consentimiento correspondiente antes de aplicar nuevos usos; no se ampliará retroactivamente la autorización original.</p><section class="withdraw" aria-label="Retirar mi participación"><h2>Tu participación sigue siendo tuya.</h2><p id="withdraw-info">Para retirar tus aportes utiliza el mismo navegador desde el que los enviaste o contacta al responsable.</p><button class="button secondary" id="withdraw-button" type="button" hidden>Retirar mis aportaciones</button><p id="withdraw-status" class="status" role="status" aria-live="polite"></p></section></article>`;
  if (!config.ready || Date.now() >= Date.parse(config.purgeAt)) return;
  const status = document.querySelector('#withdraw-status');
  try {
    const session = await api('/api/session');
    const active = [session.photo, session.text].filter(record => record && !record.withdrawn);
    if (!active.length) { document.querySelector('#withdraw-info').textContent = 'No hay aportaciones activas asociadas a este navegador. Si participaste desde otro dispositivo, usa ese navegador o escribe al responsable.'; return; }
    const button = document.querySelector('#withdraw-button');
    button.hidden = false;
    let confirmed = false;
    button.addEventListener('click', async () => {
      if (!confirmed) { confirmed = true; button.textContent = 'Confirmar retirada de mis aportaciones'; setMessage(status, 'Se retirarán tu foto y tu respuesta. No podrás volver a enviarlas desde este navegador. Presiona de nuevo para confirmar.'); return; }
      button.disabled = true;
      setMessage(status, 'Solicitando retirada…');
      try {
        await api('/api/withdraw', { confirm: true }, session.csrf);
        button.hidden = true;
        setMessage(status, config.mode === 'demo' ? 'Retirada simulada. No había datos en Google.' : 'Tu fotografía y tu fila de respuestas se retiraron de la colección en línea. El equipo debe excluir sus copias de trabajo.');
      } catch (error) { button.disabled = false; setMessage(status, error.message, true); }
    });
  } catch (error) { setMessage(status, error.message, true); }
}

async function start() {
  for (const link of document.querySelectorAll('nav a')) if (link.getAttribute('href') === route) link.setAttribute('aria-current', 'page');
  try {
    config = await api('/api/config');
    if (config.mode === 'demo') { banner.hidden = false; banner.textContent = 'DEMO LOCAL · Solo una prueba de la experiencia. Nada se envía a Google; no uses información personal real.'; }
    else if (!config.ready) { banner.hidden = false; banner.textContent = 'La obra está en preparación. Por ahora no estamos recibiendo fotografías ni respuestas.'; }
    if (route === '/') renderHome();
    else if (route === '/foto') await renderPiece('photo');
    else if (route === '/preguntas') await renderPiece('text');
    else if (route === '/legal') await renderLegal();
    else main.innerHTML = '<h1>Este camino no existe.</h1><a class="button secondary" href="/">Volver al inicio</a>';
  } catch (error) { main.innerHTML = `<h1>No pudimos conectar.</h1><p class="intro">${escape(error.message)}</p><a class="button secondary" href="${['/', '/foto', '/preguntas', '/legal'].includes(route) ? route : '/'}">Volver a intentar</a>`; }
}
start();
