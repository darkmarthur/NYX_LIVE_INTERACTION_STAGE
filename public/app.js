const $ = selector => document.querySelector(selector);
const main = $('#main');
const page = document.body.dataset.page;
const kind = page === 'photo' ? 'photo' : 'text';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let config, session, prepared, busy = false, uncertain = false, photoGeneration = 0;

// No polling or automatic re-upload. A timeout is NOT proof that Google rejected a write.
async function api(path, body, extra = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), body instanceof Blob ? 120000 : 45000);
  const headers = body ? { 'X-Nyx-Csrf': session?.csrf || '', ...extra } : {};
  if (body && !(body instanceof Blob)) headers['Content-Type'] = 'application/json';
  try {
    const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials:'same-origin', cache:'no-store', headers, body: body instanceof Blob ? body : body ? JSON.stringify(body) : undefined, signal:controller.signal });
    const result = await response.json();
    if (result.ok === true) return result.data;
    const error = new Error(result.error?.message || 'No pudimos confirmar la operación.');
    error.code = result.error?.code;
    error.uncertain = response.status >= 500 || response.status === 429;
    throw error;
  } catch (error) {
    if (error.uncertain === undefined) {
      error.uncertain = true;
      error.message = 'No hay confirmación. Conserva esta página y comprueba el envío.';
    }
    throw error;
  } finally { clearTimeout(timeout); }
}
function message(text = '', error = false, selector = '#status') {
  const el = $(selector); if (!el) return;
  el.textContent = text; el.classList.toggle('error', error);
}
function releasePhoto() {
  if (prepared) URL.revokeObjectURL(prepared.previewUrl);
  prepared = null;
}
function updatePhase() {
  const open = config.phase === 'open';
  $('#phase').textContent = config.mode === 'demo' ? 'DEMO LOCAL' : open ? 'RECIBIENDO' : config.phase === 'closed' ? 'CERRADO' : 'EN PREPARACIÓN';
  $('#phase').dataset.open = String(open);
}
function showNotice(title, text, retry = false) {
  const panel = $('#panel') || main;
  panel.innerHTML = `<section class="notice"><h2>${esc(title)}</h2><p>${esc(text)}</p>${retry ? '<button class="secondary" id="reconnect">REINTENTAR CONEXIÓN</button>' : '<a class="secondary" href="/">VOLVER</a>'}</section>`;
  if (retry) $('#reconnect').addEventListener('click', () => location.reload());
}
function controls() {
  const button = $('#send'); if (!button) return;
  const processing = $('#photo-frame')?.dataset.processing === 'true';
  $('#consent').disabled = busy || uncertain;
  if ($('#answer')) $('#answer').disabled = busy || uncertain;
  if ($('#photo-file')) $('#photo-file').disabled = busy || uncertain || processing;
  if ($('#change-photo')) $('#change-photo').disabled = busy || uncertain || processing;
  button.disabled = busy || processing || (!uncertain && (!$('#consent').checked || (page === 'photo' ? !prepared : $('#answer').value.trim().length < 3)));
  button.innerHTML = busy ? 'ESPERA…' : uncertain ? 'COMPROBAR ENVÍO' : 'ENVIAR <span aria-hidden="true">↗</span>';
}
async function refreshSession() { session = await api('/api/session'); return session[kind]; }
function receiptView(entry) {
  releasePhoto();
  const cancelled = entry.withdrawn === true;
  const pending = entry.pending === true;
  const label = config.mode === 'demo' ? 'SIMULACIÓN / NO SE GUARDÓ EN GOOGLE' : pending ? 'RECEPCIÓN POR CONFIRMAR' : cancelled ? 'ENVÍO ANULADO' : 'ENVÍO RECIBIDO';
  $('#piece').innerHTML = `<section class="receipt-panel ${cancelled ? 'cancelled' : ''}" aria-labelledby="result-title"><div class="eyebrow">${label}</div><div class="receipt-mark" aria-hidden="true">${cancelled ? '×' : pending ? '…' : '[✓]'}</div><h1 id="result-title" tabindex="-1">${cancelled ? 'TÚ DECIDES.' : pending ? 'COMPROBANDO.' : 'YA ERES<br><span>PARTE.</span>'}</h1><p>${cancelled ? 'Tu aportación se retiró. No puedes volver a enviar desde este navegador.' : pending ? 'La recepción quedó pendiente. Comprueba su estado o anúlala; no subas otro archivo.' : config.mode === 'demo' ? 'Prueba local: no se utilizará en la obra.' : page === 'photo' ? 'Tu foto fue recibida para la obra.' : 'Tu respuesta fue recibida para la lectura.'}</p><code class="receipt-code">${esc(entry.receipt || '')}</code><div id="receipt-actions" class="actions">${pending ? '<button class="secondary" id="check-status">COMPROBAR ESTADO</button>' : ''}${!cancelled ? '<button class="danger" id="unsend">ANULAR ENVÍO ANTERIOR</button>' : ''}</div><p id="receipt-status" class="status" role="status" aria-live="polite"></p><p class="micro">${cancelled ? 'Las copias locales deben retirarse por el equipo.' : 'Un envío por navegador. Anular no permite volver a enviar.'}</p></section>`;
  $('#result-title').focus({ preventScroll:true });
  $('#check-status')?.addEventListener('click', async () => {
    $('#check-status').disabled = true;
    try {
      const current = await refreshSession();
      if (current && !current.pending) receiptView(current);
      else message('Sigue pendiente. Puedes comprobar más tarde o anular.', false, '#receipt-status');
    } catch (error) { message(error.message, true, '#receipt-status'); }
    finally { if ($('#check-status')) $('#check-status').disabled = false; }
  });
  $('#unsend')?.addEventListener('click', () => {
    $('#receipt-actions').innerHTML = `<p>¿Anular ${kind === 'photo' ? 'esta foto' : 'esta respuesta'}? No podrás reenviar.</p><div class="confirm-row"><button class="secondary" id="keep">CONSERVAR</button><button class="danger" id="confirm-unsend">SÍ, ANULAR</button></div>`;
    $('#keep').addEventListener('click', () => receiptView(entry));
    $('#confirm-unsend').addEventListener('click', async () => {
      $('#confirm-unsend').disabled = true; $('#keep').disabled = true;
      message('Anulando…', false, '#receipt-status');
      try {
        await api('/api/withdraw', { confirm:true, kind });
        receiptView({ ...entry, withdrawn:true, pending:false });
      } catch (error) {
        message(error.uncertain ? 'No pudimos confirmar la anulación. Reintentar es seguro.' : error.message, true, '#receipt-status');
        // UPDATE_REQUIRED is actionable; do not hide it behind a generic network message.
        if (error.code === 'UPDATE_REQUIRED') message(error.message, true, '#receipt-status');
        $('#confirm-unsend').disabled = false; $('#keep').disabled = false;
      }
    });
  });
}
async function bindForm() {
  $('#fields').disabled = false;
  if (page === 'text') {
    $('#question').textContent = session.question.text;
    $('#question-label').textContent = `TU PREGUNTA / ${String(session.question.id).padStart(3, '0')}`;
    $('#answer').addEventListener('input', () => { $('#counter').textContent = `${$('#answer').value.length} / 500`; controls(); });
  } else {
    const picker = $('#photo-file');
    $('#change-photo').addEventListener('click', () => picker.click());
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0]; if (!file || busy || uncertain) return;
      const generation = ++photoGeneration;
      releasePhoto();
      $('#preview-box').hidden = true; $('#picker').hidden = false;
      $('#photo-frame').dataset.processing = 'true'; controls();
      message('Preparando una versión ligera…');
      try {
        // The compression code and worker are fetched ONLY after selecting a file.
        const { preparePhoto } = await import('./photo.js');
        const result = await preparePhoto(file, config);
        if (generation !== photoGeneration) { URL.revokeObjectURL(result.previewUrl); return; }
        prepared = result;
        $('#preview').src = prepared.previewUrl;
        $('#photo-info').textContent = `${Math.ceil(prepared.blob.size / 1024)} KB · ${prepared.width} × ${prepared.height}`;
        $('#preview-box').hidden = false; $('#picker').hidden = true;
        message();
      } catch (error) { message(error.message, true); }
      finally { picker.value = ''; $('#photo-frame').dataset.processing = 'false'; controls(); }
    });
  }
  $('#consent').addEventListener('change', controls);
  $('#contribution').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || $('#send').disabled) return;
    if (!uncertain && !event.currentTarget.reportValidity()) return;
    busy = true; controls();
    if (uncertain) {
      message('Consultando sin volver a subir tu archivo…');
      try {
        const previous = await refreshSession();
        if (previous) { receiptView(previous); return; }
        uncertain = false;
        message('No consta recibido todavía. Pulsa ENVIAR para reintentar el mismo aporte.');
      } catch (error) { message(error.message, true); }
      finally { busy = false; controls(); }
      return;
    }
    message(page === 'photo' ? `Enviando ${Math.ceil(prepared.blob.size / 1024)} KB. Mantén esta página abierta…` : 'Enviando tu respuesta…');
    try {
      const body = page === 'photo' ? prepared.blob : { answer:$('#answer').value, consent:true, termsVersion:config.termsVersion, website:$('#website').value };
      const headers = page === 'photo' ? { 'Content-Type':'image/jpeg', 'X-Nyx-Consent':'true', 'X-Nyx-Terms':config.termsVersion, 'X-Nyx-Website':$('#website').value } : {};
      const result = await api(page === 'photo' ? '/api/photo' : '/api/answer', body, headers);
      receiptView(result);
    } catch (error) {
      uncertain = error.uncertain === true;
      message(uncertain ? 'No hay confirmación. Comprueba antes de volver a enviar.' : error.message, true);
    } finally { busy = false; controls(); }
  });
  controls();
}
async function boot() {
  try {
    if (page === 'home' || page === 'legal') {
      config = await api('/api/config'); updatePhase();
      if (page === 'legal') {
        const { renderLegal } = await import('./legal.js');
        renderLegal($('#legal-content'), config, esc);
      }
      return;
    }
    const state = await api('/api/bootstrap');
    config = state.config; session = state.session; updatePhase();
    if (!config.ready) { showNotice('AÚN NO ABRIMOS.', 'La participación se está preparando.'); return; }
    if (session?.[kind]) { receiptView(session[kind]); return; }
    if (config.phase !== 'open' || !session) { showNotice('RECEPCIÓN CERRADA.', config.phase === 'soon' ? 'La participación todavía no comienza.' : 'Ahora no se reciben aportaciones.'); return; }
    await bindForm();
  } catch (error) {
    $('#phase').textContent = 'SIN CONEXIÓN';
    if (page === 'home') return; // Keep the static entry links usable.
    showNotice('NO PUDIMOS CONECTAR.', 'Reintenta cuando tengas señal. No se envió nada desde esta pantalla.', true);
  }
}
window.addEventListener('pagehide', releasePhoto);
// BFCache must not revive a stale, already-used form after back navigation.
window.addEventListener('pageshow', event => { if (event.persisted && !['home','legal'].includes(page)) location.reload(); });
boot();
