const $ = selector => document.querySelector(selector);
const main = $('#main'), page = document.body.dataset.page;
const kind = page === 'photo' ? 'photo' : 'text';
const params = new URLSearchParams(location.search);
const enabled = params.getAll('enable').length === 1 && params.get('enable') === 'true';
const instagram = 'https://www.instagram.com/nyx.sonoro?obrf=MW0xaXA2OHoweHkwMw==';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formHTML = $('#piece')?.innerHTML || '';
const storageKey = `nyx:v6:draft:${kind}`;
let config, session, prepared, busy = false, uncertain = false, attempted = false, generation = 0, draftId;
const uuid = () => [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2,'0')).join('');
try { draftId = sessionStorage.getItem(storageKey); } catch {}
if (!/^[a-f0-9]{32}$/.test(draftId || '')) draftId = uuid();
function remember() { try { sessionStorage.setItem(storageKey, draftId); } catch {} }
remember(); // ONLY a random id, never the photo or answer.

async function api(path, body, extra = {}, query = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), body instanceof Blob ? 120000 : 45000);
  const target = new URL(path, location.origin);
  if (enabled) target.searchParams.set('enable','true');
  target.searchParams.set('kind',kind);
  if (!body) target.searchParams.set('requestId',draftId);
  for (const [key, value] of Object.entries(query)) if (value) target.searchParams.set(key,value);
  const headers = body ? {'X-Nyx-Csrf':session?.csrf || '',...extra} : {};
  if (body && !(body instanceof Blob)) headers['Content-Type'] = 'application/json';
  try {
    const response = await fetch(target.pathname + target.search, {method:body ? 'POST' : 'GET',credentials:'same-origin',cache:'no-store',headers,
      body:body instanceof Blob ? body : body ? JSON.stringify(body) : undefined,signal:controller.signal});
    const result = await response.json();
    if (response.ok && result?.ok === true) {
      if (['/api/photo','/api/answer'].includes(path) && !/^NYX-[a-f0-9]{32}$/.test(result.data?.receipt || '')) throw new Error('Comprobante inválido. Comprueba el estado.');
      return result.data;
    }
    const error = new Error(result?.error?.message || 'No pudimos confirmar la operación.');
    error.code = result?.error?.code || `HTTP_${response.status}`;
    error.uncertain = response.status >= 500 || response.status === 429;
    throw error;
  } catch (error) {
    if (error.uncertain === undefined) {error.uncertain = true; error.message = 'No hay confirmación. Conserva esta página y comprueba el envío.';}
    throw error;
  } finally { clearTimeout(timer); }
}
function message(text = '', error = false, selector = '#status') {
  const element = $(selector); if (element) {element.textContent = text; element.classList.toggle('error',error);}
}
function releasePhoto() { if (prepared) URL.revokeObjectURL(prepared.previewUrl); prepared = null; }
function phase() {
  $('#phase').textContent = config.mode === 'demo' ? 'DEMO LOCAL' : config.phase === 'open' ? 'RECIBIENDO' : config.phase === 'closed' ? 'CERRADO' : 'NO HABILITADO';
  $('#phase').dataset.open = String(config.phase === 'open');
}
function notice(title, text) {
  ($('#panel') || main).innerHTML = `<section class="notice"><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="secondary" id="reload">REINTENTAR</button></section>`;
  $('#reload').onclick = () => location.reload();
}
let transfer, oldFocus, sendingTimer;
function guardExit(event) { event.preventDefault(); event.returnValue = ''; }
function showTransfer(on, label = 'ENVIANDO…') {
  if (!on) {
    if (!transfer || transfer.hidden) return;
    clearTimeout(sendingTimer); transfer.hidden = true;
    $('.shell')?.removeAttribute('inert'); main.removeAttribute('aria-busy');
    document.documentElement.classList.remove('nyx-sending'); window.removeEventListener('beforeunload',guardExit);
    if (oldFocus?.isConnected && !oldFocus.disabled) oldFocus.focus({preventScroll:true}); return;
  }
  if (!transfer) {
    transfer = document.createElement('div'); transfer.className = 'nyx-transfer'; transfer.id = 'nyx-transfer'; transfer.tabIndex = -1;
    transfer.setAttribute('role','alertdialog'); transfer.setAttribute('aria-modal','true'); transfer.setAttribute('aria-labelledby','nyx-transfer-title');
    transfer.innerHTML = `<div class="nyx-transfer-content"><div class="nyx-transfer-particles" aria-hidden="true">${'<i></i>'.repeat(24)}</div><strong id="nyx-transfer-title"></strong><p>No cierres esta página.<br>Esperamos confirmación.</p><p id="nyx-transfer-wait" role="status"></p></div>`;
    transfer.addEventListener('keydown',event => { if (event.key === 'Tab' || event.key === 'Escape') {event.preventDefault();transfer.focus();} });
    document.body.append(transfer);
  }
  oldFocus = document.activeElement; $('#nyx-transfer-title').textContent = label; $('#nyx-transfer-wait').textContent = '';
  transfer.hidden = false; transfer.focus({preventScroll:true}); $('.shell')?.setAttribute('inert',''); main.setAttribute('aria-busy','true');
  document.documentElement.classList.add('nyx-sending'); window.addEventListener('beforeunload',guardExit);
  clearTimeout(sendingTimer); sendingTimer = setTimeout(() => { if (!transfer.hidden) $('#nyx-transfer-wait').textContent = 'Sigue en proceso. No vuelvas a enviar.'; },12000);
}
let overlay, returnFocus;
function closeOverlay() {
  if (busy) return;
  if (overlay) overlay.remove(); overlay = null;
  $('.shell')?.removeAttribute('inert'); document.documentElement.classList.remove('legal-open');
  if (returnFocus?.isConnected && !returnFocus.disabled) returnFocus.focus({preventScroll:true});
}
function openOverlay(label, html) {
  if (overlay) overlay.remove();
  returnFocus = document.activeElement;
  overlay = document.createElement('div'); overlay.className = 'legal-overlay'; overlay.id = 'multi-overlay';
  overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label',label);
  overlay.innerHTML = `<section class="legal-dialog"><button class="legal-close" id="multi-close" type="button">CERRAR ×</button><div id="multi-content" class="legal">${html}</div></section>`;
  document.body.append(overlay); $('#multi-close').onclick = closeOverlay;
  overlay.addEventListener('keydown',event => {
    if (event.key === 'Escape') {event.preventDefault();closeOverlay();}
    if (event.key === 'Tab') {
      const all = [...overlay.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')], first=all[0], last=all.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    }
  });
  $('#multi-close').focus(); $('.shell')?.setAttribute('inert',''); document.documentElement.classList.add('legal-open');
}
function showFailure(error, canCheck = false) {
  showTransfer(false);
  openOverlay('Estado del envío',`<p class="eyebrow">NYX / ESTADO DEL ENVÍO</p><h2>${error.uncertain ? 'NO HAY CONFIRMACIÓN' : 'NO SE COMPLETÓ LA OPERACIÓN'}</h2><p>${esc(error.message)}</p><code>Referencia: ${esc(error.code || 'SIN_CONFIRMACION')}</code><p>Tu selección sigue en esta página.</p>${canCheck ? '<button class="secondary" id="error-check">COMPROBAR ENVÍO</button>' : ''}`);
  $('#error-check')?.addEventListener('click',() => {closeOverlay();uncertain=true;controls();$('#send')?.click();});
}
function controls() {
  const send = $('#send'); if (!send) return;
  const processing = $('#photo-frame')?.dataset.processing === 'true', lock = busy || uncertain || attempted;
  $('#consent').disabled = lock;
  for (const selector of ['#answer','#photo-file','#picker','#change-photo']) if ($(selector)) $(selector).disabled = lock || processing;
  send.disabled = busy || processing || (!uncertain && (!$('#consent').checked || (kind==='photo' ? !prepared : $('#answer').value.trim().length<3)));
  send.innerHTML = busy ? 'ESPERA…' : uncertain ? 'COMPROBAR ENVÍO' : 'ENVIAR ↗';
}
async function refresh() {session = await api('/api/session'); return session.current;}
function addHistoryButton() {
  if ($('#my-submissions') || !session?.total) return;
  const b = document.createElement('button'); b.id = 'my-submissions'; b.type = 'button'; b.className = 'secondary';
  b.textContent = 'MIS ENVÍOS'; b.onclick = () => history().catch(error => showFailure(error));
  $('#piece').append(b);
}
async function newContribution() {
  if (busy || !enabled || config?.phase !== 'open') return;
  busy=true;showTransfer(true,'PREPARANDO…');
  const oldId=draftId; draftId=uuid();
  try {
    const next=await api('/api/session'); session=next;remember();generation++;releasePhoto();uncertain=false;attempted=false;
    $('#piece').innerHTML=formHTML;bindForm();
    busy=false;showTransfer(false);controls();$('#piece h1')?.setAttribute('tabindex','-1');$('#piece h1')?.focus({preventScroll:true});
  } catch(error) {draftId=oldId;busy=false;showTransfer(false);showFailure(error);}
}
async function withdraw(entry) {
  const result = await api('/api/withdraw',{confirm:true,kind,receipt:entry.receipt});
  if (result?.withdrawn!==true || result.receipt!==entry.receipt || result.kind!==kind) throw new Error('No se confirmó la anulación.');
  return {...entry,withdrawn:true,pending:false,submitted:false};
}
function receiptView(entry) {
  if (!entry.pending) releasePhoto();
  const cancelled=entry.withdrawn, pending=entry.pending;
  const more=enabled && config?.phase==='open' && !pending;
  $('#piece').innerHTML=`<section class="receipt-panel ${cancelled?'cancelled':''}"><span class="eyebrow">NYX / ${config.mode==='demo'?'SIMULACIÓN LOCAL':'TU APORTACIÓN'}</span><h1 id="result-title" tabindex="-1">${cancelled?'ENVÍO ANULADO.':pending?'POR CONFIRMAR.':'ENVÍO RECIBIDO.'}</h1><p>${cancelled?'Solo se retiró esta aportación.':pending?'Comprueba o anula este intento. No se duplicará.':'Puedes enviar más, sin borrar los anteriores.'}</p><code class="receipt-code">${esc(entry.receipt)}</code><div class="actions" id="receipt-actions">${pending?'<button class="secondary" id="check-status">COMPROBAR ESTADO</button>':''}${more?`<button class="primary" id="restart-contribution">${kind==='photo'?'ENVIAR OTRA FOTO':'ESCRIBIR OTRA IDEA'} ↗</button>`:''}${!cancelled?'<button class="danger" id="unsend">ANULAR ESTE ENVÍO</button>':''}<button class="secondary" id="my-submissions">MIS ENVÍOS</button></div><a class="instagram-after" href="${instagram}" target="_blank" rel="noopener noreferrer">SÍGUENOS EN INSTAGRAM · NYX SONORO ↗</a><p id="receipt-status" class="status" role="status"></p></section>`;
  $('#result-title').focus({preventScroll:true});
  $('#restart-contribution')?.addEventListener('click',newContribution);
  $('#my-submissions').onclick=()=>history().catch(error=>showFailure(error));
  $('#check-status')?.addEventListener('click',async()=>{
    if(busy)return;busy=true;showTransfer(true,'COMPROBANDO…');
    try{const current=await refresh();busy=false;showTransfer(false);if(current)receiptView(current);else message('No consta recibido. Vuelve al enlace para intentar de nuevo.',false,'#receipt-status');}
    catch(error){busy=false;showTransfer(false);showFailure(error);}finally{busy=false;showTransfer(false);}
  });
  $('#unsend')?.addEventListener('click',()=>{
    if(busy)return;
    $('#receipt-actions').innerHTML='<p>¿Anular únicamente este envío?</p><div class="confirm-row"><button class="secondary" id="keep">CONSERVAR</button><button class="danger" id="confirm-unsend">SÍ, ANULAR</button></div>';
    $('#keep').onclick=()=>receiptView(entry);
    $('#confirm-unsend').onclick=async()=>{
      if(busy)return;busy=true;showTransfer(true,'ANULANDO…');
      try{const removed=await withdraw(entry);busy=false;showTransfer(false);session.current=removed;receiptView(removed);}
      catch(error){busy=false;showTransfer(false);showFailure(error);}finally{busy=false;showTransfer(false);}
    };
  });
}
async function history() {
  if(busy)return;
  openOverlay('Mis envíos','<h2>MIS ENVÍOS</h2><p id="history-status" role="status">Consultando…</p><div class="actions" id="history-list"></div><div id="history-more"></div>');
  const load=async before=>{
    const data=await api('/api/session',undefined,{},before?{before}:{});
    const list=$('#history-list');if(!list)return;
    $('#history-status').textContent=`${data.total} ${kind==='photo'?'fotografías':'respuestas'} en este navegador.`;
    for(const entry of data.items){
      const card=document.createElement('section');card.className='notice';
      let date='';const parsed=new Date(entry.createdAt);if(!Number.isNaN(parsed.getTime()))date=parsed.toLocaleString('es-MX',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      card.innerHTML=`<p>${kind==='photo'?'Foto':'Idea'} · ${esc(date)}<br><code>${esc(entry.receipt.slice(-8))}</code></p><p class="status">${entry.withdrawn?'ANULADO':entry.pending?'POR CONFIRMAR':'RECIBIDO'}</p>${!entry.withdrawn?'<button class="danger" type="button">ANULAR ESTE ENVÍO</button>':''}`;
      list.append(card);const button=card.querySelector('button');
      if(button)button.onclick=()=>{
        if(busy)return;
        if(button.dataset.confirm!=='true'){button.dataset.confirm='true';button.textContent='CONFIRMAR ANULACIÓN';return;}
        busy=true;button.disabled=true;$('#multi-close').disabled=true;
        withdraw(entry).then(()=>{
          entry.withdrawn=true;card.querySelector('.status').textContent='ANULADO';button.remove();
          if(session.current?.receipt===entry.receipt)session.current={...entry,withdrawn:true,pending:false};
        }).catch(error=>{card.querySelector('.status').textContent=error.message;button.disabled=false;})
        .finally(()=>{busy=false;if($('#multi-close'))$('#multi-close').disabled=false;});
      }
    }
    $('#history-more').innerHTML=data.next?'<button class="secondary" id="load-more" type="button">CARGAR MÁS</button>':'';
    $('#load-more')?.addEventListener('click',()=>{ $('#load-more').disabled=true;load(data.next).catch(error=>{message(error.message,true,'#history-status');if($('#load-more'))$('#load-more').disabled=false;}); });
  };
  await load();
}
async function openLegal() {
  if(busy)return;
  const {renderLegal}=await import('./legal.js');openOverlay('Términos y privacidad','<div id="legal-copy"></div>');renderLegal($('#legal-copy'),config,esc);
}
function bindForm() {
  $('#fields').disabled=false;
  if(kind==='text'){
    $('#question').textContent=session.question.text;$('#question-label').textContent=`TU PREGUNTA / ${String(session.question.id).padStart(3,'0')}`;
    $('#answer').oninput=()=>{ $('#counter').textContent=`${$('#answer').value.length} / 500`;controls();};
  } else {
    const picker=$('#photo-file');const choose=()=>{if(!busy&&!uncertain&&!attempted&&!picker.disabled)picker.click();};
    $('#picker').onclick=choose;$('#change-photo').onclick=choose;
    $('#photo-frame').onclick=event=>{if(event.target===event.currentTarget&&!$('#picker').hidden)choose();};
    picker.onchange=async()=>{
      const file=picker.files?.[0];if(!file||busy||attempted)return;
      const g=++generation;releasePhoto();$('#preview-box').hidden=true;$('#picker').hidden=false;$('#photo-frame').dataset.processing='true';controls();message('Preparando una versión ligera…');
      try{const {preparePhoto}=await import('./photo.js');const result=await preparePhoto(file,config);if(g!==generation){URL.revokeObjectURL(result.previewUrl);return;}
        prepared=result;$('#preview').src=result.previewUrl;$('#photo-info').textContent=`${Math.ceil(result.blob.size/1024)} KB · ${result.width} × ${result.height}`;$('#preview-box').hidden=false;$('#picker').hidden=true;message();}
      catch(error){message(error.message,true);}finally{picker.value='';$('#photo-frame').dataset.processing='false';controls();}
    };
  }
  $('#terms-open').onclick=()=>openLegal().catch(()=>message('No se pudo abrir el aviso. Reintenta cuando tengas señal.',true));
  $('#consent').onchange=controls;
  $('#contribution').onsubmit=async event=>{
    event.preventDefault();if(busy||$('#send').disabled)return;
    if(!uncertain&&!event.currentTarget.reportValidity())return;
    busy=true;controls();showTransfer(true,uncertain?'COMPROBANDO…':'ENVIANDO…');
    try{
      if(uncertain){
        const current=await refresh();busy=false;showTransfer(false);
        if(current?.submitted||current?.withdrawn){uncertain=false;receiptView(current);return;}
        uncertain=false;message(current?.pending?'La confirmación quedó pendiente. Pulsa ENVIAR para recuperar el mismo intento, sin duplicarlo.':'No consta recibido. Pulsa ENVIAR para reintentar el mismo aporte.');return;
      }
      attempted=true;
      const body=kind==='photo'?prepared.blob:{answer:$('#answer').value,consent:true,enable_interaction:enabled,termsVersion:config.termsVersion,website:$('#website').value};
      const headers={'X-Nyx-Request-Id':draftId,...(kind==='photo'?{'Content-Type':'image/jpeg','X-Nyx-Enable-Interaction':String(enabled),'X-Nyx-Consent':'true','X-Nyx-Terms':config.termsVersion,'X-Nyx-Website':$('#website').value}:{})};
      const result=await api(kind==='photo'?'/api/photo':'/api/answer',body,headers);
      session.current=result;busy=false;showTransfer(false);receiptView(result);
    }catch(error){
      uncertain=error.uncertain===true;
      if(['INVALID_TEXT','INVALID_IMAGE','CONSENT','TOO_LARGE'].includes(error.code))attempted=false;
      busy=false;showTransfer(false);showFailure(error,uncertain);
    }finally{busy=false;showTransfer(false);controls();}
  };
  addHistoryButton();controls();
}
async function boot() {
  if(page==='home')return;
  try{
    if(page==='legal'){config=await api('/api/config');phase();const {renderLegal}=await import('./legal.js');renderLegal($('#legal-content'),config,esc);return;}
    const result=await api('/api/bootstrap');config=result.config;session=result.session;phase();
    if(!config.ready){notice('NO SE PUDO CONECTAR.','Falta la configuración de conexión con Google.');return;}
    if(session?.current){receiptView(session.current);return;}
    if(config.phase!=='open'||!session){notice('RECEPCIÓN CERRADA.','Este enlace no acepta nuevos envíos.');if(session)addHistoryButton();return;}
    bindForm();
  }catch(error){$('#phase').textContent='SIN CONEXIÓN';notice(error.code==='UPDATE_REQUIRED'?'ACTUALIZACIÓN PENDIENTE.':'NO PUDIMOS CONECTAR.',error.message);}
}
window.addEventListener('pagehide',releasePhoto);
window.addEventListener('pageshow',event=>{if(event.persisted&&!['home','legal'].includes(page))location.reload();});
boot();
