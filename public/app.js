const $ = selector => document.querySelector(selector);
const main = $('#main');
const page = document.body.dataset.page;
const kind = page === 'photo' ? 'photo' : 'text';
const urlParams = new URLSearchParams(location.search);
const enableInteraction = urlParams.getAll('enable').length === 1 && urlParams.get('enable') === 'true';
const instagramUrl = 'https://www.instagram.com/nyx.sonoro?obrf=MW0xaXA2OHoweHkwMw==';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const initialFormHTML = $('#piece')?.innerHTML || '';
let config, session, prepared, busy = false, uncertain = false, photoGeneration = 0;

// Only active requests lock the page. This cannot block OS-level tab/app closure.
let transferOverlay, previousFocus, transferTimer;
function guardExit(event) { event.preventDefault(); event.returnValue = ''; }
function guardInteraction(event) {
  if (transferOverlay?.hidden !== false) return;
  if (event.type === 'keydown' && !['Tab','Escape','Enter',' '].includes(event.key)) return;
  if (event.type === 'keydown' || !transferOverlay.contains(event.target)) {
    event.preventDefault(); event.stopImmediatePropagation();
    transferOverlay.focus({ preventScroll:true });
  }
}
function guardFocus(event) {
  if (transferOverlay?.hidden === false && !transferOverlay.contains(event.target)) transferOverlay.focus({ preventScroll:true });
}
function showTransfer(active, title = 'ENVIANDO…') {
  if (!active) {
    if (!transferOverlay || transferOverlay.hidden) return;
    clearTimeout(transferTimer);
    transferOverlay.hidden = true;
    $('.shell')?.removeAttribute('inert');
    main.removeAttribute('aria-busy');
    document.documentElement.classList.remove('nyx-sending');
    window.removeEventListener('beforeunload', guardExit);
    ['click','pointerdown','keydown'].forEach(type => document.removeEventListener(type,guardInteraction,true));
    document.removeEventListener('focusin',guardFocus,true);
    if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus({preventScroll:true});
    return;
  }
  if (!transferOverlay) {
    transferOverlay = document.createElement('div');
    transferOverlay.id = 'nyx-transfer';
    transferOverlay.className = 'nyx-transfer';
    transferOverlay.hidden = true;
    transferOverlay.tabIndex = -1;
    transferOverlay.setAttribute('role','alertdialog');
    transferOverlay.setAttribute('aria-modal','true');
    transferOverlay.setAttribute('aria-labelledby','nyx-transfer-title');
    transferOverlay.setAttribute('aria-describedby','nyx-transfer-hint');
    // Particle positions are in the stylesheet; no CSP-blocked inline styles.
    const particles = '<i></i>'.repeat(24);
    transferOverlay.innerHTML = `<div class="nyx-transfer-content"><div class="nyx-transfer-particles" aria-hidden="true">${particles}</div><strong id="nyx-transfer-title"></strong><p id="nyx-transfer-hint">No cierres esta página.<br>Estamos esperando la confirmación.</p><p id="nyx-transfer-wait" role="status" aria-live="polite"></p></div>`;
    document.body.append(transferOverlay);
  }
  previousFocus = document.activeElement;
  $('#nyx-transfer-title').textContent = title;
  $('#nyx-transfer-wait').textContent = '';
  transferOverlay.hidden = false;
  transferOverlay.focus({preventScroll:true});
  $('.shell')?.setAttribute('inert','');
  main.setAttribute('aria-busy','true');
  document.documentElement.classList.add('nyx-sending');
  window.addEventListener('beforeunload',guardExit);
  ['click','pointerdown','keydown'].forEach(type => document.addEventListener(type,guardInteraction,true));
  document.addEventListener('focusin',guardFocus,true);
  clearTimeout(transferTimer);
  transferTimer = setTimeout(() => {
    if (!transferOverlay.hidden) $('#nyx-transfer-wait').textContent = 'Sigue en proceso. No hace falta volver a pulsar enviar.';
  }, 12000);
}

