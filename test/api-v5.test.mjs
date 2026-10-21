import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp,googleBridge } from '../server/app.mjs';
import { createDemoBackend } from '../scripts/demo.mjs';
import { DEFAULTS } from '../shared/settings.mjs';
import { createHmac } from 'node:crypto';
const env={BRIDGE_SECRET:'private-test-only-'.repeat(4),APPS_SCRIPT_URL:'https://script.google.com/macros/s/testing/exec',SITE_ORIGIN:'https://nyx.example'};
const clock=Date.parse('2026-10-21T14:00:00-06:00');
const jpeg=Buffer.from([255,216,255,192,0,17,8,0,10,0,10,3,1,17,0,2,17,0,3,17,0,255,218,0,8,1,1,0,0,63,0,0,255,217]);
function fixture(){
 const backend=createDemoBackend(),calls=[];
 const app=createApp({env,now:()=>clock,backend:async(...args)=>{calls.push(args);return backend(...args);}});
 async function who(){const r=await app(new Request(env.SITE_ORIGIN+'/api/bootstrap?enable=true'));return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json()).data.session};}
 const post=(route,w,data,headers={},query='?enable=true')=>app(new Request(env.SITE_ORIGIN+route+query,{method:'POST',headers:{origin:env.SITE_ORIGIN,cookie:w.cookie,'x-nyx-csrf':w.csrf,'content-type':'application/json',...headers},body:Buffer.isBuffer(data)?data:JSON.stringify(data)}));
 return {app,backend,calls,who,post};
}
const data={consent:true,termsVersion:DEFAULTS.termsVersion,enable_interaction:true,answer:'Una idea.',replacesReceipt:null};
const photoHeaders={'content-type':'image/jpeg','x-nyx-consent':'true','x-nyx-terms':DEFAULTS.termsVersion,'x-nyx-enable-interaction':'true'};
test('Texto: cancelar y reemplazar transmite los recibos correctos',async()=>{
 const f=fixture(),w=await f.who();const a=(await(await f.post('/api/answer',w,data)).json()).data.receipt;
 assert.equal((await f.post('/api/withdraw',w,{confirm:true,kind:'text',receipt:a})).status,200);
 const r=await f.post('/api/answer',w,{...data,answer:'La idea correcta.',replacesReceipt:a});assert.equal(r.status,200);
 const b=(await r.json()).data.receipt;assert.notEqual(a,b);assert.equal(f.calls.at(-1)[1].replacesReceipt,a);assert.equal(f.calls.at(-1)[1].enableInteraction,true);
 assert.equal((await f.post('/api/withdraw',w,{confirm:true,kind:'text',receipt:a})).status,409);
});
test('Foto binaria: reemplazo y anulación son selectivos',async()=>{
 const f=fixture(),w=await f.who();const txt=(await(await f.post('/api/answer',w,data)).json()).data.receipt;
 const a=(await(await f.post('/api/photo',w,jpeg,photoHeaders)).json()).data.receipt;
 await f.post('/api/withdraw',w,{confirm:true,kind:'photo',receipt:a});
 const r=await f.post('/api/photo',w,jpeg,{...photoHeaders,'x-nyx-replaces':a});assert.equal(r.status,200);assert.equal(f.calls.at(-1)[1].replacesReceipt,a);
 const status=await f.app(new Request(env.SITE_ORIGIN+'/api/session',{headers:{cookie:w.cookie}}));const state=(await status.json()).data;assert.equal(state.text.receipt,txt);assert.equal(state.photo.withdrawn,false);
});
test('Recibos inválidos no permiten inyectar fileId o actor',async()=>{
 const f=fixture(),w=await f.who();assert.equal((await f.post('/api/answer',w,{...data,replacesReceipt:'../secret'})).status,400);
 assert.equal((await f.post('/api/photo',w,jpeg,{...photoHeaders,'x-nyx-replaces':'id-de-drive'})).status,400);
 assert.equal((await f.post('/api/withdraw',w,{confirm:true,kind:'text',receipt:'mal'})).status,400);assert.equal(f.calls.length,0);
});
test('Bandera, consentimiento, origen, CSRF y cookie siguen obligatorios',async()=>{
 const f=fixture(),w=await f.who();assert.equal((await f.post('/api/answer',w,data,{},'')).status,410);
 assert.equal((await f.post('/api/answer',w,{...data,enable_interaction:false})).status,410);assert.equal((await f.post('/api/answer',w,{...data,consent:false})).status,400);
 assert.equal((await f.post('/api/answer',w,data,{origin:'https://other.example'})).status,403);assert.equal((await f.post('/api/answer',w,data,{'x-nyx-csrf':'bad'})).status,403);
 assert.equal((await f.post('/api/answer',w,data,{cookie:'bad'})).status,401);assert.equal(f.calls.length,0);
});
test('Reintento sin cancelar no crea otro aporte activo',async()=>{
 const f=fixture(),w=await f.who();const a=(await(await f.post('/api/answer',w,data)).json()).data,b=(await(await f.post('/api/answer',w,data)).json()).data;assert.equal(a.receipt,b.receipt);assert.equal(b.duplicate,true);
});
test('Otra sesión no puede anular un aporte por su recibo',async()=>{
 const f=fixture(),a=await f.who(),b=await f.who();const receipt=(await(await f.post('/api/answer',a,data)).json()).data.receipt;
 await f.post('/api/withdraw',b,{confirm:true,kind:'text',receipt});const status=(await(await f.app(new Request(env.SITE_ORIGIN+'/api/session',{headers:{cookie:a.cookie}}))).json()).data;assert.equal(status.text.receipt,receipt);assert.equal(status.text.withdrawn,false);
});
test('Recibos de reemplazo viajan dentro de la firma HMAC',async()=>{
 const before=globalThis.fetch;let checked=false;
 globalThis.fetch=async(url,options)=>{const e=JSON.parse(options.body);assert.equal(e.signature,createHmac('sha256',env.BRIDGE_SECRET).update(`${e.ts}.${e.nonce}.${e.payload}`).digest('hex'));const p=JSON.parse(Buffer.from(e.payload,'base64'));assert.equal(p.replacesReceipt,'NYX-'+'1'.repeat(32));checked=true;return new Response(JSON.stringify({ok:true,data:{receipt:'NYX-'+'2'.repeat(32)}}));};
 try{await googleBridge('submit',{kind:'photo',replacesReceipt:'NYX-'+'1'.repeat(32)},env);assert.ok(checked);}finally{globalThis.fetch=before;}
});
test('STALE de Google conserva el conflicto sin éxito falso',async()=>{
 const before=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,code:'STALE'}));try{await assert.rejects(googleBridge('withdrawOne',{kind:'text'},env),/STALE/);}finally{globalThis.fetch=before;}
});