// No polling or automatic re-upload. A timeout is NOT proof Google rejected a write.
async function api(path, body, extra = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), body instanceof Blob ? 120000 : 45000);
  const headers = body ? { 'X-Nyx-Csrf':session?.csrf || '', ...extra } : {};
  if (body && !(body instanceof Blob)) headers['Content-Type'] = 'application/json';
  try {
    const endpoint = path + (enableInteraction ? '?enable=true' : '');
    const response = await fetch(endpoint, { method:body ? 'POST' : 'GET', credentials:'same-origin', cache:'no-store', headers, body:body instanceof Blob ? body : body ? JSON.stringify(body) : undefined, signal:controller.signal });
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
  el.textContent = text; el.classList.toggle('error',error);
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
  panel.innerHTML = `<section class="notice"><h2>${esc(title)}</h2><p>${esc(text)}</p>${retry ? '<button class="secondary" id="reconnect">REINTENTAR CONEXIÓN</button>' : ''}</section>`;
  if (retry) $('#reconnect').addEventListener('click',() => location.reload());
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
async function restartContribution() {
  if (!initialFormHTML || !enableInteraction || config?.phase !== 'open' || !session || busy) return;
  photoGeneration++;
  releasePhoto(); uncertain = false;
  $('#piece').innerHTML = initialFormHTML;
  await bindForm();
  $('#piece h1')?.setAttribute('tabindex','-1');
  $('#piece h1')?.focus({preventScroll:true});
}
function receiptView(entry) {
  releasePhoto();
  const cancelled = entry.withdrawn === true;
  const pending = entry.pending === true;
  const canResend = cancelled && enableInteraction && config?.phase === 'open';
  const label = config.mode === 'demo' ? 'SIMULACIÓN / NO SE GUARDÓ EN GOOGLE' : pending ? 'RECEPCIÓN POR CONFIRMAR' : cancelled ? 'ENVÍO ANULADO' : 'ENVÍO RECIBIDO';
  $('#piece').innerHTML = `<section class="receipt-panel ${cancelled ? 'cancelled' : ''}" aria-labelledby="result-title"><div class="eyebrow">${label}</div><div class="receipt-mark" aria-hidden="true">${cancelled ? '×' : pending ? '…' : '[✓]'}</div><h1 id="result-title" tabindex="-1">${cancelled ? 'TÚ DECIDES.' : pending ? 'COMPROBANDO.' : 'YA ERES<br><span>PARTE.</span>'}</h1><p>${cancelled ? canResend ? 'Tu aportación se retiró. Ya puedes enviar otra.' : 'Tu aportación se retiró. La recepción no está habilitada en este enlace.' : pending ? 'La recepción quedó pendiente. Comprueba su estado o anúlala; no subas otro archivo.' : config.mode === 'demo' ? 'Prueba local: no se utilizará en la obra.' : page === 'photo' ? 'Tu foto fue recibida para la obra.' : 'Tu respuesta fue recibida para la lectura.'}</p><code class="receipt-code">${esc(entry.receipt || '')}</code><div id="receipt-actions" class="actions">${pending ? '<button class="secondary" id="check-status">COMPROBAR ESTADO</button>' : ''}${!cancelled ? '<button class="danger" id="unsend">ANULAR ENVÍO ANTERIOR</button>' : ''}${canResend ? `<button class="secondary" id="restart-contribution">${kind === 'photo' ? 'ENVIAR OTRA FOTO' : 'ESCRIBIR OTRA IDEA'} ↗</button>` : ''}</div><a class="instagram-after" href="${instagramUrl}" target="_blank" rel="noopener noreferrer">SÍGUENOS EN INSTAGRAM · NYX SONORO ↗</a><p id="receipt-status" class="status" role="status" aria-live="polite"></p><p class="micro">${cancelled ? 'Las copias locales deben retirarse por el equipo.' : 'Un aporte activo por tipo. Puedes anularlo y enviar otro.'}</p></section>`;
  $('#result-title').focus({preventScroll:true});
  $('#restart-contribution')?.addEventListener('click',restartContribution);
  $('#check-status')?.addEventListener('click',async () => {
    if (busy) return;
    busy = true; $('#check-status').disabled = true; showTransfer(true,'COMPROBANDO…');
    try {
      const current = await refreshSession();
      busy = false; showTransfer(false);
      if (current && !current.pending) receiptView(current);
      else message('Sigue pendiente. Puedes comprobar más tarde o anular.',false,'#receipt-status');
    } catch (error) { message(error.message,true,'#receipt-status'); }
    finally { busy = false; showTransfer(false); if ($('#check-status')) $('#check-status').disabled = false; }
  });
  $('#unsend')?.addEventListener('click',() => {
    if (busy) return;
    $('#receipt-actions').innerHTML = `<p>¿Anular ${kind === 'photo' ? 'esta foto' : 'esta respuesta'}? Podrás enviar otra.</p><div class="confirm-row"><button class="secondary" id="keep">CONSERVAR</button><button class="danger" id="confirm-unsend">SÍ, ANULAR</button></div>`;
    $('#keep').addEventListener('click',() => receiptView(entry));
    $('#confirm-unsend').addEventListener('click',async () => {
      if (busy) return;
      busy = true; $('#confirm-unsend').disabled = true; $('#keep').disabled = true;
      showTransfer(true,'ANULANDO…');
      try {
        await api('/api/withdraw',{confirm:true,kind,receipt:entry.receipt});
        session[kind] = {...entry,withdrawn:true,pending:false};
        busy = false; showTransfer(false); receiptView(session[kind]);
      } catch (error) {
        message(error.code === 'UPDATE_REQUIRED' || error.code === 'STALE' ? error.message : error.uncertain ? 'No pudimos confirmar la anulación. Reintentar es seguro.' : error.message,true,'#receipt-status');
      } finally {
        busy = false; showTransfer(false);
        if ($('#confirm-unsend')) $('#confirm-unsend').disabled = false;
        if ($('#keep')) $('#keep').disabled = false;
      }
    });
  });
}

let legalOverlay = null;
async function openLegalOverlay() {
  if (busy) return;
  if (legalOverlay) { legalOverlay.hidden = false; document.documentElement.classList.add('legal-open'); $('#legal-close').focus(); return; }
  const {renderLegal} = await import('./legal.js');
  const overlay = document.createElement('div');
  overlay.id = 'legal-overlay'; overlay.className = 'legal-overlay';
  overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label','Términos y privacidad');
  overlay.innerHTML = '<section class="legal-dialog"><button type="button" id="legal-close" class="legal-close" aria-label="Cerrar aviso legal">CERRAR ×</button><div class="legal legal-body" id="inline-legal-content"></div></section>';
  document.body.append(overlay);
  const close = () => { overlay.hidden = true; document.documentElement.classList.remove('legal-open'); $('#terms-open')?.focus(); };
  $('#legal-close').addEventListener('click',close);
  overlay.addEventListener('click',event => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown',event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const focusable = Array.from(overlay.querySelectorAll('button:not(:disabled),a[href]'));
      if (!focusable.length) return;
      const first = focusable[0],last = focusable[focusable.length-1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  renderLegal($('#inline-legal-content'),config,esc);
  document.documentElement.classList.add('legal-open'); legalOverlay = overlay; $('#legal-close').focus();
}

async function bindForm() {
  $('#fields').disabled = false;
  if (page === 'text') {
    $('#question').textContent = session.question.text;
    $('#question-label').textContent = `TU PREGUNTA / ${String(session.question.id).padStart(3,'0')}`;
    $('#answer').addEventListener('input',() => { $('#counter').textContent = `${$('#answer').value.length} / 500`; controls(); });
  } else {
    const picker = $('#photo-file');
    $('#change-photo').addEventListener('click',() => picker.click());
    picker.addEventListener('change',async () => {
      const file = picker.files?.[0]; if (!file || busy || uncertain) return;
      const generation = ++photoGeneration;
      releasePhoto(); $('#preview-box').hidden = true; $('#picker').hidden = false;
      $('#photo-frame').dataset.processing = 'true'; controls(); message('Preparando una versión ligera…');
      try {
        const {preparePhoto} = await import('./photo.js');
        const result = await preparePhoto(file,config);
        if (generation !== photoGeneration) { URL.revokeObjectURL(result.previewUrl); return; }
        prepared = result; $('#preview').src = prepared.previewUrl;
        $('#photo-info').textContent = `${Math.ceil(prepared.blob.size / 1024)} KB · ${prepared.width} × ${prepared.height}`;
        $('#preview-box').hidden = false; $('#picker').hidden = true; message();
      } catch (error) { message(error.message,true); }
      finally { picker.value = ''; $('#photo-frame').dataset.processing = 'false'; controls(); }
    });
  }
  $('#terms-open').addEventListener('click',() => openLegalOverlay().catch(() => message('No se pudo abrir el aviso. Reintenta cuando tengas señal.',true)));
  $('#consent').addEventListener('change',controls);
  $('#contribution').addEventListener('submit',async event => {
    event.preventDefault();
    if (busy || $('#send').disabled) return;
    if (!uncertain && !event.currentTarget.reportValidity()) return;
    busy = true; controls(); showTransfer(true,uncertain ? 'COMPROBANDO…' : 'ENVIANDO…');
    if (uncertain) {
      try {
        const previous = await refreshSession();
        if (previous) { busy = false; showTransfer(false); receiptView(previous); return; }
        uncertain = false; message('No consta recibido todavía. Pulsa ENVIAR para reintentar el mismo aporte.');
      } catch (error) { message(error.message,true); }
      finally { busy = false; controls(); showTransfer(false); }
      return;
    }
    try {
      const replacesReceipt = session[kind]?.withdrawn ? session[kind].receipt : null;
      const body = page === 'photo' ? prepared.blob : {answer:$('#answer').value,consent:true,enable_interaction:enableInteraction === true,termsVersion:config.termsVersion,website:$('#website').value,replacesReceipt};
      const headers = page === 'photo' ? {'Content-Type':'image/jpeg',...(enableInteraction ? {'X-Nyx-Enable-Interaction':'true'} : {}),'X-Nyx-Consent':'true','X-Nyx-Terms':config.termsVersion,'X-Nyx-Website':$('#website').value,...(replacesReceipt ? {'X-Nyx-Replaces':replacesReceipt} : {})} : {};
      const result = await api(page === 'photo' ? '/api/photo' : '/api/answer',body,headers);
      session[kind] = result;
      busy = false; showTransfer(false); receiptView(result);
    } catch (error) {
      uncertain = error.uncertain === true;
      message(uncertain ? 'No hay confirmación. Comprueba antes de volver a enviar.' : error.message,true);
    } finally { busy = false; controls(); showTransfer(false); }
  });
  controls();
}
async function boot() {
  try {
    if (page === 'home') return;
    if (page === 'legal') {
      config = await api('/api/config'); updatePhase();
      const {renderLegal} = await import('./legal.js'); renderLegal($('#legal-content'),config,esc); return;
    }
    const state = await api('/api/bootstrap');
    config = state.config; session = state.session; updatePhase();
    if (!config.ready) { showNotice('AÚN NO ABRIMOS.','La participación se está preparando.'); return; }
    if (session?.[kind]) { receiptView(session[kind]); return; }
    if (config.phase !== 'open' || !session) { showNotice('RECEPCIÓN CERRADA.',config.phase === 'soon' ? 'La participación todavía no comienza.' : 'Ahora no se reciben aportaciones.'); return; }
    await bindForm();
  } catch (error) {
    $('#phase').textContent = 'SIN CONEXIÓN';
    if (page === 'home') return;
    showNotice('NO PUDIMOS CONECTAR.','Reintenta cuando tengas señal. No se envió nada desde esta pantalla.',true);
  }
}
window.addEventListener('pagehide',releasePhoto);
window.addEventListener('pageshow',event => { if (event.persisted && !['home','legal'].includes(page)) location.reload(); });
boot();
